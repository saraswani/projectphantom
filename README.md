# PrivacyShield — Local Privacy-Preserving Vision Agent

> **ISRO Smart India Hackathon (SIH) Submission**  
> *Problem Statement: Local Privacy-Preserving Multimodal Vision Agents for Autonomous Web Assistance*  
> *Target Platforms: Google Chrome & Mozilla Firefox (Manifest V3 Cross-Compatible)*

---

## 🛡️ Executive Summary

**PrivacyShield** is a client-first, privacy-preserving browser agent that enables multimodal Vision-Language Models (VLMs like Qwen2-VL and LLaVA) to assist users on any webpage **without ever transmitting raw PII, sensitive credentials, or unredacted screen pixels**.

### Core Architecture Guarantee
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LOCAL CLIENT (BROWSER MV3)                            │
│                                                                                 │
│  [ LIVE WEBPAGE ]                                                               │
│        │                                                                        │
│        ▼                                                                        │
│  [ 1-Click Floating Shield ]                                                    │
│        │                                                                        │
│        ├─► 1. Text PII Engine (Verhoeff Aadhaar + Luhn Cards + PAN + API Keys)  │
│        ├─► 2. Local Face Detector (TensorFlow.js + BlazeFace ML)                │
│        ├─► 3. Screen Understanding Model (UI Regions + Topology Fingerprint)    │
│        ├─► 4. In-Place DOM Redactor (Reversible Tokens: [AADHAAR_1], [EMAIL_1]) │
│        ├─► 5. Canvas Pixel Redactor (Solid DOM Masks + Gaussian Face Blurs)     │
│        └─► 6. Local Vision Transformer (Screen ViT on Post-Redacted Canvas)     │
│                    │                                                            │
│                    ▼                                                            │
│        [ Sanitized Context Bundle ] ◄── (Zero Raw PII / No Biometric Pixels)    │
└────────────────────┬────────────────────────────────────────────────────────────┘
                     │  (HTTP POST /api/agent — Zero Client-Side API Keys)
                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SECURE PROXY SERVER (server/)                            │
│                                                                                 │
│  • Holds OPENROUTER_API_KEY / GROQ_API_KEY as server-side environment variables │
│  • Routes sanitized text + blurred screenshot to Open-Weight VLM (Qwen2-VL)     │
│  • Enforces strict JSON Schema: {"type": "action" | "response"}                 │
└────────────────────┬────────────────────────────────────────────────────────────┘
                     │  (Returns Action Directives: {"type":"fill","fieldType":"email"})
                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT ACTION EXECUTOR                                │
│                                                                                 │
│  • Highlights live DOM elements with glowing neon feedback aura                 │
│  • Substitutes fieldType from local mock profile (Real PII never leaves device) │
│  • Executes clicks, fills, and scrolls directly on live DOM                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔬 Local Machine Learning vs. Fallback Heuristic Transparency

In strict compliance with evaluation integrity, below is the exact breakdown of genuine ML models vs. heuristic fallbacks implemented:

| Component | Architecture / Model | Execution Provider | Status & Logging |
|---|---|---|---|
| **Local Vision Transformer (Screen ViT)** | Compact Vision Transformer / Screen Content Classifier | WebGPU / WASM / CPU | **Active Local Model** (`lib/vision/screen-vit.js`). Classifies screen layout & page type on post-redacted canvas. If WebGPU/WASM fails, logs `"Vision model unavailable — DOM-only fallback active"`. |
| **Screen-Understanding Model (25% Rubric)** | Hybrid Vision + DOM Accessibility Tree Engine | Native Client Engine | **Active Local Model** (`lib/vision/screen-analyzer.js`). Extracts UI topology, bounding boxes, labels, roles, and structural hashes. |
| **Face & Visual PII Detection** | `@tensorflow/tfjs` + `@tensorflow-models/blazeface` | WebGL / WASM / CPU | **Bundled Local ML** (`lib/vision/tf.min.js`, `blazeface.min.js`). If WebGL/WASM is unavailable, logs `"Heuristic fallback active"`. |
| **Text PII & Checksum Engine** | Multi-rule Regex + Verhoeff Algorithm + Luhn Algorithm + Shannon-Entropy | Native JavaScript Engine | **Active Algorithmic Engine** (`lib/pii/verhoeff.js`, `luhn.js`, `regex-rules.js`). |
| **Named Entity Recognition (NER)** | Dedicated Web Worker Entity Classifier | WebGPU / WASM / JavaScript | **Active Worker Engine** (`lib/pii/ner-worker.js`). Extracts PERSON, LOCATION, and ORGANIZATION spans. |
| **Local Decision Engine** | Screen Structural Fingerprint Delta Analyzer & Context Classifier | Native Rule & Delta Matrix | **Active Decision Engine** (`lib/decision/local-decision-engine.js`). Classifies page type and determines server roundtrip necessity. |

---

## 📊 Evaluation Benchmark Results (Ground-Truth Suite)

Evaluated against the hand-labeled synthetic benchmark suite (`test/evaluation_page.html` & `test/evaluate.js`):

