/**
 * Project Phantom — Isolated Visual Perception Benchmark
 * 
 * Evaluates the real neural vision model against independently annotated ground-truth screenshots.
 * 
 * Rules:
 * - Tests the ACTUAL model execution on screenshot pixels.
 * - Ground truth is completely independent of predictions.
 * - Predictions are NEVER derived from DOM, HTML, selectors, or ground truth.
 * - Computes real: Precision, Recall, F1-Score, IoU, FP, FN, Latency (First, Warm, Avg, P95).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { UIDetector } = require('../../lib/vision/ui-perception/ui-detector');

function computeBoxIoU(b1, b2) {
  const x1 = Math.max(b1.x, b2.x);
  const y1 = Math.max(b1.y, b2.y);
  const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
  const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  const area1 = b1.width * b1.height;
  const area2 = b2.width * b2.height;
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? (interArea / unionArea) : 0;
}

function areTypesCompatible(predType, gtType) {
  if (predType === gtType) return true;
  // Semantic category groupings
  const textGroup = ['text-region', 'heading', 'label'];
  if (textGroup.includes(predType) && textGroup.includes(gtType)) return true;
  const interactiveGroup = ['button', 'link'];
  if (interactiveGroup.includes(predType) && interactiveGroup.includes(gtType)) return true;
  const containerGroup = ['card', 'iframe'];
  if (containerGroup.includes(predType) && containerGroup.includes(gtType)) return true;
  return false;
}

async function runVisionPerceptionBenchmark() {
  console.log('========================================================================');
  console.log('👁️  Phantom AI — Isolated Neural Visual Perception Benchmark');
  console.log('========================================================================\n');

  const gtPath = path.join(__dirname, 'ground-truth.json');
  if (!fs.existsSync(gtPath)) {
    throw new Error(`Ground truth file not found at: ${gtPath}`);
  }

  const gtData = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
  const detector = new UIDetector();

  console.log('Initializing ONNX Runtime Web model...');
  const initStart = performance.now();
  await detector.initModel();
  const initDuration = performance.now() - initStart;

  const status = detector.getStatus();
  console.log(`• Model ID:            ${status.modelId}`);
  console.log(`• Architecture:        YOLOv8-Nano UI Detector (Pretrained ONNX)`);
  console.log(`• Execution Provider:  ${status.executionProvider}`);
  console.log(`• Model Input Size:    ${status.inputSize}`);
  console.log(`• Model Load Time:     ${status.loadTimeMs} ms\n`);

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalIoUSum = 0;
  let totalMatched = 0;
  const screenReports = [];

  const IOU_MATCH_THRESHOLD = 0.15; // Minimum spatial overlap for detection credit

  for (const screen of gtData.screens) {
    const fullImagePath = path.resolve(__dirname, '../../', screen.imagePath);
    console.log(`Evaluating Screen: [${screen.id}]`);
    console.log(`  Source Image: ${screen.imagePath} (${screen.viewport.width}x${screen.viewport.height})`);

    if (!fs.existsSync(fullImagePath)) {
      console.warn(`  ✕ Screenshot file not found: ${fullImagePath}`);
      continue;
    }

    const imageBuf = fs.readFileSync(fullImagePath);

    // 1. GENUINE NEURAL NETWORK INFERENCE ON PIXELS
    const detResult = await detector.detectUIElements(imageBuf, { confThreshold: 0.10, iouThreshold: 0.45 });
    const predictions = detResult.elements;
    const groundTruth = screen.groundTruthElements;

    console.log(`  Real Model Execution Time: ${detResult.latencyMs} ms`);
    console.log(`  Predicted UI Boxes: ${predictions.length}`);
    console.log(`  Ground-Truth Boxes: ${groundTruth.length}`);

    // 2. BIPARTITE MATCHING AGAINST INDEPENDENT GROUND TRUTH
    const matchedGT = new Set();
    const matchedPred = new Set();
    let screenIoUSum = 0;
    let screenMatches = 0;

    for (let pIdx = 0; pIdx < predictions.length; pIdx++) {
      const pred = predictions[pIdx];
      let bestIoU = 0;
      let bestGTIdx = -1;

      for (let gIdx = 0; gIdx < groundTruth.length; gIdx++) {
        if (matchedGT.has(gIdx)) continue;
        const gt = groundTruth[gIdx];

        if (areTypesCompatible(pred.type, gt.type)) {
          const iou = computeBoxIoU(pred.bbox, gt.bbox);
          if (iou > bestIoU) {
            bestIoU = iou;
            bestGTIdx = gIdx;
          }
        }
      }

      if (bestIoU >= IOU_MATCH_THRESHOLD && bestGTIdx >= 0) {
        matchedGT.add(bestGTIdx);
        matchedPred.add(pIdx);
        screenIoUSum += bestIoU;
        screenMatches++;
      }
    }

    const tp = screenMatches;
    const fp = predictions.length - tp;
    const fn = groundTruth.length - tp;
    const precision = predictions.length > 0 ? (tp / predictions.length) : 0;
    const recall = groundTruth.length > 0 ? (tp / groundTruth.length) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall / (precision + recall)) : 0;
    const meanIoU = screenMatches > 0 ? (screenIoUSum / screenMatches) : 0;

    totalTP += tp;
    totalFP += fp;
    totalFN += fn;
    totalIoUSum += screenIoUSum;
    totalMatched += screenMatches;

    console.log(`  ✔ Matches (TP): ${tp}, False Positives (FP): ${fp}, False Negatives (FN): ${fn}`);
    console.log(`  ✔ Precision: ${(precision * 100).toFixed(2)}%, Recall: ${(recall * 100).toFixed(2)}%, F1: ${(f1 * 100).toFixed(2)}%`);
    console.log(`  ✔ Mean IoU of Matches: ${(meanIoU * 100).toFixed(2)}%\n`);

    screenReports.push({
      screenId: screen.id,
      predictionsCount: predictions.length,
      groundTruthCount: groundTruth.length,
      tp, fp, fn,
      precision,
      recall,
      f1,
      meanIoU,
      latencyMs: detResult.latencyMs
    });
  }

  const overallPrecision = (totalTP + totalFP) > 0 ? (totalTP / (totalTP + totalFP)) : 0;
  const overallRecall = (totalTP + totalFN) > 0 ? (totalTP / (totalTP + totalFN)) : 0;
  const overallF1 = (overallPrecision + overallRecall) > 0 ? (2 * overallPrecision * overallRecall / (overallPrecision + overallRecall)) : 0;
  const overallMeanIoU = totalMatched > 0 ? (totalIoUSum / totalMatched) : 0;

  const finalStatus = detector.getStatus();

  const report = {
    benchmarkTitle: 'Phantom AI Local Neural Vision Perception Benchmark',
    timestamp: new Date().toISOString(),
    modelInfo: {
      modelId: finalStatus.modelId,
      architecture: 'YOLOv8-Nano UI Object Detector',
      weightsOrigin: 'amigodev/ui-elements-detector-test (HuggingFace)',
      weightsFormat: 'ONNX FP32 (lib/vision/models/ui-detector.onnx)',
      executionProvider: finalStatus.executionProvider,
      inputResolution: finalStatus.inputSize,
      loadTimeMs: finalStatus.loadTimeMs
    },
    performanceTiming: {
      firstInferenceMs: finalStatus.firstInferenceMs,
      warmInferenceMs: finalStatus.warmInferenceMs,
      averageInferenceMs: finalStatus.averageInferenceMs,
      p95InferenceMs: finalStatus.p95InferenceMs,
      totalInferences: finalStatus.totalInferences
    },
    detectionQuality: {
      truePositives: totalTP,
      falsePositives: totalFP,
      falseNegatives: totalFN,
      precision: Math.round(overallPrecision * 10000) / 10000,
      precisionPercent: (overallPrecision * 100).toFixed(2) + '%',
      recall: Math.round(overallRecall * 10000) / 10000,
      recallPercent: (overallRecall * 100).toFixed(2) + '%',
      f1Score: Math.round(overallF1 * 10000) / 10000,
      f1Percent: (overallF1 * 100).toFixed(2) + '%',
      meanIoU: Math.round(overallMeanIoU * 10000) / 10000,
      meanIoUPercent: (overallMeanIoU * 100).toFixed(2) + '%'
    },
    screenReports
  };

  const resultsPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));

  console.log('========================================================================');
  console.log('📊 BENCHMARK SUMMARY RESULTS:');
  console.log('========================================================================');
  console.log(`• Model ID:            ${report.modelInfo.modelId}`);
  console.log(`• Execution Provider:  ${report.modelInfo.executionProvider}`);
  console.log(`• First Inference:     ${report.performanceTiming.firstInferenceMs} ms`);
  console.log(`• Warm Inference:      ${report.performanceTiming.warmInferenceMs} ms`);
  console.log(`• Average Inference:   ${report.performanceTiming.averageInferenceMs} ms`);
  console.log(`• P95 Latency:         ${report.performanceTiming.p95InferenceMs} ms`);
  console.log(`• True Positives (TP): ${report.detectionQuality.truePositives}`);
  console.log(`• False Positives (FP):${report.detectionQuality.falsePositives}`);
  console.log(`• False Negatives (FN):${report.detectionQuality.falseNegatives}`);
  console.log(`• Precision:           ${report.detectionQuality.precisionPercent}`);
  console.log(`• Recall:              ${report.detectionQuality.recallPercent}`);
  console.log(`• F1-Score:            ${report.detectionQuality.f1Percent}`);
  console.log(`• Mean IoU:            ${report.detectionQuality.meanIoUPercent}`);
  console.log('========================================================================');
  console.log(`✔ Detailed results saved to: ${resultsPath}\n`);

  return report;
}

if (require.main === module) {
  runVisionPerceptionBenchmark().catch(err => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
  });
}

module.exports = { runVisionPerceptionBenchmark };
