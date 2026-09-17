/**
 * Project Phantom — Vision Adapter
 * 
 * Surgical adapter that seamlessly integrates the new on-device neural UI perception model
 * into the existing Project Phantom pipeline without breaking any existing signatures,
 * workflows, privacy gates, or decision engines.
 * 
 * Flow:
 * captureResponse.dataUrl / sanitizedImageBase64
 *       ↓
 * VisionAdapter.processScreenshot()
 *       ↓
 * UIDetector.detectUIElements() [Real YOLOv8 ONNX Neural Inference]
 *       ↓
 * pipelineState.visualUIElements & pipelineState.screenStructure.visualDetections
 */
(function() {
  'use strict';

  let UIDetectorClass = null;
  let defaultDetector = null;

  if (typeof window !== 'undefined' && window.UIDetector) {
    UIDetectorClass = window.UIDetector;
    defaultDetector = window.uiDetector;
  } else if (typeof require !== 'undefined') {
    try {
      const mod = require('./ui-detector');
      UIDetectorClass = mod.UIDetector;
      defaultDetector = mod.uiDetector;
    } catch (e) {}
  }

  class VisionAdapter {
    constructor(options = {}) {
      this.detector = options.detector || defaultDetector || (UIDetectorClass ? new UIDetectorClass(options) : null);
      this.enabled = true;
    }

    /**
     * Initializes the underlying neural network detector
     */
    async init() {
      if (this.detector && typeof this.detector.initModel === 'function') {
        return await this.detector.initModel();
      }
      return false;
    }

    /**
     * Safely processes screenshot pixels and attaches structured visual detections
     * to the pipeline state without modifying existing fields.
     * 
     * @param {string|HTMLCanvasElement|HTMLImageElement|Buffer} screenshot
     * @param {Object} pipelineState
     * @returns {Promise<Object>} Detection results
     */
    async processScreenshot(screenshot, pipelineState = {}) {
      if (!this.enabled || !screenshot || !this.detector) {
        return { elements: [], status: 'disabled_or_unavailable' };
      }

      try {
        const result = await this.detector.detectUIElements(screenshot);

        // Safely augment pipeline state with real visual detections
        if (result && Array.isArray(result.elements)) {
          pipelineState.visualUIElements = result.elements;

          if (pipelineState.screenStructure) {
            pipelineState.screenStructure.visualElements = result.elements;
          }
        }

        return result;
      } catch (err) {
        console.warn('[Phantom VisionAdapter] Non-blocking visual perception error:', err.message);
        return { elements: [], status: 'error', error: err.message };
      }
    }

    /**
     * Exposes visual bounding boxes for sensitive element cross-referencing
     * without modifying the privacy gate contract.
     */
    getVisualBoxes(elements = []) {
      return elements.map(el => ({
        type: el.type,
        x: el.bbox.x,
        y: el.bbox.y,
        width: el.bbox.width,
        height: el.bbox.height,
        confidence: el.confidence
      }));
    }

    getStatus() {
      return this.detector ? this.detector.getStatus() : { isLoaded: false, isRealModel: false };
    }
  }

  const adapterInstance = new VisionAdapter();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VisionAdapter, visionAdapter: adapterInstance };
  } else if (typeof window !== 'undefined') {
    window.VisionAdapter = VisionAdapter;
    window.visionAdapter = adapterInstance;
  }
})();
