# Visual Context & Screen-Layout Dataset Specification

This dataset specification documents the screen-layout evaluation and training dataset used by **Phantom AI's Screen ViT** (`lib/vision/screen-vit.js` / `tools/lightvit/`) aligned with the ISRO SIH Problem Statement: *"On-device Visual Perception for Light-weight Browser Agents"*.

---

## 1. Screen Taxonomy & Category Mapping

The dataset is partitioned into the **6 canonical page-type categories** recognized by `lib/decision/local-decision-engine.js` and `evaluation/visual-context/benchmark.js`:

| Category Constant | Internal ID | Visual Description | Distinctive DOM/Visual Features |
| :--- | :--- | :--- | :--- |
| `AUTHENTICATION_LOGIN` | `auth_login` | Authentication & Login Portals | Centered card, password inputs, submit CTA button, low background luminance |
| `FORM_SUBMISSION` | `form_portal` | Multi-field Input Forms | High input field density (>=3 fields), 2-column grid, submit button |
| `DASHBOARD_ANALYTICS` | `dashboard_analytics` | Data Dashboards & Tables | Tabular grids (`<table>`, `[role="grid"]`), charts, high edge variance |
| `ARTICLE_DOCUMENTATION` | `document_reader` | Documentation & Articles | High typography density, prose blocks, low interactive input count, low edge variance |
| `E_COMMERCE_CHECKOUT` | `e_commerce` | Product & Checkout Pages | Product card grids, price badges, cart/checkout CTAs, thumbnail images |
| `GENERAL_INTERACTIVE` | `media_feed` | General Interactive Feeds | Hero banners, mixed 3-column media cards, diverse controls |

---

## 2. Generation Methodology (`tools/lightvit/dataset.py`)

Due to the absence of publicly redistributable raw client screen captures with user PII, a synthetic deterministic screen rendering pipeline was developed in `tools/lightvit/dataset.py`:

1. **Procedural Rendering**:
   - Uses Pillow (`PIL.Image`, `PIL.ImageDraw`) to render high-fidelity 160x160 RGB screen layouts.
   - Accurately renders structural UI geometries (containers, form cards, navigation bars, button fills, input border strokes, tables, hero grids).
2. **Realistic Color Palettes**:
   - Modern Tailwind / Slate design tokens matching real web apps.
   - Dark theme for authentication portals (`#0f172a`, `#1e293b`).
   - Clean light backgrounds for forms and articles (`#f8fafc`, `#f1f5f9`).
3. **Data Augmentation**:
   - Injected Gaussian noise ($\mu=0, \sigma=3.0$).
   - Layout jitter and variable component coordinates.
   - Resolution scaling across the 160px $\to$ 128px $\to$ 96px adaptive ladder.
4. **Hardware Calibration**:
   - Used for INT8 quantization calibration minimizing Mean Squared Error (MSE) per Zheng & Yang (2025) Equations 3–4:
     $$\alpha = \frac{W_{\max} - W_{\min}}{255}, \quad \beta = W_{\min}$$

---

## 3. Ground-Truth Annotated DOM Dataset

In addition to synthetic pixel images for ViT training, `evaluation/datasets/visual-context/` provides:
- `ground-truth-page.html`: Comprehensive mock page containing all 13 standard browser UI element categories.
- `ground-truth.json`: Exact selector annotations for all 44 ground-truth elements across:
  `buttons`, `links`, `text_nodes`, `input_fields`, `checkboxes`, `radio_buttons`, `menus`, `cards`, `tables`, `images`, `forms`, `navigation`, and `dialogs`.

---

## 4. Measurement & Verification Integrity

- **Measured Metrics**: All latency numbers (P95, median, mean), memory peak heap, file sizes, and test execution outcomes are measured in real time on this machine using Node `perf_hooks` and `process.memoryUsage()`.
- **Estimated / Reference Metrics**: Jetson Nano / Coral TPU FPS/Watt figures in technical reports are cited directly from Zheng & Yang (2025) ICCECE edge hardware experiments.
