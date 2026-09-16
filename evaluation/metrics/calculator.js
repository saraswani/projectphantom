/**
 * Phantom AI — Standardized Evaluation Metrics Calculator
 * Implements rigorous statistical, classification, and spatial bounding-box formulas
 * for SIH evaluation metrics.
 */

'use strict';

/**
 * Calculates standard binary classification metrics.
 */
function calculateClassificationMetrics(tp, fp, fn, tn = 0) {
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1.0;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 1.0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + fp + fn + tn) > 0 ? (tp + tn) / (tp + fp + fn + tn) : 1.0;
  const specificity = (tn + fp) > 0 ? tn / (tn + fp) : 1.0;

  return {
    tp,
    fp,
    fn,
    tn,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    specificity: Number(specificity.toFixed(4)),
    precisionPercent: (precision * 100).toFixed(2) + '%',
    recallPercent: (recall * 100).toFixed(2) + '%',
    f1Percent: (f1 * 100).toFixed(2) + '%',
    accuracyPercent: (accuracy * 100).toFixed(2) + '%'
  };
}

/**
 * Computes Intersection over Union (IoU) between two bounding boxes.
 * Box format: { x, y, width, height }
 */
function computeBoxIoU(boxA, boxB) {
  if (!boxA || !boxB) return 0;

  const ax1 = boxA.x;
  const ay1 = boxA.y;
  const ax2 = boxA.x + boxA.width;
  const ay2 = boxA.y + boxA.height;

  const bx1 = boxB.x;
  const by1 = boxB.y;
  const bx2 = boxB.x + boxB.width;
  const by2 = boxB.y + boxB.height;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const intersectionArea = interWidth * interHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) return 0;
  return Number((intersectionArea / unionArea).toFixed(4));
}

/**
 * Calculates spatial redaction coverage and error rates.
 * Given ground-truth sensitive boxes and predicted redaction boxes.
 */
function calculateRedactionQuality(groundTruthBoxes = [], predictedBoxes = [], pageArea = { width: 1280, height: 800 }) {
  let matchedIoUSum = 0;
  let matchesCount = 0;
  let sensitiveArea = 0;
  let protectedSensitiveArea = 0;
  let predictedArea = 0;

  for (const gt of groundTruthBoxes) {
    const a = gt.width * gt.height;
    sensitiveArea += a;

    let maxIoU = 0;
    let bestPred = null;

    for (const pred of predictedBoxes) {
      const iou = computeBoxIoU(gt, pred);
      if (iou > maxIoU) {
        maxIoU = iou;
        bestPred = pred;
      }
    }

    if (maxIoU > 0.1) {
      matchedIoUSum += maxIoU;
      matchesCount++;
      // Protected area approx = intersection
      const interX1 = Math.max(gt.x, bestPred.x);
      const interY1 = Math.max(gt.y, bestPred.y);
      const interX2 = Math.min(gt.x + gt.width, bestPred.x + bestPred.width);
      const interY2 = Math.min(gt.y + gt.height, bestPred.y + bestPred.height);
      const inter = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
      protectedSensitiveArea += inter;
    }
  }

  for (const pred of predictedBoxes) {
    predictedArea += (pred.width * pred.height);
  }

  const exposedSensitiveArea = Math.max(0, sensitiveArea - protectedSensitiveArea);
  const nonSensitiveTotalArea = Math.max(1, (pageArea.width * pageArea.height) - sensitiveArea);
  const unnecessaryRedactionArea = Math.max(0, predictedArea - protectedSensitiveArea);
  const preservedNonSensitiveArea = Math.max(0, nonSensitiveTotalArea - unnecessaryRedactionArea);

  const meanIoU = matchesCount > 0 ? matchedIoUSum / matchesCount : (groundTruthBoxes.length === 0 ? 1.0 : 0);
  const leakageRate = sensitiveArea > 0 ? exposedSensitiveArea / sensitiveArea : 0;
  const overRedactionRate = nonSensitiveTotalArea > 0 ? unnecessaryRedactionArea / nonSensitiveTotalArea : 0;
  const utilityPreservation = nonSensitiveTotalArea > 0 ? preservedNonSensitiveArea / nonSensitiveTotalArea : 1.0;
  const redactionPrecision = predictedArea > 0 ? protectedSensitiveArea / predictedArea : 1.0;
  const redactionRecall = sensitiveArea > 0 ? protectedSensitiveArea / sensitiveArea : 1.0;

  return {
    groundTruthCount: groundTruthBoxes.length,
    predictedCount: predictedBoxes.length,
    meanIoU: Number(meanIoU.toFixed(4)),
    meanIoUPercent: (meanIoU * 100).toFixed(2) + '%',
    sensitivePixelsTotal: sensitiveArea,
    sensitivePixelsProtected: protectedSensitiveArea,
    sensitivePixelsExposed: exposedSensitiveArea,
    nonSensitivePixelsTotal: nonSensitiveTotalArea,
    nonSensitivePixelsPreserved: preservedNonSensitiveArea,
    nonSensitivePixelsOverRedacted: unnecessaryRedactionArea,
    leakageRate: Number(leakageRate.toFixed(4)),
    leakageRatePercent: (leakageRate * 100).toFixed(2) + '%',
    overRedactionRate: Number(overRedactionRate.toFixed(4)),
    overRedactionRatePercent: (overRedactionRate * 100).toFixed(2) + '%',
    utilityPreservation: Number(utilityPreservation.toFixed(4)),
    utilityPreservationPercent: (utilityPreservation * 100).toFixed(2) + '%',
    redactionPrecision: Number(redactionPrecision.toFixed(4)),
    redactionRecall: Number(redactionRecall.toFixed(4))
  };
}

/**
 * Computes statistical percentiles, min, max, mean, median, P95, and std dev.
 */
function calculateDistributionStats(values = []) {
  if (!values || values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdDev: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  const min = sorted[0];
  const max = sorted[count - 1];
  const median = sorted[Math.floor(count * 0.50)];
  const p95 = sorted[Math.min(count - 1, Math.floor(count * 0.95))];
  const p99 = sorted[Math.min(count - 1, Math.floor(count * 0.99))];

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  return {
    count,
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2))
  };
}

module.exports = {
  calculateClassificationMetrics,
  computeBoxIoU,
  calculateRedactionQuality,
  calculateDistributionStats
};
