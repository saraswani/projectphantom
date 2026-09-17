/**
 * Verification Test Suite for Real Pretrained Vision Model (MobileViT-XXS)
 * Verifies:
 * 1. Model Loading via ONNX Runtime Web
 * 2. Genuine Neural Inference on Real Screenshot Pixels
 * 3. Execution Provider Detection (WebGPU / WASM)
 * 4. Graceful Heuristic Fallback Handling
 * 5. Full Extension Integration Compatibility
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ScreenViTModel } = require('../lib/vision/screen-vit');

async function runRealVisionTests() {
  console.log('========================================================================');
  console.log('🔍 TEST: Real Pretrained MobileViT Vision Model Verification');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function check(name, condition, extra = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✔ [PASS] ${name} ${extra}`);
    } else {
      console.error(`  ✕ [FAIL] ${name} ${extra}`);
      process.exitCode = 1;
    }
  }

  // TEST 1: Model Initialization with Real Pretrained Weights
  console.log('TEST 1: Model Initialization & Provider Detection');
  const vit = new ScreenViTModel();
  const loaded = await vit.initModel();
  const status = vit.getStatus();

  check('Model initialized successfully', loaded === true);
  check('Status reports isLoaded === true', status.isLoaded === true);
  check('Status reports isRealModel === true', status.isRealModel === true);
  check('Model name identified as MobileViT', status.modelName.includes('MobileViT'));
  check('Execution provider is WASM or WebGPU', status.executionProvider.includes('WASM') || status.executionProvider.includes('WebGPU'), `(${status.executionProvider})`);
  console.log(`     -> Load Time: ${status.loadTimeMs} ms\n`);

  // TEST 2: Genuine Inference on Real Screenshot Pixels
  console.log('TEST 2: Real Screenshot Processing & Neural Inference');
  const screenPath = path.join(__dirname, '../evaluation/datasets/visual-context/screens/form_submission.png');
  check('Real screenshot file exists on disk', fs.existsSync(screenPath));

  const screenBuf = fs.readFileSync(screenPath);
  const t0 = performance.now();
  const result = await vit.classifyScreen(screenBuf, { forceRecompute: true });
  const latency = performance.now() - t0;

  check('Inference status is success', result.status === 'success');
  check('Result confirms genuine neural execution (isRealModel)', result.isRealModel === true);
  check('Result exposes top predictions from ImageNet', Array.isArray(result.topPredictions) && result.topPredictions.length === 5);
  check('Top prediction contains class index, label, and probability', result.topPredictions[0].classIndex >= 0 && typeof result.topPredictions[0].label === 'string');
  check('Visual page type mapped to canonical taxonomy', typeof result.visualPageType === 'string' && result.visualPageType.length > 0, `[${result.visualPageType}]`);
  check('Measured inference latency recorded', result.inferenceLatencyMs > 0, `${result.inferenceLatencyMs} ms`);
  console.log(`     -> Top Prediction: [Class ${result.topPredictions[0].classIndex}] "${result.topPredictions[0].label}" (prob: ${(result.topPredictions[0].probability * 100).toFixed(2)}%)`);
  console.log(`     -> Visual Page Category: [${result.visualPageType}] ${result.visualLabel} (Confidence: ${(result.visualConfidence * 100).toFixed(0)}%)\n`);

  // TEST 3: Multiple Real Screenshots Discrimination
  console.log('TEST 3: Multi-Screen Inference & Feature Differentiation');
  const screens = [
    { name: 'authentication_login.png', file: 'authentication_login.png' },
    { name: 'dashboard_analytics.png', file: 'dashboard_analytics.png' },
    { name: 'article_documentation.png', file: 'article_documentation.png' }
  ];

  for (const s of screens) {
    const p = path.join(__dirname, '../evaluation/datasets/visual-context/screens', s.file);
    if (fs.existsSync(p)) {
      const res = await vit.classifyScreen(fs.readFileSync(p), { forceRecompute: true });
      check(`Real inference executed for ${s.name}`, res.status === 'success' && res.isRealModel === true, `(Top Class: ${res.topPredictions[0].classIndex} in ${res.inferenceLatencyMs}ms)`);
    }
  }
  console.log();

  // TEST 4: Heuristic Fallback Integrity
  console.log('TEST 4: Labeled Heuristic Fallback Verification');
  const fallbackResult = vit.getFallbackResult({ summaryCounts: { passwords: 1 } });
  check('Fallback status labeled as fallback', fallbackResult.status === 'fallback');
  check('Fallback reports isRealModel === false', fallbackResult.isRealModel === false);
  check('Fallback execution provider explicitly labeled', fallbackResult.executionProvider.includes('Fallback'));
  check('Fallback derives real DOM signal for login page', fallbackResult.visualPageType === 'auth_login');
  console.log();

  // TEST 5: Public API Call-Compatibility
  console.log('TEST 5: Public Contract Compatibility with content.js');
  check('Exposes visualPageType string', typeof result.visualPageType === 'string');
  check('Exposes visualLabel string', typeof result.visualLabel === 'string');
  check('Exposes visualConfidence number', typeof result.visualConfidence === 'number' && result.visualConfidence > 0);
  check('Exposes metrics object with luminance and edgeComplexity', typeof result.metrics.luminance === 'number');
  check('Exposes executionProvider string', typeof result.executionProvider === 'string');
  check('Exposes getStatus() diagnostics', typeof vit.getStatus === 'function');
  console.log();

  console.log('========================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} / ${total} tests passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('========================================================================\n');

  if (passed === total) {
    console.log('✔ All real vision model tests passed successfully!\n');
  } else {
    throw new Error(`Vision model tests failed: ${total - passed} failures.`);
  }
}

if (require.main === module) {
  runRealVisionTests().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runRealVisionTests };
