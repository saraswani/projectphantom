"""
Synthetic Screen-Layout Visual Dataset Generator for LightViT
Generates visual screen layout images and annotations representing the 6 primary page categories
aligned with `lib/decision/local-decision-engine.js` and `evaluation/visual-context/benchmark.js`.
"""

import os
import random
import numpy as np
from PIL import Image, ImageDraw

PAGE_CLASSES = [
    'AUTHENTICATION_LOGIN',
    'FORM_SUBMISSION',
    'DASHBOARD_ANALYTICS',
    'ARTICLE_DOCUMENTATION',
    'E_COMMERCE_CHECKOUT',
    'GENERAL_INTERACTIVE'
]

CLASS_TO_IDX = {c: i for i, c in enumerate(PAGE_CLASSES)}
IDX_TO_CLASS = {i: c for i, c in enumerate(PAGE_CLASSES)}

def render_login_page(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(15, 23, 42)) # Dark slate bg
    draw = ImageDraw.Draw(img)
    
    # Centered login card
    cx, cy = img_size // 2, img_size // 2
    cw, ch = int(img_size * 0.7), int(img_size * 0.75)
    card_box = [cx - cw//2, cy - ch//2, cx + cw//2, cy + ch//2]
    draw.rectangle(card_box, fill=(30, 41, 59), outline=(56, 189, 248), width=1)
    
    # Title bar / Logo
    draw.rectangle([cx - 20, card_box[1] + 8, cx + 20, card_box[1] + 16], fill=(56, 189, 248))
    
    # Username input field
    iy1 = card_box[1] + 28
    draw.rectangle([cx - cw//2 + 8, iy1, cx + cw//2 - 8, iy1 + 14], fill=(15, 23, 42), outline=(148, 163, 184))
    
    # Password input field
    iy2 = iy1 + 22
    draw.rectangle([cx - cw//2 + 8, iy2, cx + cw//2 - 8, iy2 + 14], fill=(15, 23, 42), outline=(148, 163, 184))
    
    # Submit button
    by = iy2 + 24
    draw.rectangle([cx - cw//2 + 8, by, cx + cw//2 - 8, by + 16], fill=(2, 132, 199))
    
    return img

def render_form_page(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(241, 245, 249)) # Light bg
    draw = ImageDraw.Draw(img)
    
    # Header bar
    draw.rectangle([8, 8, img_size - 8, 22], fill=(30, 41, 59))
    
    # Form fields grid (2 columns, 3 rows)
    margin = 12
    col_w = (img_size - margin * 3) // 2
    for r in range(3):
        y = 32 + r * 28
        # Col 1
        draw.rectangle([margin, y, margin + col_w, y + 14], fill=(255, 255, 255), outline=(148, 163, 184))
        # Col 2
        draw.rectangle([margin * 2 + col_w, y, margin * 2 + col_w * 2, y + 14], fill=(255, 255, 255), outline=(148, 163, 184))
    
    # Textarea full width
    y_text = 32 + 3 * 28
    draw.rectangle([margin, y_text, img_size - margin, y_text + 20], fill=(255, 255, 255), outline=(148, 163, 184))
    
    # Action button
    draw.rectangle([img_size - margin - 40, y_text + 26, img_size - margin, y_text + 40], fill=(16, 185, 129))
    return img

def render_dashboard_page(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(11, 15, 25))
    draw = ImageDraw.Draw(img)
    
    # Top navbar
    draw.rectangle([0, 0, img_size, 16], fill=(19, 27, 46))
    
    # Sidebar
    draw.rectangle([0, 16, 28, img_size], fill=(15, 23, 42))
    
    # 4 Metric / KPI Cards
    card_w = (img_size - 36) // 2
    for i in range(2):
        for j in range(2):
            x1 = 34 + j * (card_w + 4)
            y1 = 22 + i * 26
            draw.rectangle([x1, y1, x1 + card_w, y1 + 22], fill=(30, 41, 59), outline=(56, 189, 248), width=1)
            # Simulated mini-sparkline / metric
            draw.line([x1 + 4, y1 + 16, x1 + 14, y1 + 8, x1 + 24, y1 + 12, x1 + card_w - 4, y1 + 6], fill=(52, 211, 153), width=1)
    
    # Large Chart / Data Grid at bottom
    draw.rectangle([34, 80, img_size - 6, img_size - 8], fill=(19, 27, 46), outline=(71, 85, 105))
    # Grid rows
    for row in range(4):
        ry = 88 + row * 16
        draw.line([36, ry, img_size - 8, ry], fill=(51, 65, 85), width=1)
        
    return img

def render_article_page(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    
    # Article headline
    draw.rectangle([16, 14, img_size - 24, 26], fill=(15, 23, 42))
    # Subtitle
    draw.rectangle([16, 32, int(img_size * 0.65), 38], fill=(100, 116, 139))
    
    # Paragraph lines (dense horizontal text strips)
    y = 50
    while y < img_size - 16:
        line_w = random.randint(int(img_size * 0.5), img_size - 32)
        draw.rectangle([16, y, 16 + line_w, y + 4], fill=(203, 213, 225))
        y += 8
        if y % 32 == 0 and y < img_size - 30:
            # Inline figure / quote block
            draw.rectangle([16, y, img_size - 16, y + 16], fill=(241, 245, 249), outline=(226, 232, 240))
            y += 20
            
    return img

def render_ecommerce_page(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(248, 250, 252))
    draw = ImageDraw.Draw(img)
    
    # Search / header bar
    draw.rectangle([8, 6, img_size - 8, 20], fill=(255, 255, 255), outline=(203, 213, 225))
    draw.rectangle([12, 10, 30, 16], fill=(234, 88, 12)) # Brand badge
    
    # Product Cards (2x2 Grid)
    pw = (img_size - 24) // 2
    ph = 56
    for i in range(2):
        for j in range(2):
            x1 = 8 + j * (pw + 8)
            y1 = 28 + i * (ph + 8)
            # Product card
            draw.rectangle([x1, y1, x1 + pw, y1 + ph], fill=(255, 255, 255), outline=(226, 232, 240))
            # Product image area
            draw.rectangle([x1 + 4, y1 + 4, x1 + pw - 4, y1 + 32], fill=(224, 231, 255))
            # Price line & Buy button
            draw.rectangle([x1 + 4, y1 + 36, x1 + 24, y1 + 42], fill=(220, 38, 38))
            draw.rectangle([x1 + pw - 24, y1 + 44, x1 + pw - 4, y1 + 52], fill=(249, 115, 22))
            
    return img

def render_general_interactive(img_size=160):
    img = Image.new('RGB', (img_size, img_size), color=(241, 245, 249))
    draw = ImageDraw.Draw(img)
    
    # Hero banner
    draw.rectangle([8, 8, img_size - 8, 50], fill=(79, 70, 229))
    draw.rectangle([16, 16, int(img_size * 0.6), 28], fill=(255, 255, 255))
    draw.rectangle([16, 34, 48, 44], fill=(244, 63, 94))
    
    # 3 Column cards
    cw = (img_size - 28) // 3
    for c in range(3):
        x1 = 8 + c * (cw + 6)
        draw.rectangle([x1, 66, x1 + cw, 120], fill=(255, 255, 255), outline=(203, 213, 225))
        draw.rectangle([x1 + 4, 70, x1 + cw - 4, 86], fill=(226, 232, 240))
        draw.rectangle([x1 + 4, 92, x1 + cw - 4, 96], fill=(148, 163, 184))
        draw.rectangle([x1 + 4, 104, x1 + cw - 12, 114], fill=(99, 102, 241))
        
    # Footer
    draw.rectangle([8, 130, img_size - 8, 152], fill=(15, 23, 42))
    return img

RENDERERS = {
    'AUTHENTICATION_LOGIN': render_login_page,
    'FORM_SUBMISSION': render_form_page,
    'DASHBOARD_ANALYTICS': render_dashboard_page,
    'ARTICLE_DOCUMENTATION': render_article_page,
    'E_COMMERCE_CHECKOUT': render_ecommerce_page,
    'GENERAL_INTERACTIVE': render_general_interactive
}

def generate_sample(img_size=160, category=None):
    if category is None or category not in RENDERERS:
        category = random.choice(PAGE_CLASSES)
    
    renderer = RENDERERS[category]
    img = renderer(img_size)
    
    # Apply minor data augmentation (noise & slight color shifts)
    arr = np.array(img, dtype=np.float32)
    noise = np.random.normal(0, 3.0, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    
    label_idx = CLASS_TO_IDX[category]
    return img, label_idx, category

def generate_synthetic_dataset(samples_per_class=20, img_size=160):
    images = []
    labels = []
    for cat in PAGE_CLASSES:
        for _ in range(samples_per_class):
            img, label_idx, _ = generate_sample(img_size=img_size, category=cat)
            images.append(np.array(img, dtype=np.float32) / 255.0)
            labels.append(label_idx)
    return np.array(images).transpose(0, 3, 1, 2), np.array(labels)

