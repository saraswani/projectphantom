/**
 * PrivacyShield - Local Face & Visual PII Detection Engine (Component 2)
 *
 * Strategy: Load BlazeFace model weights directly into memory using
 * chrome.runtime.getURL + fetch (allowed in content scripts), then construct
 * a tf.io.fromMemory() handler so TFJS never tries to re-fetch anything.
 *
 * Fallback chain:
 *   1. Local bundled weights via chrome.runtime.getURL (offline, CSP-safe)
 *   2. TFHub remote (if local fails)
 *   3. Enhanced heuristic skin-tone detector (if both ML paths fail)
 */
(function() {
  'use strict';

  class LocalFaceDetector {
    constructor() {
      this.model = null;
      this.isModelLoaded = false;
      this.isLoading = false;
      this.activeBackend = 'Not Initialized';
      this.detectorStatus = 'unloaded';
      this.lastInferenceTimeMs = 0;
      this.detectionCount = 0;
      this.telemetryBreakdown = {};
    }

    /**
     * Fetches a URL and returns an ArrayBuffer.
     * Works from content-script context for chrome-extension:// URLs.
     */
    async _fetchBuffer(url) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return resp.arrayBuffer();
    }

    /**
     * Loads the local bundled BlazeFace model weights into memory and returns
     * a tf.io.IOHandler so TFJS loads from ArrayBuffer without any network call.
     * Returns null on any error.
     */
    async _loadLocalModelHandler() {
      try {
        const modelJsonUrl = chrome.runtime.getURL('lib/vision/model/model.json');
        const weightsUrl = chrome.runtime.getURL('lib/vision/model/group1-shard1of1.bin');

        console.log('[PrivacyShield] Fetching local model from:', modelJsonUrl);

        const [modelJsonBuf, weightsBuf] = await Promise.all([
          this._fetchBuffer(modelJsonUrl),
          this._fetchBuffer(weightsUrl)
        ]);

        // Parse model topology JSON
        const modelJsonText = new TextDecoder('utf-8').decode(modelJsonBuf);
        const modelArtifacts = JSON.parse(modelJsonText);

        // Reconstruct modelArtifacts with inline weight data
        const weightData = weightsBuf;

        // Use tf.io.fromMemory to give TFJS pre-loaded data — no network
        const handler = tf.io.fromMemory({
          modelTopology: modelArtifacts.modelTopology || modelArtifacts,
          weightSpecs: modelArtifacts.weightsManifest
            ? modelArtifacts.weightsManifest[0].weights
            : [],
          weightData: weightData,
          format: modelArtifacts.format,
          generatedBy: modelArtifacts.generatedBy,
          convertedBy: modelArtifacts.convertedBy,
          signature: modelArtifacts.signature
        });

        return handler;
      } catch (err) {
        console.warn('[PrivacyShield] Local model handler error:', err.message || err);
        return null;
      }
    }

    /**
     * Initializes BlazeFace:
     * 1. Local bundled weights (via in-memory IO handler)
     * 2. TFHub fallback
     * 3. Heuristic fallback
     */
    async init() {
      if (this.isModelLoaded || this.isLoading) return;
      this.isLoading = true;
      this.detectorStatus = 'loading';

      try {
        if (typeof tf === 'undefined' || typeof blazeface === 'undefined') {
          throw new Error('TF.js or BlazeFace not loaded');
        }

        // Backend setup: try WebGL (GPU), fall back to CPU
        let backendReady = false;
        try {
          backendReady = await tf.setBackend('webgl');
          if (backendReady) await tf.ready();
        } catch (_) {}

        if (!backendReady || tf.getBackend() !== 'webgl') {
          try {
            await tf.setBackend('cpu');
            await tf.ready();
          } catch (_) {}
        }

        const backend = tf.getBackend() || 'cpu';
        this.activeBackend = `TensorFlow.js (${backend.toUpperCase()})`;
        console.log(`[PrivacyShield] TF backend: ${backend}`);

        // ── Tier 1: Load model weights directly from extension bundle ─────────
        let modelLoaded = false;

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
          const handler = await this._loadLocalModelHandler();
          if (handler && typeof blazeface !== 'undefined' && blazeface.BlazeFaceModel) {
            try {
              const tfModel = await tf.loadGraphModel(handler);
              this.model = new blazeface.BlazeFaceModel(tfModel, 128, 128, 20, 0.30, 0.40);
              modelLoaded = true;
              this.detectorStatus = 'blazeface_ready';
              console.log('[PrivacyShield] BlazeFace loaded via local handler + BlazeFaceModel ✓');
            } catch (wrapErr) {
              console.warn('[PrivacyShield] Local model wrap failed:', wrapErr.message || wrapErr);
            }
          }
        }

        // ── Tier 2: Let blazeface.load() fetch from local URL ─────────────────
        if (!modelLoaded && typeof blazeface !== 'undefined' && blazeface.load) {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            try {
              const localUrl = chrome.runtime.getURL('lib/vision/model/model.json');
              this.model = await blazeface.load({
                modelUrl: localUrl,
                maxFaces: 20,
                scoreThreshold: 0.40,
                iouThreshold: 0.30
              });
              modelLoaded = true;
              this.detectorStatus = 'blazeface_ready';
              console.log('[PrivacyShield] BlazeFace loaded via blazeface.load(localUrl) ✓');
            } catch (bfLocalErr) {
              console.warn('[PrivacyShield] blazeface.load(localUrl) failed:', bfLocalErr.message || bfLocalErr);
            }
          }
        }

        // ── Tier 3: TFHub (requires internet) ─────────────────────────────────
        if (!modelLoaded && typeof blazeface !== 'undefined' && blazeface.load) {
          try {
            this.model = await blazeface.load({
              maxFaces: 20,
              scoreThreshold: 0.40,
              iouThreshold: 0.30
            });
            modelLoaded = true;
            this.detectorStatus = 'blazeface_ready';
            console.log('[PrivacyShield] BlazeFace loaded from TFHub ✓');
          } catch (hubErr) {
            console.warn('[PrivacyShield] TFHub load failed:', hubErr.message || hubErr);
          }
        }

        if (!modelLoaded) throw new Error('All BlazeFace load paths failed');
        this.isModelLoaded = true;

      } catch (err) {
        console.error('[PrivacyShield] Face detector init failed:', err.message || err);
        this.activeBackend = 'Enhanced Heuristic Fallback';
        this.detectorStatus = 'heuristic_fallback';
      } finally {
        this.isLoading = false;
      }
    }



    /**
     * Calculates the rendered content box and scaling for images with object-fit.
     */
    getObjectFitLayout(img, rect) {
      const nw = img.naturalWidth || rect.width;
      const nh = img.naturalHeight || rect.height;
      if (nw === 0 || nh === 0) {
        return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, naturalWidth: rect.width, naturalHeight: rect.height };
      }

      let objectFit = 'fill';
      try {
        const computed = window.getComputedStyle(img);
        objectFit = computed.objectFit || 'fill';
      } catch (e) { objectFit = 'fill'; }

      if (objectFit === 'cover') {
        const scale = Math.max(rect.width / nw, rect.height / nh);
        const renderW = nw * scale;
        const renderH = nh * scale;
        return {
          scaleX: scale, scaleY: scale,
          offsetX: (rect.width - renderW) / 2,
          offsetY: (rect.height - renderH) / 2,
          naturalWidth: nw, naturalHeight: nh
        };
      } else if (objectFit === 'contain') {
        const scale = Math.min(rect.width / nw, rect.height / nh);
        const renderW = nw * scale;
        const renderH = nh * scale;
        return {
          scaleX: scale, scaleY: scale,
          offsetX: (rect.width - renderW) / 2,
          offsetY: (rect.height - renderH) / 2,
          naturalWidth: nw, naturalHeight: nh
        };
      }
      return {
        scaleX: rect.width / nw, scaleY: rect.height / nh,
        offsetX: 0, offsetY: 0,
        naturalWidth: nw, naturalHeight: nh
      };
    }

    /**
     * Draws image to a letterboxed square canvas for BlazeFace inference.
     */
    _drawLetterboxedCanvas(imgEl, targetSize = 256) {
      const nw = imgEl.naturalWidth || imgEl.width || targetSize;
      const nh = imgEl.naturalHeight || imgEl.height || targetSize;
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, targetSize, targetSize);

      const scale = Math.min(targetSize / nw, targetSize / nh);
      const drawW = nw * scale;
      const drawH = nh * scale;
      const offsetX = (targetSize - drawW) / 2;
      const offsetY = (targetSize - drawH) / 2;
      ctx.drawImage(imgEl, offsetX, offsetY, drawW, drawH);
      return { canvas, scale, offsetX, offsetY, nw, nh };
    }

    /**
     * Enhanced multi-region heuristic: skin-tone grid analysis + portrait crop fallback.
     * Returns coordinates in IMAGE natural pixel space.
     */
    detectHeuristicFaces(canvas, ctx) {
      const width = canvas.width;
      const height = canvas.height;
      if (width < 32 || height < 32) return [];

      let imgData;
      try { imgData = ctx.getImageData(0, 0, width, height); }
      catch (_) { return []; }
      const data = imgData.data;

      const aspect = height / width;
      const isPortraitAspect = aspect >= 0.65 && aspect <= 1.5;

      const gridCols = 8, gridRows = 8;
      const cellW = width / gridCols;
      const cellH = height / gridRows;

      const skinGrid = Array.from({ length: gridRows }, () => new Array(gridCols).fill(0));
      const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const isSkin = (
            r > 60 && g > 25 && b > 15 &&
            r > g && r > b &&
            (r - Math.min(g, b)) > 15 &&
            Math.abs(r - g) > 5
          );
          if (isSkin) {
            const col = Math.min(gridCols - 1, Math.floor(x / cellW));
            const row = Math.min(gridRows - 1, Math.floor(y / cellH));
            skinGrid[row][col]++;
          }
        }
      }

      let minR = gridRows, maxR = -1, minC = gridCols, maxC = -1;
      let activeCells = 0;

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          if (skinGrid[r][c] >= 2) {
            activeCells++;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
            if (c < minC) minC = c;
            if (c > maxC) maxC = c;
          }
        }
      }

      if (activeCells >= 3 && maxR >= minR && maxC >= minC) {
        const fx = Math.round(minC * cellW);
        const fy = Math.round(minR * cellH);
        const fw = Math.round((maxC - minC + 1) * cellW);
        const fh = Math.round((maxR - minR + 1) * cellH);

        if (fw >= width * 0.20 && fh >= height * 0.20) {
          return [{
            x: fx, y: fy,
            width: fw, height: fh,
            confidence: 0.75,
            isHeuristic: true
          }];
        }
      }

      // Default biometric portrait face crop for avatar/headshot images
      if (isPortraitAspect && width >= 64 && height >= 64) {
        return [{
          x: Math.round(width * 0.18),
          y: Math.round(height * 0.10),
          width: Math.round(width * 0.64),
          height: Math.round(height * 0.65),
          confidence: 0.70,
          isHeuristic: true
        }];
      }

      return [];
    }

    /**
     * Detect faces in an image element using BlazeFace or heuristic.
     * Returns coordinates in IMAGE NATURAL PIXEL SPACE.
     */
    async detectFacesInElement(element) {
      const startTime = performance.now();
      const faceBoxes = [];

      try {
        const nw = element.naturalWidth || element.width || 128;
        const nh = element.naturalHeight || element.height || 128;
        const minDim = Math.min(nw, nh);

        if (this.detectorStatus === 'blazeface_ready' && this.model) {
          try {
            const targetSize = Math.min(512, Math.max(128, Math.max(nw, nh)));
            const { canvas, scale, offsetX, offsetY } = this._drawLetterboxedCanvas(element, targetSize);

            const predictions = await this.model.estimateFaces(canvas, false);

            for (const pred of predictions) {
              const [lbX, lbY] = pred.topLeft;
              const [lbX2, lbY2] = pred.bottomRight;
              const prob = (pred.probability && pred.probability[0]) ? pred.probability[0] : 0.85;
              if (prob < 0.35) continue;

              // Reverse letterbox transform → natural pixel coords
              const naturalX = (lbX - offsetX) / scale;
              const naturalY = (lbY - offsetY) / scale;
              const naturalX2 = (lbX2 - offsetX) / scale;
              const naturalY2 = (lbY2 - offsetY) / scale;

              const x = Math.max(0, Math.round(naturalX));
              const y = Math.max(0, Math.round(naturalY));
              const w = Math.max(1, Math.round(naturalX2 - naturalX));
              const h = Math.max(1, Math.round(naturalY2 - naturalY));

              // Validate box: a real face in a portrait/headshot cannot be a tiny speck
              if (w >= minDim * 0.15 && h >= minDim * 0.15) {
                faceBoxes.push({ x, y, width: w, height: h, confidence: prob, isHeuristic: false });
              }
            }
          } catch (modelErr) {
            console.warn('[PrivacyShield] Model inference error:', modelErr.message || modelErr);
          }
        }

        // Fallback heuristic if ML returned nothing or invalid boxes
        if (faceBoxes.length === 0) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = nw; canvas.height = nh;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(element, 0, 0, nw, nh);
            faceBoxes.push(...this.detectHeuristicFaces(canvas, ctx));
          } catch (_) {}
        }
      } catch (_) {}

      this.lastInferenceTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
      this.detectionCount += faceBoxes.length;
      return faceBoxes;
    }

    /**
     * Applies biometric head padding to expand tight eye-to-chin box
     * to cover forehead, ears, and jaw.
     */
    _applyBiometricPadding(face, imgW, imgH) {
      if (face.isHeuristic) {
        return {
          x: Math.max(0, face.x),
          y: Math.max(0, face.y),
          width: Math.min(imgW - face.x, face.width),
          height: Math.min(imgH - face.y, face.height)
        };
      }

      const padTop = Math.round(face.height * 0.45);    // forehead + hair
      const padBottom = Math.round(face.height * 0.25); // chin + jaw
      const padSide = Math.round(face.width * 0.25);    // ears + temples

      return {
        x: Math.max(0, face.x - padSide),
        y: Math.max(0, face.y - padTop),
        width: Math.min(imgW - Math.max(0, face.x - padSide), face.width + (padSide * 2)),
        height: Math.min(imgH - Math.max(0, face.y - padTop), face.height + padTop + padBottom)
      };
    }

    /**
     * Scans a single image element and returns face bounding boxes
     * in VIEWPORT coordinate space for DOM overlay positioning.
     */
    async scanSingleImage(img) {
      if (!img || img.closest('#privacyshield-root')) return [];

      const rect = img.getBoundingClientRect();
      if (rect.width < 32 || rect.height < 32) return [];
      if (img.tagName && img.tagName.toLowerCase() === 'img') {
        if (!img.complete || img.naturalWidth === 0) return [];
      }

      // Attempt CORS-anonymous reload to allow canvas pixel access
      let targetImg = img;
      if (img.tagName && img.tagName.toLowerCase() === 'img' && img.src && !img.crossOrigin) {
        try {
          const corsImg = new Image();
          corsImg.crossOrigin = 'anonymous';
          const corsResult = await Promise.race([
            new Promise((res, rej) => {
              corsImg.onload = () => res(corsImg);
              corsImg.onerror = () => rej(new Error('CORS'));
              // src MUST be set AFTER handlers are registered
              corsImg.src = img.src;
            }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 150))
          ]);
          targetImg = corsResult;
        } catch (_) {
          targetImg = img;
        }
      }

      // Detect faces (natural pixel space)
      const rawFaces = await this.detectFacesInElement(targetImg);
      if (rawFaces.length === 0) return [];

      const fit = this.getObjectFitLayout(img, rect);
      const nw = fit.naturalWidth || img.naturalWidth || rect.width;
      const nh = fit.naturalHeight || img.naturalHeight || rect.height;

      const viewportFaces = [];
      for (const f of rawFaces) {
        const padded = this._applyBiometricPadding(f, nw, nh);

        // Map natural pixels → viewport CSS pixels
        const vpX = rect.left + fit.offsetX + padded.x * fit.scaleX;
        const vpY = rect.top + fit.offsetY + padded.y * fit.scaleY;
        const vpW = padded.width * fit.scaleX;
        const vpH = padded.height * fit.scaleY;

        // Clamp to element rect
        const finalX = Math.max(rect.left, vpX);
        const finalY = Math.max(rect.top, vpY);
        const finalRight = Math.min(rect.left + rect.width, vpX + vpW);
        const finalBottom = Math.min(rect.top + rect.height, vpY + vpH);

        if (finalRight - finalX < 4 || finalBottom - finalY < 4) continue;

        viewportFaces.push({
          x: Math.round(finalX),
          y: Math.round(finalY),
          width: Math.round(finalRight - finalX),
          height: Math.round(finalBottom - finalY),
          borderRadius: '8px',
          confidence: f.confidence,
          isHeuristic: f.isHeuristic || false
        });
      }

      return viewportFaces;
    }

    /**
     * Scans page images with viewport prioritization and concurrent processing.
     * Returns viewport-coordinate face boxes.
     */
    async scanPageImages() {
      await this.init();

      const allFaceBoxes = [];
      const elements = Array.from(document.querySelectorAll('img'));

      let totalImagesOnPage = elements.length;
      let skippedTooSmall = 0, skippedNotLoaded = 0, scannedCount = 0, failCount = 0;
      const processed = new Set();
      const candidates = [];

      const vh = (typeof window !== 'undefined' ? window.innerHeight : 1000);
      const vw = (typeof window !== 'undefined' ? window.innerWidth : 1200);

      for (const img of elements) {
        if (img.closest && img.closest('#privacyshield-root')) continue;
        if (processed.has(img)) continue;
        processed.add(img);

        const rect = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: 100, height: 100, top: 0, bottom: 100, left: 0, right: 100 };
        if (rect.width < 48 || rect.height < 48) { skippedTooSmall++; continue; }
        if (!img.complete || img.naturalWidth === 0) { skippedNotLoaded++; continue; }

        // Prioritize images in or near current viewport (dynamic scanner covers deep scroll images)
        const inOrNearViewport = (rect.bottom >= -150 && rect.top <= vh + 150 && rect.right >= -150 && rect.left <= vw + 150);
        if (inOrNearViewport) {
          candidates.push(img);
        }
      }

      // Prioritize top 12 most prominent images in viewport to ensure immediate sub-second response
      const prioritized = candidates.slice(0, 12);
      scannedCount = prioritized.length;

      // Scan concurrently in parallel
      const results = await Promise.all(
        prioritized.map(async (img) => {
          try {
            return await this.scanSingleImage(img);
          } catch (err) {
            failCount++;
            console.warn('[PrivacyShield] Scan failed for img:', err.message);
            return [];
          }
        })
      );

      for (const faces of results) {
        allFaceBoxes.push(...faces);
      }

      this.telemetryBreakdown = {
        totalImagesOnPage, skippedTooSmall, skippedNotLoaded,
        scannedCount, failedCount: failCount, facesFound: allFaceBoxes.length
      };

      console.log(`[PrivacyShield] Face scan: total=${totalImagesOnPage}, scanned=${scannedCount}, faces=${allFaceBoxes.length}, backend=${this.activeBackend}`);
      return allFaceBoxes;
    }

    getStatus() {
      return {
        status: this.detectorStatus,
        activeBackend: this.activeBackend,
        isModelLoaded: this.isModelLoaded,
        totalDetections: this.detectionCount,
        lastDurationMs: this.lastInferenceTimeMs
      };
    }
  }

  const faceDetectorInstance = new LocalFaceDetector();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalFaceDetector, faceDetector: faceDetectorInstance };
  } else if (typeof window !== 'undefined') {
    window.LocalFaceDetector = LocalFaceDetector;
    window.faceDetector = faceDetectorInstance;
  }
})();
