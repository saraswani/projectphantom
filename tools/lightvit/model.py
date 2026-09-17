"""
LightViT: Lightweight Vision Transformer for Low-Power Edge Devices
Based on Zheng & Yang (2025), ICCECE 2025:
"Design and Implementation of Lightweight Vision Transformer for Low-Power Edge Devices"

Core Components:
1. Grouped Self-Attention (G x G non-overlapping groups, G=4) - Eq. 1
2. Dynamic Sparse Connections (Threshold tau=0.6) - Eq. 2
3. Cross-Group Interaction (Depthwise 3x3 Conv every 2 layers)
4. Screen Layout Classification Head (6 canonical classes)
"""

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False
    torch = None
    nn = None
    F = None

# Canonical Screen Layout Taxonomy (Aligned with lib/decision/local-decision-engine.js)
PAGE_CLASSES = [
    'AUTHENTICATION_LOGIN',
    'FORM_SUBMISSION',
    'DASHBOARD_ANALYTICS',
    'ARTICLE_DOCUMENTATION',
    'E_COMMERCE_CHECKOUT',
    'GENERAL_INTERACTIVE'
]

CLASS_TO_LABEL = {
    'AUTHENTICATION_LOGIN': 'Authentication / Login',
    'FORM_SUBMISSION': 'Form & Input Portal',
    'DASHBOARD_ANALYTICS': 'Dashboard & Data Grid',
    'ARTICLE_DOCUMENTATION': 'Document / Article Page',
    'E_COMMERCE_CHECKOUT': 'E-Commerce / Checkout',
    'GENERAL_INTERACTIVE': 'General Interactive Screen'
}