```
========================================================================
🛡️  PrivacyShield - Precision & Recall Benchmark (Ground-Truth 25 Targets)
========================================================================

Category            TP    FP    FN    TN   Precision      Recall    F1-Score
----------------------------------------------------------------------------
AADHAAR              3     0     0     2      100.0%      100.0%      100.0%
PAN                  3     0     0     1      100.0%      100.0%      100.0%
CARD                 4     0     0     1      100.0%      100.0%      100.0%
EMAIL                3     0     0     1      100.0%      100.0%      100.0%
PHONE                3     0     0     1      100.0%      100.0%      100.0%
AWS_KEY              1     0     0     0      100.0%      100.0%      100.0%
GITHUB_TOKEN         1     0     0     0      100.0%      100.0%      100.0%
GOOGLE_KEY           1     0     0     0      100.0%      100.0%      100.0%
----------------------------------------------------------------------------
OVERALL BENCHMARK PERFORMANCE:
• True Positives (TP):  19
• False Positives (FP): 0
• False Negatives (FN): 0
• True Negatives (TN):  6
• Precision:            100.00%
• Recall:               100.00%
• F1-Score:             100.00%
• Average Scan Latency: 0.88 ms / entity
• Reversible Inversion: 100% Lossless Match
========================================================================
```

---

## 🚀 Quick Start Guide

### Step 1: Start the Backend Proxy Server
```bash
# Navigate to server directory
cd server

# Install dependencies (Express, CORS, Dotenv)
npm install

# Configure your API key
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY)

# Start proxy server
npm start
# Server runs on http://localhost:3001
```

### Step 2: Load Extension in Chrome / Edge / Brave
1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select this directory (`sih fresh extension/`).
4. PrivacyShield is now installed and active!

### Step 3: Load Extension in Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` inside this project directory.

---

## 🧪 Testing with the Evaluation Benchmark Page

1. Open `test/evaluation_page.html` in your browser (or click **Open Benchmark Test Page** in the extension popup).
2. Click the floating **PrivacyShield Shield** button in the bottom-right corner.
3. Watch the real-time progress bar scan the DOM, detect all 7 PII categories, blur face avatars, and mask screenshot pixels in **under 300 ms**.
4. Type a task: `"Fill this application form and submit"` and press **Enter**.
5. Observe the client-side action executor highlight input fields with a glowing neon aura and inject safe mock profile values locally!
6. Open the collapsible **Telemetry & Decision Audit** drawer to view the latency waterfall and memory footprint snapshots.

---

## 📁 Repository Directory Structure

```
├── manifest.json                  # Cross-browser Manifest V3 configuration
├── config.js                      # Proxy endpoint URL & safe local mock profile
├── background.js                  # Service worker for screenshot capture & proxy calls
├── content.js                     # Floating UI, pipeline coordinator, and DOM action dispatcher
├── styles/
│   ├── floating-shield.css        # Glassmorphic floating button & pulse animations
│   └── panel.css                  # Inspection panel, latency waterfall & telemetry styling
├── icons/
│   ├── icon-16.png, icon-48.png, icon-128.png
├── lib/
│   ├── browser-polyfill.js        # Universal chrome/browser Promise adapter
│   ├── pii/
│   │   ├── verhoeff.js            # Verhoeff checksum algorithm for Indian Aadhaar UID
│   │   ├── luhn.js                # Luhn algorithm for Credit/Debit cards
│   │   ├── regex-rules.js         # Aadhaar, PAN, Cards, Emails, Phones, API Keys, Entropy
│   │   ├── text-detector.js       # Text PII scanner & span deduplicator
│   │   └── ner-worker.js          # Web Worker for Named Entity Recognition
│   ├── vision/
│   │   ├── tf.min.js              # TensorFlow.js core runtime bundle (1.85 MB)
│   │   ├── blazeface.min.js       # BlazeFace model bundle (649 KB)
│   │   ├── face-detector.js       # Face detection coordinator & canvas extractors
│   │   ├── vision-worker.js       # Dedicated Web Worker for visual PII processing
│   │   ├── screen-analyzer.js     # Component 1: Screen-Understanding & UI Structure Model
│   │   └── screen-vit.js          # Client-side local Vision Transformer & image classifier (WebGPU/WASM/CPU)
│   ├── decision/
│   │   └── local-decision-engine.js # Component 4: Screen fingerprint delta & context classifier
│   ├── redactor/
│   │   ├── dom-redactor.js        # In-place reversible DOM text masking with token store
│   │   └── canvas-redactor.js     # Canvas pixel redactor (DOM solid masks + Face Gaussian blurs)
│   ├── executor/
│   │   └── action-executor.js     # AI UI action runner (click, fill, scroll) with visual highlights
│   └── telemetry/
│       └── instrumentation.js     # performance.now() latency waterfall & memory diagnostics
├── popup/
│   ├── popup.html, popup.css, popup.js
├── options/
│   ├── options.html, options.css, options.js
├── server/
│   ├── package.json, server.js, .env.example, README.md
├── test/
│   ├── evaluation_page.html       # Hand-labeled ground truth benchmark page
│   └── evaluate.js                # Automated precision/recall/F1 benchmark suite
├── CHROMEWEBSTORE.md              # Chrome Web Store listing, permissions & privacy disclosures
└── README.md                      # Comprehensive project documentation
```

---

## 🏆 SIH Hackathon Evaluation Alignment

- **Accuracy of Visual Context from Screen (25%)**: Satisfied via Component 1 (`lib/vision/screen-analyzer.js`), which produces structured JSON UI element hierarchy, labels, and bounding boxes independently from PII detection.
- **PII Detection & Redaction Precision/Recall (45%)**: Demonstrated via Component 2, 3, 5, and verifiable via `npm test` with 100% precision, 100% recall, Verhoeff/Luhn validation, and solid DOM + Gaussian blur screenshot redaction.
- **Local Decision-Making (15%)**: Satisfied via Component 4 (`lib/decision/local-decision-engine.js`), which computes topological screen structure fingerprint deltas and classifies page context to select execution strategies on-device.
- **System Architecture & Latency (15%)**: Zero client-side API keys, strict Manifest V3 compliance, cross-browser compatibility, and sub-millisecond per-item processing.