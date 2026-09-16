# 🛡️ Phantom AI — Privacy Protocol & Server-Client Contract

**Standard Version:** 1.0.0  
**Specification:** On-device Visual Perception & Pre-Transmission Privacy Gate for Browser Agents  

---

## 1. Architectural Philosophy & Guarantees

Under the Phantom AI privacy paradigm, the user's personal workstation is the sole trust perimeter. External cloud servers and Vision-Language Models (VLMs) operate in a **zero-trust** boundary:
- **Raw screen context must never cross external network interfaces.**
- **Biometric facial features must be permanently masked before canvas serialization.**
- **Citizen identity identifiers (Aadhaar, PAN, payment credentials) must be deterministically masked into reversible local tokens.**
- **The server receives sanitized layout topologies and semantic tokens only.**

```
   USER WORKSTATION (Local Trust Boundary)               EXTERNAL NETWORK (Zero Trust)
┌───────────────────────────────────────────────┐       ┌──────────────────────────────┐
│  Raw DOM Content & Screen Pixels              │       │                              │
│         │                                     │       │                              │
│         ▼                                     │       │                              │
│  [On-Device Visual ML & PII Checksums]        │       │                              │
│         │                                     │       │                              │
│         ▼                                     │       │                              │
│  [Local TreeWalker & Canvas Pixel Redaction]  │       │                              │
│         │                                     │       │                              │
│         ▼                                     │       │                              │
│  [Privacy Gate Zero-Leakage Enforcement]      │       │                              │
│         │                                     │       │                              │
│         ▼                                     │       │                              │
│  SANITIZED CONTEXT ONLY ─────────────────────────────▶│  Proxy VLM / LLM             │
│  - Reversible Tokens: [NAME_1], [AADHAAR_1]   │       │  - Understands Mask Protocol │
│  - Solid Masked Pixels & Blurred Faces        │       │  - Never expects raw PII     │
│  - Redacted Accessibility Tree                │       │  - Emits Structured Actions  │
│                                               │◀──────│                              │
│  LOCAL ACTION EXECUTOR                        │       │                              │
│  - Injects Mock Profile locally on-device     │       │                              │
│  - Strict Allowlist Validation                │       │                              │
└───────────────────────────────────────────────┘       └──────────────────────────────┘
```

---

## 2. Redaction Representation & Token Taxonomy

All detected sensitive entities are converted into standardized, bracketed surrogate tokens prior to serialization:

| Entity Class | Ground Detection Engine | Redaction Representation | Example Inversion |
| :--- | :--- | :--- | :--- |
| **Indian Aadhaar** | 12-digit regex + Verhoeff Dihedral D5 check | `[AADHAAR_n]` | `2345 6789 0124` ➔ `[AADHAAR_1]` |
| **Indian PAN** | 10-char alphanumeric checksum format | `[PAN_n]` | `ABCDE1234F` ➔ `[PAN_1]` |
| **Payment Cards** | 13–19 digits + Luhn Modulo 10 algorithm | `[CARD_n]` | `4532 0150 5190 7100` ➔ `[CARD_1]` |
| **Email Address** | RFC 5322 compliance pattern | `[EMAIL_n]` | `user@domain.com` ➔ `[EMAIL_1]` |
| **Phone Number** | E.164 & Indian 10-digit mobile pattern | `[PHONE_n]` | `+91 98765 43210` ➔ `[PHONE_1]` |
| **UPI / VPA** | Handle regex matching major Indian banks | `[UPI_n]` | `aarav@oksbi` ➔ `[UPI_1]` |
| **Bank Account** | Numeric sequence with IFSC context | `[BANK_ACC_n]` | `91234567890` ➔ `[BANK_ACC_1]` |
| **Date of Birth** | Validated calendar date pattern | `[DOB_n]` | `15/08/1992` ➔ `[DOB_1]` |
| **API Keys / JWT** | High-entropy regex + Shannon entropy >= 3.8 | `[SECRET_n]` | `AKIA...` ➔ `[SECRET_1]` |
| **Human Faces** | BlazeFace ML + Skin-tone cluster heuristic | Multi-pass Gaussian blur | Canvas pixels blurred with 20px radius |

---

## 3. Server Contract & Expectations

### What the Server Receives
1. **`sanitizedText`**: Page text where all sensitive strings are replaced by surrogate tokens.
2. **`sanitizedImageBase64`**: Screenshot with solid masks over text PII and Gaussian blur over all detected biometric faces.
3. **`screenStructure`**: Structured JSON hierarchy of interactive UI elements (buttons, links, inputs, tables) with selectors and bounding boxes.
4. **`task`**: The human user's high-level instruction (e.g. *"Find latest transaction and scroll to it"*).
5. **`pageClassification`**: On-device classification (e.g. `FORM_SUBMISSION`, `AUTHENTICATION_LOGIN`).

### What the Server Must NEVER Expect
- **Raw citizen PII or credentials.** If an LLM attempts to prompt the client for real credit card numbers or passwords, the client-side privacy gate blocks execution.
- **Form submission execution.** Under the Phantom AI safety policy, form submission actions (`click[type="submit"]`) are rejected client-side. The human user must review and manually submit forms.

---

## 4. Structured Action Protocol Schema

The server returns strict JSON matching the following schema:

```json
{
  "type": "action",
  "actions": [
    {
      "action": "click",
      "target": { "type": "selector", "value": "#btn-confirm" },
      "confidence": 0.94
    },
    {
      "action": "type",
      "target": { "type": "selector", "value": "#input-email" },
      "fieldType": "email",
      "confidence": 0.95
    },
    {
      "action": "scroll",
      "scrollY": 450,
      "confidence": 0.92
    }
  ]
}
```

### Action Allowlist
Only the following actions are permitted:
- `click` — Click on interactive button or link.
- `scroll` — Scroll viewport to specified offset or element.
- `type` / `fill` — Inject value into form input from local mock profile.
- `focus` — Focus target control.
- `select` — Select dropdown menu option.
- `navigate` — Navigate to URL within current origin.
- `wait` — Non-blocking delay (capped at 5,000 ms).

All actions must achieve a local confidence score >= 0.50 and pass code injection filters.

---

## 5. Fail-Safe Mode & Safety Thresholds

```
                       Outbound Payload
                              │
                              ▼
                   [Privacy Gate Engine]
                              │
               ┌──────────────┴──────────────┐
               │ Detection Confidence Check? │
               └──────────────┬──────────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     ▼                        ▼                        ▼
[Confidence >= 0.85]   [0.60 <= Conf < 0.85]     [Confidence < 0.60]
High Confidence        Medium Confidence         Low Confidence / Error
     │                        │                        │
     ▼                        ▼                        ▼
Transmit Sanitized     Secondary Conservative    BLOCK TRANSMISSION
Payload                Scrubbing Pass            Zero Network Leakage
```

When local detection confidence falls below 0.60 or when an engine exception occurs, the privacy gate **completely blocks outbound transmission**. Privacy protection strictly overrides task completion.
