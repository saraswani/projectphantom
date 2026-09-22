# Project Phantom

> What shouldn't be seen, disappears.

Project Phantom is an on-device privacy filter and browser automation extension developed for Smart India Hackathon 2026 (Problem Statement 26171: "On-device Visual Perception for Light-weight Browser Agents"). When browser automation agents interact with web pages, sending raw screenshots and DOM text to cloud vision-language models exposes sensitive citizen data, credentials, and biometric faces. Phantom detects and redacts personal identifiable information (PII), credentials, and faces locally on the client machine before any data leaves the browser, allowing remote vision models to reason about page structure without receiving raw sensitive values.

Team: SuperORIX  
Team ID: 142011  
Problem Statement: PS 26171  
License: MIT  

---

## 1. How It Works

The system operates across a seven-stage local pipeline before transmitting sanitized context to the backend model:

1. Screen capture: The extension captures the visible tab viewport using `chrome.tabs.captureVisibleTab`.
2. Local perception models: The client runs on-device models directly inside the browser process:
   - BlazeFace (TensorFlow.js / WebGL) detects human faces and profile photos on the rendered canvas.
   - Tesseract.js (WebAssembly) performs client-side OCR for text embedded within images and document uploads.
   - Rule-based token classification and ONNX NER scan text content for named entities.
   - Regex and checksum validation engines verify structured identifiers (Aadhaar, payment cards, PAN).
   - ScreenViT (quantized MobileViT-XXS executing via ONNX Runtime Web using WebAssembly SIMD) classifies page layout and interactive UI element topology.
3. Local redaction: Sensitive content is masked directly in the DOM and on the captured screenshot canvas. Faces are blurred with a Gaussian filter, password fields are blacked out, and sensitive text is replaced with deterministic semantic placeholders such as `[EMAIL_1]`, `[AADHAAR_1]`, and `[CARD_1]`.
4. Privacy gate inspection: The outbound payload passes through an on-device privacy gate (`lib/privacy/privacy-gate.js`). The gate scans the prepared payload with a secondary regex pass to ensure no unmasked PII, plain text passwords, or raw images are present. If any raw sensitive entity is detected or if model confidence falls below 0.60, network transmission is blocked.
5. Secure server transmission: Only the sanitized text, tokenized element tree, and pixel-redacted screenshot are sent to the backend proxy server (`server/server.js`) via HTTP POST. The server routes requests to Google Gemini (primary) or Qwen2-VL via OpenRouter (fallback).
6. Structured action response: The server model returns a strict JSON action directive specifying the target element and the semantic field type to fill (for example, `{"action": "fill", "selector": "#email", "fieldType": "email"}`).
7. Local execution: The client action executor (`lib/executor/action-executor.js`) validates the directive against an action allowlist and populates the field locally using a user-controlled local mock profile. Real PII values are never transmitted to the server.

### Why Semantic Placeholders Matter

Replacing sensitive values with semantic placeholders rather than generic blank masks enables the server-side vision-language model to retain contextual understanding. The model can determine that a form requires an email address, a mobile number, and a national identity number because it sees `[EMAIL_1]`, `[PHONE_1]`, and `[AADHAAR_1]` in the relevant input labels. It can generate correct filling instructions without ever observing the user's actual email, phone number, or identity card.

### System Architecture