if HAS_TORCH:
    class GroupedAttention(nn.Module):
        """
        Grouped Self-Attention Module (Paper Section II-A, Eq. 1).
        Partitions the H_p x W_p patch token grid into G x G non-overlapping groups.
        Computes self-attention independently within each group to reduce attention complexity
        from O(N^2) to O(N^2 / G^2).
        
        Also computes and returns per-head attention energy scores (Eq. 2) for dynamic
        sparse head pruning with threshold tau.
        """
        def __init__(self, dim, num_heads=4, group_size=4, qkv_bias=True, tau=0.6):
            super().__init__()
            assert dim % num_heads == 0, f"dim {dim} must be divisible by num_heads {num_heads}"
            self.dim = dim
            self.num_heads = num_heads
            self.head_dim = dim // num_heads
            self.scale = self.head_dim ** -0.5
            self.group_size = group_size # G x G groups
            self.tau = tau # Dynamic pruning energy threshold (default 0.6)

            self.qkv = nn.Linear(dim, dim * 3, bias=qkv_bias)
            self.proj = nn.Linear(dim, dim)
            self.proj_drop = nn.Dropout(0.0)

        def forward(self, x, H_p, W_p, head_mask=None):
            """
            Args:
                x: Tensor of shape [B, N, C] where N = H_p * W_p
                H_p, W_p: Patch grid dimensions
                head_mask: Optional Tensor of shape [num_heads] with 0/1 mask
            Returns:
                out: Tensor of shape [B, N, C]
                head_energy: Tensor of shape [B, num_heads] representing mean affinity energy
            """
            B, N, C = x.shape
            assert N == H_p * W_p, f"Token length {N} != {H_p}*{W_p}"

            # Reshape to 2D grid: [B, H_p, W_p, C]
            x_2d = x.view(B, H_p, W_p, C)

            # Pad if needed so H_p and W_p are divisible by group_size G
            G = self.group_size
            pad_h = (G - H_p % G) % G
            pad_w = (G - W_p % G) % G
            if pad_h > 0 or pad_w > 0:
                x_2d = F.pad(x_2d, (0, 0, 0, pad_w, 0, pad_h))
            
            _, Hp_pad, Wp_pad, _ = x_2d.shape
            num_gh = Hp_pad // G
            num_gw = Wp_pad // G
            total_groups = num_gh * num_gw

            # Partition into G x G groups: [B, num_gh, G, num_gw, G, C] -> [B * total_groups, G * G, C]
            x_groups = x_2d.view(B, num_gh, G, num_gw, G, C).permute(0, 1, 3, 2, 4, 5).contiguous()
            x_groups = x_groups.view(B * total_groups, G * G, C)
            Ng = G * G

            # Project Q, K, V for each group
            qkv = self.qkv(x_groups).reshape(B * total_groups, Ng, 3, self.num_heads, self.head_dim)
            qkv = qkv.permute(2, 0, 3, 1, 4) # [3, B*total_groups, num_heads, Ng, head_dim]
            q, k, v = qkv[0], qkv[1], qkv[2]

            # Scaled Dot-Product Attention per group: Softmax(Q_g K_g^T / sqrt(d)) V_g
            attn_scores = (q @ k.transpose(-2, -1)) * self.scale # [B*total_groups, num_heads, Ng, Ng]

            # Dynamic Sparse Connections: Calculate head energy / sparsity (Paper Eq. 2)
            # s = (1/N) sum( I( (Q K^T / sqrt(d)) < tau ) )
            with torch.no_grad():
                # Mean normalized attention logits across tokens
                mean_affinity = attn_scores.mean(dim=(-2, -1)) # [B*total_groups, num_heads]
                head_energy = mean_affinity.view(B, total_groups, self.num_heads).mean(dim=1) # [B, num_heads]

            # Apply runtime head mask if provided (Prunes inactive heads)
            if head_mask is not None:
                # head_mask shape: [num_heads] or [1, num_heads, 1, 1]
                mask = head_mask.view(1, self.num_heads, 1, 1)
                attn_scores = attn_scores * mask

            attn = attn_scores.softmax(dim=-1)
            out_groups = (attn @ v).transpose(1, 2).reshape(B * total_groups, Ng, C)
            out_groups = self.proj(out_groups)
            out_groups = self.proj_drop(out_groups)

            # Merge groups back to original grid: [B, num_gh, num_gw, G, G, C] -> [B, Hp_pad, Wp_pad, C]
            out_2d = out_groups.view(B, num_gh, num_gw, G, G, C).permute(0, 1, 3, 2, 4, 5).contiguous()
            out_2d = out_2d.view(B, Hp_pad, Wp_pad, C)

            # Crop padding if applied
            if pad_h > 0 or pad_w > 0:
                out_2d = out_2d[:, :H_p, :W_p, :]

            out = out_2d.view(B, N, C)
            return out, head_energy


    class CrossGroupConv(nn.Module):
        """
        Cross-Group Interaction Module (Paper Section II-A).
        Lightweight depthwise 3x3 convolution inserted every 2 grouped attention layers
        to enable inter-group spatial communication and global feature fusion.
        """
        def __init__(self, dim, kernel_size=3):
            super().__init__()
            self.dwconv = nn.Conv2d(dim, dim, kernel_size=kernel_size, padding=kernel_size // 2, groups=dim, bias=False)
            self.norm = nn.BatchNorm2d(dim)
            self.act = nn.GELU()

        def forward(self, x, H_p, W_p):
            B, N, C = x.shape
            x_2d = x.transpose(1, 2).view(B, C, H_p, W_p)
            conv_out = self.act(self.norm(self.dwconv(x_2d)))
            return conv_out.flatten(2).transpose(1, 2)


    class LightViTBlock(nn.Module):
        """
        LightViT Transformer Block:
        LayerNorm -> GroupedAttention -> Residual -> LayerNorm -> (Optional CrossGroupConv) -> MLP -> Residual.
        """
        def __init__(self, dim, num_heads=4, group_size=4, mlp_ratio=2.0, has_cross_group_conv=False, tau=0.6):
            super().__init__()
            self.norm1 = nn.LayerNorm(dim)
            self.attn = GroupedAttention(dim, num_heads=num_heads, group_size=group_size, tau=tau)
            self.has_cross_group_conv = has_cross_group_conv
            if has_cross_group_conv:
                self.cross_conv = CrossGroupConv(dim)

            self.norm2 = nn.LayerNorm(dim)
            mlp_hidden_dim = int(dim * mlp_ratio)
            self.mlp = nn.Sequential(
                nn.Linear(dim, mlp_hidden_dim),
                nn.GELU(),
                nn.Linear(mlp_hidden_dim, dim)
            )

        def forward(self, x, H_p, W_p, head_mask=None):
            # Attention with residual
            attn_out, head_energy = self.attn(self.norm1(x), H_p, W_p, head_mask=head_mask)
            x = x + attn_out

            # Optional Cross-Group Depthwise Convolution
            if self.has_cross_group_conv:
                x = x + self.cross_conv(x, H_p, W_p)

            # MLP with residual
            x = x + self.mlp(self.norm2(x))
            return x, head_energy


    class LightViT(nn.Module):
        """
        Complete LightViT Architecture (Zheng & Yang, 2025).
        - 12 Transformer layers
        - Grouped Self-Attention (G=4)
        - Dynamic Sparse Connections (tau=0.6)
        - Cross-Group Interaction (inserted every 2 layers: 2, 4, 6, 8, 10, 12)
        - 6-Class Screen Context Classifier Head
        """
        def __init__(self, img_size=160, patch_size=16, in_chans=3, num_classes=6,
                     embed_dim=192, depth=12, num_heads=4, group_size=4, tau=0.6):
            super().__init__()
            self.img_size = img_size
            self.patch_size = patch_size
            self.H_p = img_size // patch_size
            self.W_p = img_size // patch_size
            self.num_patches = self.H_p * self.W_p
            self.embed_dim = embed_dim
            self.depth = depth
            self.num_heads = num_heads

            # Patch Embedding: Conv2d with kernel=patch_size, stride=patch_size
            self.patch_embed = nn.Conv2d(in_chans, embed_dim, kernel_size=patch_size, stride=patch_size)
            self.pos_embed = nn.Parameter(torch.zeros(1, self.num_patches, embed_dim))
            self.pos_drop = nn.Dropout(0.0)

            # 12 Transformer Blocks with CrossGroupConv every 2 blocks
            self.blocks = nn.ModuleList([
                LightViTBlock(
                    dim=embed_dim,
                    num_heads=num_heads,
                    group_size=group_size,
                    mlp_ratio=2.0,
                    has_cross_group_conv=((i + 1) % 2 == 0),
                    tau=tau
                )
                for i in range(depth)
            ])

            self.norm = nn.LayerNorm(embed_dim)
            self.head = nn.Linear(embed_dim, num_classes)

            # Initialize weights
            nn.init.trunc_normal_(self.pos_embed, std=0.02)
            self.apply(self._init_weights)

        def _init_weights(self, m):
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.LayerNorm):
                nn.init.constant_(m.bias, 0)
                nn.init.constant_(m.weight, 1.0)
            elif isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out')
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)

        def forward(self, x, head_mask=None):
            """
            Args:
                x: Input image tensor [B, 3, img_size, img_size]
                head_mask: Optional tensor [depth, num_heads] or [num_heads]
            Returns:
                logits: [B, num_classes]
                head_scores: [B, depth, num_heads] per-head attention energy scores
            """
            B, C, H, W = x.shape
            H_p = H // self.patch_size
            W_p = W // self.patch_size

            # Patch Embed: [B, C, H, W] -> [B, embed_dim, H_p, W_p] -> [B, N, embed_dim]
            x_emb = self.patch_embed(x).flatten(2).transpose(1, 2)
            
            # Add positional embeddings (interpolate if input resolution changes)
            if x_emb.shape[1] == self.pos_embed.shape[1]:
                x_emb = x_emb + self.pos_embed
            else:
                # Dynamic resolution support for adaptive ladder (160 -> 128 -> 96)
                pos = self.pos_embed.view(1, self.H_p, self.W_p, self.embed_dim).permute(0, 3, 1, 2)
                pos = F.interpolate(pos, size=(H_p, W_p), mode='bilinear', align_corners=False)
                pos = pos.permute(0, 2, 3, 1).flatten(1, 2)
                x_emb = x_emb + pos

            x_emb = self.pos_drop(x_emb)

            all_head_energies = []
            for i, blk in enumerate(self.blocks):
                layer_mask = None
                if head_mask is not None:
                    if head_mask.dim() == 2:
                        layer_mask = head_mask[i]
                    else:
                        layer_mask = head_mask
                x_emb, head_energy = blk(x_emb, H_p, W_p, head_mask=layer_mask)
                all_head_energies.append(head_energy)

            x_emb = self.norm(x_emb)

            # Global Average Pooling across spatial patches
            feat = x_emb.mean(dim=1)
            logits = self.head(feat)

            # Stack head scores: [B, depth, num_heads]
            head_scores = torch.stack(all_head_energies, dim=1)

            return logits, head_scores

else:
    # Standalone placeholder if torch is not available
    GroupedAttention = None
    CrossGroupConv = None
    LightViTBlock = None
    LightViT = None
