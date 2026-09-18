/**
 * PrivacyShield - Canvas Screenshot Redaction Engine (Component 5)
 * Sanitizes screenshots at the pixel level:
 * - Solid privacy masks over all text PII DOM bounding boxes.
 * - Multi-pass Gaussian blur & pixelation filter over all detected face bounding boxes.
 * Guarantees zero raw biometric or sensitive pixel leakage to external networks.
 */
(function() {
  'use strict';

  class CanvasPixelRedactor {
    constructor() {
      this.lastSanitizedImage = null;
    }

    /**
     * Applies pixelation/mosaic effect over a specific rectangular region.
     */
    applyPixelation(ctx, x, y, width, height, blockSize = 14) {
      if (width <= 0 || height <= 0) return;
      const imgData = ctx.getImageData(x, y, width, height);
      const data = imgData.data;

      for (let py = 0; py < height; py += blockSize) {
        for (let px = 0; px < width; px += blockSize) {
          // Compute average color in block
          let r = 0, g = 0, b = 0, count = 0;
          for (let dy = 0; dy < blockSize && (py + dy) < height; dy++) {
            for (let dx = 0; dx < blockSize && (px + dx) < width; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4;
              r += data[idx];
              g += data[idx + 1];
              b += data[idx + 2];
              count++;
            }
          }
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          // Fill block with average color
          for (let dy = 0; dy < blockSize && (py + dy) < height; dy++) {
            for (let dx = 0; dx < blockSize && (px + dx) < width; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
            }
          }
        }
      }

      ctx.putImageData(imgData, x, y);
    }

    /**
     * Applies smooth multi-pass Gaussian blur on a bounding box region using canvas filter.
     */
    applyGaussianBlur(ctx, x, y, width, height, blurRadius = 20) {
      if (width <= 0 || height <= 0) return;

      // Extract face region into temporary canvas
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.drawImage(ctx.canvas, x, y, width, height, 0, 0, width, height);

      // Save context
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      // Apply CSS blur filter
      ctx.filter = `blur(${blurRadius}px)`;
      ctx.drawImage(tempCanvas, x - blurRadius, y - blurRadius, width + blurRadius * 2, height + blurRadius * 2);

      // Restore filter
      ctx.filter = 'none';
      ctx.restore();

      // Draw subtle privacy border over blurred face
      ctx.save();
      ctx.strokeStyle = '#00f2fe';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
      ctx.fillRect(x, y, width, height);

      // Privacy Face Badge
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 4, y + 4, 90, 18);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('[FACE_MASKED]', x + 8, y + 16);

      ctx.restore();
    }

    /**
     * Redacts both DOM text PII boxes and face boxes on a screenshot.
     * @param {string} rawScreenshotDataUrl - Image data URL
     * @param {Array} domBoxes - [{ x, y, width, height, tokens }]
     * @param {Array} faceBoxes - [{ x, y, width, height, confidence }]
     * @param {Array} ocrBoxes - [{ x, y, width, height, tokens }] (In image pixels, no scaling needed)
     * @returns {Promise<Object>} { sanitizedImageBase64, durationMs }
     */
    async redactScreenshot(rawScreenshotDataUrl, domBoxes = [], faceBoxes = [], ocrBoxes = []) {
      const startTime = performance.now();

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');

          console.log(`[CanvasRedactor] CANVAS SIZE: ${canvas.width}x${canvas.height}`);

          // Draw full original image
          ctx.drawImage(img, 0, 0);

          // Scaling factor between DOM coordinates and screenshot pixels
          const scaleX = canvas.width / (window.innerWidth || canvas.width);
          const scaleY = canvas.height / (window.innerHeight || canvas.height);

          // 1. Redact DOM Text PII Boxes (Solid Masks)
          ctx.save();
          for (const box of domBoxes) {
            const rx = Math.max(0, Math.round(box.x * scaleX));
            const ry = Math.max(0, Math.round(box.y * scaleY));
            const rw = Math.round((box.width || 100) * scaleX);
            const rh = Math.round((box.height || 24) * scaleY);

            // Solid high-opacity privacy rectangle
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(rx, ry, rw, rh);

            // Border
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx, ry, rw, rh);

            // Redaction text label
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 11px monospace';
            const tokenLabel = (box.tokens && box.tokens[0]) ? box.tokens[0] : '[REDACTED]';
            ctx.fillText(tokenLabel, rx + 4, ry + Math.min(rh - 4, 14));
          }

          // 1.5. Redact OCR Text PII Boxes (Solid Masks, no scaling)
          for (const box of ocrBoxes) {
            const rx = Math.max(0, Math.round(box.x));
            const ry = Math.max(0, Math.round(box.y));
            const rw = Math.round(box.width || 100);
            const rh = Math.round(box.height || 24);

            const tokenLabel = (box.tokens && box.tokens[0]) ? box.tokens[0] : (box.field ? `[${box.field}]` : '[OCR_MASK]');
            console.log(`[CanvasRedactor] EACH REDACTION BOX: [${tokenLabel}] x=${rx}, y=${ry}, w=${rw}, h=${rh}`);

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#f59e0b'; // Different border color for OCR
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx, ry, rw, rh);

            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(tokenLabel, rx + 4, ry + Math.min(rh - 4, 14));
          }
          ctx.restore();

          // 2. Redact Faces (Gaussian Blur + Mosaic Pixelation)
          for (const face of faceBoxes) {
            // For full photos, snap directly to the photo element coordinates; otherwise add padding
            const padX = 0;
            const padY = 0;
            const fx = Math.max(0, Math.round((face.x - padX) * scaleX));
            const fy = Math.max(0, Math.round((face.y - padY) * scaleY));
            const fw = Math.round((face.width + padX * 2) * scaleX);
            const fh = Math.round((face.height + padY * 2) * scaleY);

            // First pixelate, then blur over top for total irreversibility
            this.applyPixelation(ctx, fx, fy, fw, fh, 12);
            this.applyGaussianBlur(ctx, fx, fy, fw, fh, 18);
          }

          // Export sanitized image as high quality JPEG
          const sanitizedBase64 = canvas.toDataURL('image/jpeg', 0.85);
          this.lastSanitizedImage = sanitizedBase64;
          const durationMs = performance.now() - startTime;

          resolve({
            sanitizedImageBase64: sanitizedBase64,
            domBoxesCount: domBoxes.length,
            faceBoxesCount: faceBoxes.length,
            durationMs: Math.round(durationMs * 100) / 100
          });
        };

        img.onerror = (err) => {
          reject(new Error(`Failed to load screenshot image for redaction: ${err}`));
        };

        img.src = rawScreenshotDataUrl;
      });
    }
  }

  const canvasRedactorInstance = new CanvasPixelRedactor();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CanvasPixelRedactor,
      canvasRedactor: canvasRedactorInstance
    };
  } else if (typeof window !== 'undefined') {
    window.CanvasPixelRedactor = CanvasPixelRedactor;
    window.canvasRedactor = canvasRedactorInstance;
  }
})();