```
+-----------------------------------------------------------------------------------------+
|                               LOCAL BROWSER CLIENT (MV3)                                |
|                                                                                         |
|   [ Webpage DOM ] ──────────────────> [ Viewport Capture ]                              |
|          |                                     |                                        |
|          v                                     v                                        |
|   +-----------------------+             +-----------------------+                       |
|   | UI Topology Detector  |             | BlazeFace Detector    |                       |
|   | 13 UI Element Classes |             | Local Face Detection  |                       |
|   | MobileViT-XXS (WASM)  |             | Canvas Bounding Boxes |                       |
|   +-----------+-----------+             +-----------+-----------+                       |
|               |                                     |                                   |
|               +──────────────────+──────────────────+                                   |
|                                  |                                                      |
|                                  v                                                      |
|               +-------------------------------------+                                   |
|               | PII Detection & Tokenization Engine |                                   |
|               | Text Detector, Verhoeff, Luhn       |                                   |
|               | Reversible Token Store              |                                   |
|               +------------------+------------------+                                   |
|                                  |                                                      |
|                                  v                                                      |
|               +-------------------------------------+                                   |
|               | In-Place Canvas & DOM Redactor      |                                   |
|               | Solid Element Masks, Face Blur      |                                   |
|               +------------------+------------------+                                   |
|                                  |                                                      |
|                                  v                                                      |
|               +-------------------------------------+                                   |
|               | Privacy Gate (lib/privacy-gate.js)  |                                   |
|               | Hard Block on Raw PII or Conf < 0.60|                                   |
|               +------------------+------------------+                                   |
|                                  | (Sanitized Context: Placeholders + Masked Image)     |
+----------------------------------+------------------------------------------------------+
                                   | HTTP POST /api/agent (No API keys in extension)
                                   v
+-----------------------------------------------------------------------------------------+
|                           LOCAL PROXY SERVER (server/server.js)                         |
|                                                                                         |
|   - Holds VLM API keys (Gemini primary, Qwen2-VL via OpenRouter fallback)              |
|   - Receives sanitized tokens and masked screenshot                                     |
|   - Formulates structured JSON action directive: {"action": "fill", "fieldType": "..."} |
+----------------------------------+------------------------------------------------------+
                                   | Structured Action Directive
                                   v
+-----------------------------------------------------------------------------------------+
|                               LOCAL ACTION EXECUTOR                                     |
|                                                                                         |
|   - Validates action against allowlist (click, fill, type, scroll)                      |
|   - Submit guard blocks automated form submissions                                      |
|   - Injects mock user profile values into target inputs on active page                  |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Features

- Site safety score: Computes an on-device heuristic risk score (0-100) based on transport security (HTTPS vs. HTTP), password inputs over plain HTTP, visible sensitive fields, and cross-origin forms. Implemented in `lib/decision/threat-score.js`.
- Manual select-to-redact: Provides a user-driven coordinate selection overlay allowing manual bounding-box redaction of unclassified screen areas directly on the canvas. Implemented in `lib/redactor/manual-redact.js`.
- Face blurring, password masking, and PII tokenization: Replaces visible DOM text matches with semantic tokens, applies solid fill masks to sensitive input fields, and applies Gaussian pixel blur to human faces detected by BlazeFace. Implemented in `lib/redactor/dom-redactor.js` and `lib/redactor/canvas-redactor.js`.
- Indian PII coverage with checksum validation: Validates 12-digit Indian Aadhaar numbers using the Verhoeff algorithm (`lib/pii/verhoeff.js`) and payment cards using the Luhn algorithm (`lib/pii/luhn.js`). Validates Indian PAN cards (`[A-Z]{5}[0-9]{4}[A-Z]`), UPI virtual payment addresses, Indian bank accounts with IFSC codes, and passport identifiers in `lib/pii/regex-rules.js`.
- Privacy gate: Evaluates outbound payloads immediately prior to fetch dispatch and blocks transmission if any unmasked PII string is present or if classification confidence is below 0.60. Implemented in `lib/privacy/privacy-gate.js`.
- Action allowlist and submit guard: Restricts executable agent operations to an allowlist (`click`, `scroll`, `type`, `fill`, `focus`, `select`, `navigate`, `wait`) and intercepts submit buttons to prevent automated form submission without explicit human approval. Implemented in `lib/executor/action-validator.js`.
- Offline mode: PII text scanning, Verhoeff/Luhn checksum verification, manual redaction, and DOM masking operate completely offline within the browser process. When the remote proxy server is unreachable, `background.js` activates a local action synthesizer (`synthesizeLocalActions` via `lib/executor/form-classifier.js`) to generate basic form-filling actions on-device without an external VLM.
- Cross-browser support: Tested on Chromium-based browsers (Google Chrome, Microsoft Edge, minimum Manifest V3 version 88) and Mozilla Firefox (minimum version 109.0 via Gecko settings). Restricted browser pages (`chr`browser_specific_settings.gecko` block in `manifest.json` with extension ID `privacyshield@isro-sih.org` and strict minimum version `109.0`.

### Step 5: Test Execution on Demo Page

A local test page is provided at `demo/index.html`.

1. Open `demo/index.html` in your browser.
2. Click the Project Phantom icon in the browser toolbar to open the popup.
   - The popup displays the domain, SSL status, a risk gauge titled "PHISHING & THREAT RISK", and a "Risk Signals Breakdown" list.
   - Click "Redact Live Page" (`#btn-activate-redactor`).
