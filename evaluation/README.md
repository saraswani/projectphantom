# 📊 Phantom AI — SIH Reproducible Evaluation Framework

This directory contains the dedicated, reproducible evaluation and benchmark framework for **Phantom AI** (PrivacyShield), specifically designed to measure and validate all five evaluation metrics of the Smart India Hackathon (SIH) problem statement:

> **"On-device Visual Perception for Light-weight Browser Agents"**

---

## 📁 Directory Structure

```
evaluation/
├── README.md                          # Framework guide and metric methodology
├── config.json                        # Benchmark runtime thresholds & parameters
├── run-all.js                         # Master runner compiling the unified report
├── datasets/                          # Standardized test datasets with ground-truth
│   ├── visual-context/
│   │   ├── ground-truth-page.html     # HTML page with 13 standard UI element types
│   │   └── ground-truth.json          # Annotated ground truth UI element inventory
│   ├── pii/
│   │   └── synthetic-pii.json         # Synthetic test cases across all PII categories
│   └── redaction/
│       └── redaction-cases.json       # Ground-truth sensitive bounding boxes for IoU
├── visual-context/
│   └── benchmark.js                   # Visual Context Accuracy Benchmark (25%)
├── pii-detection/
│   └── benchmark.js                   # PII Precision & Recall Benchmark (20%)
├── redaction/
│   └── benchmark.js                   # Redaction Precision, IoU & Leakage Benchmark (20%)
├── performance/
│   └── benchmark.js                   # Client Resource Utilization Benchmark (20%)
├── latency/
│   └── benchmark.js                   # T0–T7 End-to-End Latency Benchmark (15%)
├── privacy/
│   └── network-leak-test.js           # Automated Network Leakage Test (0-tolerance)
├── security/
│   └── security-suite.js              # Hidden inputs, passwords, and dynamic DOM tests
├── metrics/
│   └── calculator.js                  # Standardized statistical & spatial metric formulas
└── reports/                           # Generated empirical reports (JSON & Markdown)
```

---

## 🎯 Evaluated SIH Metrics

| Metric | Weight | Script | Formula / Key Measures |
| :--- | :---: | :--- | :--- |
| **Visual Context Accuracy** | **25%** | `node evaluation/visual-context/benchmark.js` | Accuracy, Precision, Recall, F1 across 13 element classes |
| **PII Precision & Recall** | **20%** | `node evaluation/pii-detection/benchmark.js` | TP, FP, FN, TN, Precision, Recall, F1 across all PII categories |
| **Redaction Precision** | **20%** | `node evaluation/redaction/benchmark.js` | Bounding-Box IoU, Pixel Leakage Rate, Over-redaction Rate |
| **Client Resource Usage** | **20%** | `node evaluation/performance/benchmark.js` | Active Heap MB, Heap Delta, Inference ms, Redaction ms |
| **End-to-End Latency** | **15%** | `node evaluation/latency/benchmark.js` | T0–T7 breakdown, Min, Max, Mean, Median, P95 (30+ trials) |

---

## 🚀 Running the Benchmarks

### 1. Run Everything (Master Suite)
```bash
node evaluation/run-all.js
```
*Executes all benchmarks and generates `evaluation/reports/evaluation-summary.json`.*

### 2. Run Individual Benchmarks
```bash
# Visual Context Accuracy (25%)
node evaluation/visual-context/benchmark.js

# PII Detection Precision & Recall (20%)
node evaluation/pii-detection/benchmark.js

# Redaction Precision & IoU (20%)
node evaluation/redaction/benchmark.js

# Client Resource Utilization (20%)
node evaluation/performance/benchmark.js

# End-to-End Latency (15%)
node evaluation/latency/benchmark.js

# Zero-Tolerance Network Leakage Test
node evaluation/privacy/network-leak-test.js

# Comprehensive Security & Dynamic DOM Suite
node evaluation/security/security-suite.js
```

---

## 🔒 Synthetic Data & Privacy Rules
- All benchmark test data is **100% synthetic**.
- No real Aadhaar, PAN, payment card, or biometric data is ever included or stored.
- All numbers reported are computed dynamically from actual test executions.