3. Observe in-page redaction:
   - Sensitive text elements on the page receive solid mask boxes.
   - A floating shield icon (`#ps-main-fab`) appears in the bottom right corner, alongside an "Site Exposure" indicator bar at the top right.
4. Test manual region redaction:
   - Click "Redact Selection" (`#btn-manual-redact`) in the popup, or hover over the floating shield and click the crop icon ("Select to Redact").
   - Drag a bounding box over any area on screen and click "Apply Redaction".
5. Run an agent task:
   - Hover over the floating shield icon to reveal the task input bar.
   - Type `Fill the registration form with my details` in the text box labeled "What do you want me to do?".
   - Click "Go".
   - The extension captures the sanitized viewport, verifies the privacy gate, sends the masked context to the proxy server, receives structured fill actions, and inserts values from `config.js:MOCK_PROFILE` into the form inputs.
6. Verify submit protection:
   - Type `Submit the form` in the task input.
   - Click "Go".
   - The extension rejects the action, displaying: `"PrivacyShield Safety Policy: Form submissions cannot be performed autonomously. Please review the details and submit manually."`

---

## 4. Empirical Benchmarks

The benchmark below compares Project Phantom against Microsoft Presidio under controlled conditions. Both systems were tested on the same host hardware against an identical shared dataset of 33 documents containing 67 positive ground-truth PII entities and 12 negative control items. Each document was evaluated across 15 iterations (n = 495 timed runs per system).

Test Environment:
- Host CPU: AMD Ryzen 3 3200U (2 physical cores, 4 threads at 2.60 GHz)
- Memory: 10.36 GB physical RAM
- Operating System: Windows 11 Pro 64-bit
- Runtimes: Node.js v24.20.0, Python 3.13.14
- Models: Presidio Analyzer v2.2.364 with `spacy` v3.8.16 (`en_core_web_sm` v3.8.0); Phantom text detector and regex rules engine.

### Table 1: Head-to-Head Comparison (Presidio vs. Phantom Text Engine)

| Evaluation Metric | Microsoft Presidio (Out-Of-The-Box) | Project Phantom (Text Engine) | Sample Size and Scope |
| :--- | :---: | :---: | :--- |
| Accuracy | 34.76% | 89.16% | n = 33 documents |
| Precision of Detection | 36.49% | 93.94% | n = 67 positive targets, 12 negative controls |
| Recall of Detection | 80.60% (54/67) | 92.54% (62/67) | n = 67 ground-truth entities |
| F1 Score | 50.23% | 93.23% | n = 67 ground-truth entities |
| False Positives | 94 | 4 | Non-PII text and negative controls flagged |
| Negative Controls | 3/12 correctly rejected | 12/12 correctly rejected | Invalid checksums and malformed tokens |
| Redaction Span IoU | 67.79% | 87.96% | Character-level span intersection over union |
| Peak Memory Delta | 3.48 MB (mean: 0.54 MB) | 0.22 MB (mean: 0.05 MB) | Peak heap allocation during single inference |
| Latency: Mean | 25.10 ms | 0.194 ms | Full document detection and tokenization |
| Latency: P95 | 68.92 ms | 0.801 ms | 95th percentile over 495 iterations |
| Latency: Median (P50) | 16.87 ms | 0.060 ms | Median latency over 495 iterations |
| Warm-up / Load Time | 2,228.43 ms | 14.90 ms | One-time model and rule compilation |

### Table 2: Project Phantom Layered Latency and Resource Profile

| Pipeline Boundary / Operation | Measured Value | Measurement Description |
| :--- | :---: | :--- |
| Text detection and sanitization | 0.194 ms mean | JavaScript regex, Verhoeff/Luhn checksums, and token replacement (n = 495 runs) |
| On-device ViT and text pipeline | 27.3 ms mean | Viewport capture (16.1 ms) + MobileViT-XXS classification via WASM (1.3 ms) + text PII scan (1.1 ms) + canvas redaction (8.8 ms) |
| Full agent loop | 285.6 ms mean, 696.4 ms P95 | Complete autonomous cycle: capture, perception, redaction, simulated intranet VLM network round-trip (58.4 ms), and DOM action execution (15.2 ms) |
| Peak memory with vision model | 12.46 MB | Active peak JS heap during full pipeline execution with MobileViT ONNX loaded (idle baseline: 5.00 MB) |
| Face and visual redaction bbox IoU | 87.08% | Spatial bounding box overlap between ground-truth visual regions and redacted canvas masks |

### Benchmark Analysis

Presidio's precision score (36.49%) is driven by three factors:
1. spaCy's `en_core_web_sm` model classifies non-sensitive capitalized words (such as "Contact Mobile" and "Satellite Enclave") as entities.
2. Substring recognizers lack deduplication, causing a single email address to trigger an `EMAIL_ADDRESS` entity and two overlapping `URL` entities.
3. Presidio's date recognizer matches arbitrary 4-digit digit blocks within Aadhaar and credit card numbers.

Where Project Phantom falls short:
Phantom missed US-formatted physical addresses lacking explicit keywords (such as "123 Main St, New York, NY 10001") and standalone 9-digit passport numbers without prefix labels. Its regular expressions are configured for Indian municipal address schemes and standard letter-prefixed passport identifiers.

### Reproducing the Benchmark

The dataset, test runners, and raw JSON outputs are stored in `evaluation/benchmarks/presidio-vs-phantom/`.

To reproduce the benchmark:

```bash
# Generate the shared dataset:
python evaluation/benchmarks/presidio-vs-phantom/build_dataset.py

# Run the Microsoft Presidio benchmark:
python evaluation/benchmarks/presidio-vs-phantom/run_presidio_benchmark.py

# Run the Project Phantom benchmark:
node evaluation/benchmarks/presidio-vs-phantom/run_phantom_benchmark.js
```

Raw result files are output to `presidio_benchmark_results.json` and `phantom_benchmark_results.json`.

---

## 5. Limitations

- Restricted browser pages: The extension cannot run on internal browser URLs (`chrome://`, `edge://`, `about:`) or browser web stores due to browser security restrictions.
- Cross-origin iframes: The DOM redactor cannot directly access elements embedded within cross-origin `<iframe>` elements due to browser same-origin policies.
- Address and identifier formats: Current patterns are focused on Indian identifier formats (Aadhaar, PAN, UPI, Indian addresses). Free-form international addresses without standard street keywords or postal codes may not be recognized.
- Tail latency on dual-core processors: While average text redaction is sub-millisecond, executing full-viewport canvas blur and neural vision inference on dual-core hardware experiences P95 latency spikes up to 696.4 ms during complex page redraws.
- Captchas and authentication challenges: Automated solving of captchas and two-factor authentication prompts is intentionally not supported.

---

## 6. Repository Structure

- `background.js` - Manifest V3 background service worker handling tab capture, proxy communication, and local action synthesis.
- `content.js` - Main content script coordinating DOM scanning, visual perception, in-place redaction, and the floating UI.
- `config.js` - Global configuration defining proxy endpoints, thresholds, feature flags, and mock user profile data.
- `manifest.json` - Manifest V3 extension configuration for Chromium and Firefox.
- `lib/pii/` - PII detection engine, regex patterns, Verhoeff and Luhn checksum validators, and token manager.
- `lib/vision/` - BlazeFace face detection, ScreenViT (MobileViT-XXS ONNX model), and Tesseract.js OCR integration.
- `lib/redactor/` - In-place DOM redactor, canvas image masker, and manual select-to-redact module.
- `lib/privacy/` - Privacy gate module enforcing pre-transmission inspection and fail-safe blocking.
- `lib/executor/` - Action validator, allowlist guard, and DOM interaction dispatcher.
- `lib/decision/` - Heuristic site safety score and state transition decision engine.
- `popup/` - Browser toolbar popup interface showing domain identity, site risk gauge, and redaction triggers.
- `options/` - Extension settings page for proxy URL configuration and mock profile management.
- `server/` - Express proxy server holding VLM API keys and routing sanitized context to Gemini or Qwen2-VL.
- `demo/` - Local demonstration page (`index.html`) containing test forms and structured PII fields.
- `evaluation/` - Test harnesses, benchmark suites, and comparative evaluation artifacts.

---

## 7. Links

- Demo Video: [Watch Demonstration Video](https://github.com/saraswani/projectphantom)
- Presentation Slides: [View Project PPT](https://github.com/saraswani/projectphantom)
- License: [MIT License](LICENSE)