/**
 * PrivacyShield - Local Multi-Pass OCR & Document PII Recognition Engine
 * 
 * Capabilities:
 * 1. Multi-pass OCR with 2x/3x upscaling, grayscale, contrast enhancement, sharpening, and thresholding.
 * 2. Document/Passport field-label detection (Passport No, Surname, Given Names, DOB, Nationality, Sex, POB, Issue/Expiry Dates, Signature, MRZ).
 * 3. Spatial value localization: extracts complete bounding boxes for values situated right or below labels.
 * 4. MRZ (Machine Readable Zone) and signature drawing detection and redaction.
 * 5. Integrated fallback regex/checksum PII detection (Aadhaar, PAN, Cards, Emails, Phones).
 * 6. Compatible with both Browser (HTML5 Canvas) and Node.js environments.
 */
(function() {
  'use strict';

  // In Node environment, optionally require pngjs for headless test execution
  let nodePNG = null;
  let nodeFS = null;
  if (typeof require !== 'undefined' && (typeof window === 'undefined' || !window.document)) {
    try {
      nodePNG = require('pngjs').PNG;
      nodeFS = require('fs');
    } catch (e) {}
  }

  // Canonical Document Field Definitions with Multilingual Label Patterns
  const FIELD_RULES = [
    {
      key: 'PASSPORT_NO',
      name: 'Passport Number',
      labelRegex: /(?:passport\s*(?:no|num|number|#)|nimevo\s*pa[sz]p[oò]|passeport\s*(?:no|num|#)|doc(?:ument)?\s*(?:no|num|number|#)|pass\s*(?:no|num)|id\s*(?:no|num|number)|document\s*(?:no|num|number))/i,
      valuePattern: /^[A-Z0-9]{6,12}$/i,
      tokenPrefix: 'PASSPORT_NO'
    },
    {
      key: 'SURNAME',
      name: 'Surname',
      labelRegex: /(?:surname|nom(?:\s*de\s*famille)?|siyati(?!\s*m[eè]t)|last\s*name|family\s*name|apellidos?)/i,
      valuePattern: /^[A-Za-z\s\-']{2,35}$/i,
      tokenPrefix: 'SURNAME'
    },
    {
      key: 'GIVEN_NAME',
      name: 'Given Name',
      labelRegex: /(?:given\s*names?|pr[eé]noms?|non(?!\s*de\s*bapteme)|first\s*name|forenames?|nombres?)/i,
      valuePattern: /^[A-Za-z\s\-']{2,40}$/i,
      tokenPrefix: 'GIVEN_NAME'
    },
    {
      key: 'NATIONALITY',
      name: 'Nationality',
      labelRegex: /(?:nationality|nationalit[eé]|nasyonalite|citizenship|nacionalidad|staatsangeh)/i,
      valuePattern: /^[A-Za-z\s\-']{3,35}$/i,
      tokenPrefix: 'NATIONALITY'
    },
    {
      key: 'SEX',
      name: 'Sex',
      labelRegex: /(?:sex[e]?|s[eèitì]{1,2}ks|gender|g[eé]nero|geschlecht)/i,
      valuePattern: /^(?:M|F|X|MALE|FEMALE|MASCULIN|FEMININ|MASCULINO|FEMENINO|\/|\s)+$/i,
      tokenPrefix: 'SEX'
    },
    {
      key: 'DOB',
      name: 'Date of Birth',
      labelRegex: /(?:dat[es]?\s*(?:of\s*)?birth|d[aá]t\s*n[eé]sans|date\s*de\s*naissance|birth\s*date|dob|fecha\s*de\s*nacimiento|geburt)/i,
      valuePattern: /(?:\d{1,2}[\s\/\.\-][A-Za-z0-9]{2,10}[\s\/\.\-]\d{2,4}|\d{4}[\s\/\.\-]\d{2}[\s\/\.\-]\d{2})/i,
      tokenPrefix: 'DOB'
    },
    {
      key: 'POB',
      name: 'Place of Birth',
      labelRegex: /(?:place\s*of\s*birth|lieu\s*de\s*naissance|kote\s*l?\s*n[eè]t|place\s*birth|birth\s*place|lugar\s*de\s*nacimiento|geburtsort)/i,
      valuePattern: /^[A-Za-z0-9\s,\.\-']{3,50}$/i,
      tokenPrefix: 'POB'
    },
    {
      key: 'ISSUE_DATE',
      name: 'Date of Issue',
      labelRegex: /(?:dat[es]?\s*(?:of\s*)?issue|issue\s*date|d[aá]t\s*emisyon|date\s*de\s*d[eé]livrance|fecha\s*de\s*emisi[oó]n|ausstellungsdatum)/i,
      valuePattern: /(?:\d{1,2}[\s\/\.\-][A-Za-z0-9]{2,10}[\s\/\.\-]\d{2,4}|\d{4}[\s\/\.\-]\d{2}[\s\/\.\-]\d{2})/i,
      tokenPrefix: 'ISSUE_DATE'
    },
    {
      key: 'EXPIRY_DATE',
      name: 'Date of Expiry',
      labelRegex: /(?:dat[es]?\s*(?:of\s*)?expir(?:y|ation)|d[aá]t\s*ekspirasyon|date\s*d['\s]*expiration|valid\s*until|expiry\s*date|expiration\s*date|fecha\s*de\s*caducidad|gultig\s*bis)/i,
      valuePattern: /(?:\d{1,2}[\s\/\.\-][A-Za-z0-9]{2,10}[\s\/\.\-]\d{2,4}|\d{4}[\s\/\.\-]\d{2}[\s\/\.\-]\d{2})/i,
      tokenPrefix: 'EXPIRY_DATE'
    },
    {
      key: 'SIGNATURE',
      name: 'Signature',
      labelRegex: /(?:signature(?:\s*du\s*titulaire)?|siyati\s*m[eè]t(?:\s*paspo)?|holder['\s]*s\s*signature|unterschrift|firma)/i,
      tokenPrefix: 'SIGNATURE'
    }
  ];

  class OCRWorker {
    constructor() {
      this.worker = null;
      this.isReady = false;
      this.isLoading = false;
      this.sandboxIframe = null;
      this.isSandboxReady = false;
    }

    _ensureSandbox() {
      if (this.sandboxIframe && this.sandboxIframe.parentNode) return this.sandboxIframe;
      if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return null;

      try {
        let iframe = document.getElementById('phantom-ocr-sandbox-frame');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'phantom-ocr-sandbox-frame';
          iframe.src = chrome.runtime.getURL('lib/vision/tesseract/sandbox.html');
          iframe.style.cssText = 'position:fixed!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;border:none!important;z-index:-1!important;';
          (document.body || document.documentElement).appendChild(iframe);
        }
        this.sandboxIframe = iframe;
        return iframe;
      } catch (e) {
        console.warn('[PrivacyShield OCR] Failed to create sandbox iframe:', e);
        return null;
      }
    }

    _callSandbox(action, imageInput, timeoutMs = 12000) {
      return new Promise((resolve) => {
        const msgId = 'ocr_' + Math.random().toString(36).slice(2, 9);
        let timer = null;

        const onMessage = (event) => {
          const data = event.data;
          if (!data || data.target !== 'PHANTOM_OCR_CLIENT' || data.id !== msgId) return;

          window.removeEventListener('message', onMessage);
          if (timer) clearTimeout(timer);

          if (data.success && data.result) {
            resolve(data.result);
          } else {
            console.warn('[PrivacyShield OCR] Sandbox returned error:', data.error);
            resolve({ sensitiveFields: [], ocrBoxes: [], lines: [], words: [], fullText: '' });
          }
        };

        window.addEventListener('message', onMessage);

        timer = setTimeout(() => {
          window.removeEventListener('message', onMessage);
          console.warn('[PrivacyShield OCR] Sandbox call timed out after', timeoutMs, 'ms');
          resolve({ sensitiveFields: [], ocrBoxes: [], lines: [], words: [], fullText: '' });
        }, timeoutMs);

        let serializedImage = imageInput;
        try {
          if (typeof window !== 'undefined') {
            if (imageInput instanceof HTMLCanvasElement) {
              serializedImage = imageInput.toDataURL('image/png');
            } else if (imageInput instanceof HTMLImageElement) {
              const canvas = document.createElement('canvas');
              canvas.width = imageInput.naturalWidth || imageInput.width;
              canvas.height = imageInput.naturalHeight || imageInput.height;
              canvas.getContext('2d').drawImage(imageInput, 0, 0);
              serializedImage = canvas.toDataURL('image/png');
            }
          }
        } catch (_) {}

        const iframe = this._ensureSandbox();
        if (!iframe || !iframe.contentWindow) {
          if (timer) clearTimeout(timer);
          window.removeEventListener('message', onMessage);
          return resolve({ sensitiveFields: [], ocrBoxes: [], lines: [], words: [], fullText: '' });
        }

        const sendMsg = () => {
          try {
            iframe.contentWindow.postMessage({
              id: msgId,
              target: 'PHANTOM_OCR_SANDBOX',
              action,
              imageInput: serializedImage
            }, '*');
          } catch (err) {
            console.warn('[PrivacyShield OCR] Failed to postMessage to sandbox:', err);
            if (timer) clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            resolve({ sensitiveFields: [], ocrBoxes: [], lines: [], words: [], fullText: '' });
          }
        };

        if (this.isSandboxReady) {
          sendMsg();
        } else {
          iframe.addEventListener('load', () => {
            this.isSandboxReady = true;
            sendMsg();
          }, { once: true });
          setTimeout(sendMsg, 400);
        }
      });
    }

    async init() {
      if (this.isReady || this.isLoading) return;
      this.isLoading = true;

      // In browser content script context (outside sandbox), initialize sandbox iframe bridge
      if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__PHANTOM_OCR_IS_SANDBOX__) {
        this._ensureSandbox();
        this.isReady = true;
        this.isLoading = false;
        return;
      }

      try {
        let tesseractLib = (typeof window !== 'undefined' && window.Tesseract) || (typeof Tesseract !== 'undefined' ? Tesseract : null);
        if (!tesseractLib && typeof require !== 'undefined') {
          try {
            tesseractLib = require('tesseract.js');
          } catch (e) {}
        }

        if (!tesseractLib) {
          throw new Error('Tesseract library not loaded');
        }

        const extUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
          ? chrome.runtime.getURL('') 
          : '';

        const workerOptions = {
          workerPath: extUrl ? (extUrl + 'lib/vision/tesseract/worker.min.js') : 'worker.min.js',
          corePath: extUrl ? (extUrl + 'lib/vision/tesseract/tesseract-core.wasm.js') : 'tesseract-core.wasm.js',
          langPath: extUrl ? (extUrl + 'lib/vision/tesseract/') : './',
          workerBlobURL: false,
          gzip: true
        };

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tesseract init timeout')), 10000)
        );

        if (typeof window !== 'undefined') {
          try {
            this.worker = await Promise.race([
              tesseractLib.createWorker('eng', 1, workerOptions),
              timeoutPromise
            ]);
          } catch (blobErr) {
            console.warn('[PrivacyShield] Custom worker options failed, fallback createWorker:', blobErr);
            this.worker = await Promise.race([
              tesseractLib.createWorker('eng'),
              timeoutPromise
            ]);
          }
        } else {
          this.worker = await Promise.race([
            tesseractLib.createWorker('eng'),
            timeoutPromise
          ]);
        }
        
        this.isReady = true;
        console.log('[PrivacyShield] Tesseract OCR Worker Ready.');
      } catch (err) {
        console.error('[PrivacyShield] Failed to initialize OCR:', err);
      } finally {
        this.isLoading = false;
      }
    }

    /**
     * Preprocesses an image using upscaling, grayscale, contrast enhancement, sharpening, and thresholding.
     * Works across both Browser (HTML5 Canvas) and Node (pngjs / buffers).
     * @param {string|HTMLImageElement|HTMLCanvasElement|Buffer} imageInput
     * @param {Object} options - { scale: 2.0, contrast: 1.5, threshold: true|false, sharpen: true|false }
     * @returns {Promise<Object>} { preprocessed, scale, origWidth, origHeight }
     */
    async preprocessImage(imageInput, options = {}) {
      const scale = options.scale || 2.0;
      const contrast = options.contrast !== undefined ? options.contrast : 1.5;
      const doThreshold = options.threshold || false;
      const doSharpen = options.sharpen !== undefined ? options.sharpen : true;

      // ── BROWSER CANVAS IMPLEMENTATION ──
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        return new Promise((resolve, reject) => {
          const processCanvas = (sourceImg, origW, origH) => {
            try {
              const targetW = Math.round(origW * scale);
              const targetH = Math.round(origH * scale);

              const canvas = document.createElement('canvas');
              canvas.width = targetW;
              canvas.height = targetH;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });

              // 1. Bilinear Upscaling
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(sourceImg, 0, 0, targetW, targetH);

              const imgData = ctx.getImageData(0, 0, targetW, targetH);
              const d = imgData.data;

              // 2. Grayscale & Contrast
              const grayBuf = new Float32Array(targetW * targetH);
              for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                // ITU-R BT.601 luma formula
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                // Contrast stretch
                gray = (gray - 128) * contrast + 128;
                gray = Math.max(0, Math.min(255, gray));
                grayBuf[p] = gray;
              }

              // 3. Optional Sharpening (Laplacian Kernel)
              const outGray = new Uint8ClampedArray(targetW * targetH);
              if (doSharpen) {
                for (let y = 1; y < targetH - 1; y++) {
                  for (let x = 1; x < targetW - 1; x++) {
                    const idx = y * targetW + x;
                    const val = 5 * grayBuf[idx] 
                      - grayBuf[idx - 1] 
                      - grayBuf[idx + 1] 
                      - grayBuf[idx - targetW] 
                      - grayBuf[idx + targetW];
                    outGray[idx] = Math.max(0, Math.min(255, val));
                  }
                }
              } else {
                for (let i = 0; i < grayBuf.length; i++) {
                  outGray[i] = Math.round(grayBuf[i]);
                }
              }

              // 4. Thresholding (Otsu-style binarization)
              let threshVal = 138;
              if (doThreshold) {
                let sum = 0;
                for (let i = 0; i < outGray.length; i++) sum += outGray[i];
                threshVal = Math.round(sum / outGray.length);
              }

              // Write back to canvas
              for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                let pixel = outGray[p];
                if (doThreshold) {
                  pixel = pixel < threshVal ? 0 : 255;
                }
                d[i] = pixel;
                d[i + 1] = pixel;
                d[i + 2] = pixel;
                d[i + 3] = 255;
              }

              ctx.putImageData(imgData, 0, 0);
              resolve({
                preprocessed: canvas,
                dataUrl: canvas.toDataURL('image/png'),
                scale,
                origWidth: origW,
                origHeight: origH
              });
            } catch (err) {
              reject(err);
            }
          };

          if (imageInput instanceof HTMLCanvasElement) {
            processCanvas(imageInput, imageInput.width, imageInput.height);
          } else if (imageInput instanceof HTMLImageElement) {
            processCanvas(imageInput, imageInput.naturalWidth || imageInput.width, imageInput.naturalHeight || imageInput.height);
          } else if (typeof imageInput === 'string') {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => processCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
            img.onerror = (e) => reject(new Error('Failed to load image input: ' + e));
            img.src = imageInput;
          } else {
            reject(new Error('Unsupported browser image input'));
          }
        });
      }

      // ── NODE.JS PNGJS IMPLEMENTATION ──
      if (nodePNG) {
        let rawBuffer = null;
        if (Buffer.isBuffer(imageInput)) {
          rawBuffer = imageInput;
        } else if (typeof imageInput === 'string' && imageInput.startsWith('data:image')) {
          const b64 = imageInput.split(',')[1] || imageInput;
          rawBuffer = Buffer.from(b64, 'base64');
        } else if (nodeFS && typeof imageInput === 'string' && nodeFS.existsSync(imageInput)) {
          rawBuffer = nodeFS.readFileSync(imageInput);
        }

        if (rawBuffer) {
          const srcPng = nodePNG.sync.read(rawBuffer);
          const origW = srcPng.width;
          const origH = srcPng.height;
          const targetW = Math.round(origW * scale);
          const targetH = Math.round(origH * scale);

          const dstPng = new nodePNG({ width: targetW, height: targetH });
          const grayBuf = new Float32Array(targetW * targetH);

          // 1. Bilinear Upscaling & Grayscale
          for (let y = 0; y < targetH; y++) {
            const srcY = Math.min(origH - 1, Math.floor(y / scale));
            for (let x = 0; x < targetW; x++) {
              const srcX = Math.min(origW - 1, Math.floor(x / scale));
              const srcIdx = (srcY * origW + srcX) * 4;
              const r = srcPng.data[srcIdx];
              const g = srcPng.data[srcIdx + 1];
              const b = srcPng.data[srcIdx + 2];

              let gray = 0.299 * r + 0.587 * g + 0.114 * b;
              gray = (gray - 128) * contrast + 128;
              gray = Math.max(0, Math.min(255, gray));
              grayBuf[y * targetW + x] = gray;
            }
          }

          // 2. Thresholding / Finalizing
          let threshVal = 138;
          if (doThreshold) {
            let sum = 0;
            for (let i = 0; i < grayBuf.length; i++) sum += grayBuf[i];
            threshVal = Math.round(sum / grayBuf.length);
          }

          for (let y = 0; y < targetH; y++) {
            for (let x = 0; x < targetW; x++) {
              const idx = y * targetW + x;
              let pixel = grayBuf[idx];
              if (doThreshold) {
                pixel = pixel < threshVal ? 0 : 255;
              } else {
                pixel = Math.max(0, Math.min(255, Math.round(pixel)));
              }
              const dstIdx = idx * 4;
              dstPng.data[dstIdx] = pixel;
              dstPng.data[dstIdx + 1] = pixel;
              dstPng.data[dstIdx + 2] = pixel;
              dstPng.data[dstIdx + 3] = 255;
            }
          }

          const outBuffer = nodePNG.sync.write(dstPng);
          return {
            preprocessed: outBuffer,
            buffer: outBuffer,
            scale,
            origWidth: origW,
            origHeight: origH
          };
        }
      }

      // Default fallback if no preprocessor available
      return { preprocessed: imageInput, scale: 1.0 };
    }

    /**
     * Executes multi-pass OCR on an image and extracts structured text, lines, words, and bounding boxes.
     * @param {string|HTMLImageElement|HTMLCanvasElement|Buffer} imageInput
     * @returns {Promise<Object>} { fullText, lines, words, blocks, passes }
     */
    async multiPassRecognize(imageInput) {
      if (!this.isReady) await this.init();
      if (!this.worker) return { fullText: '', lines: [], words: [], blocks: [] };

      // In browser, preprocess returns a canvas – pass it directly to Tesseract
      // In Node, preprocess returns a Buffer – pass it directly
      const pass1Pre = await this.preprocessImage(imageInput, { scale: 2.0, contrast: 1.5, threshold: false });
      const pass1Target = pass1Pre.buffer || pass1Pre.preprocessed || imageInput;

      let pass1Data = null;
      try {
        const res1 = await this.worker.recognize(pass1Target, {}, { blocks: true, hocr: true });
        pass1Data = res1.data;
      } catch (e1) {
        console.warn('[PrivacyShield] OCR Pass 1 error:', e1);
        // Fallback: try recognizing original without preprocessing
        try {
          const res1b = await this.worker.recognize(imageInput, {}, { blocks: true, hocr: true });
          pass1Data = res1b.data;
        } catch (e1b) {
          console.warn('[PrivacyShield] OCR Pass 1 fallback error:', e1b);
        }
      }

      // Pass 2: 2x Thresholded (Binarized for crisp alphanumeric characters / dates)
      const pass2Pre = await this.preprocessImage(imageInput, { scale: 2.0, contrast: 1.6, threshold: true });
      const pass2Target = pass2Pre.buffer || pass2Pre.preprocessed || imageInput;

      let pass2Data = null;
      try {
        const res2 = await this.worker.recognize(pass2Target, {}, { blocks: true, hocr: true });
        pass2Data = res2.data;
      } catch (e2) {
        console.warn('[PrivacyShield] OCR Pass 2 error:', e2);
      }

      // Choose primary pass (highest text length / confidence)
      const primaryData = (pass1Data && pass1Data.text && pass1Data.text.length >= (pass2Data?.text?.length || 0))
        ? pass1Data
        : (pass2Data || pass1Data);

      if (!primaryData) {
        return { fullText: '', lines: [], words: [], blocks: [] };
      }

      const scale = pass1Pre.scale || 2.0;

      // ── Flatten ALL blocks → ALL paragraphs → ALL lines ──
      // (passport text is spread across multiple blocks)
      const allRawLines = [];
      for (const block of (primaryData.blocks || [])) {
        for (const para of (block.paragraphs || [])) {
          for (const line of (para.lines || [])) {
            allRawLines.push(line);
          }
        }
      }

      const normalizedLines = [];
      const normalizedWords = [];

      allRawLines.forEach((l, lIdx) => {
        const lineWords = [];
        (l.words || []).forEach(w => {
          const nw = {
            text: w.text,
            clean: w.text.replace(/[^a-zA-Z0-9]/g, ''),
            confidence: w.confidence,
            lineIdx: lIdx,
            bbox: {
              x0: Math.round(w.bbox.x0 / scale),
              y0: Math.round(w.bbox.y0 / scale),
              x1: Math.round(w.bbox.x1 / scale),
              y1: Math.round(w.bbox.y1 / scale)
            }
          };
          lineWords.push(nw);
          normalizedWords.push(nw);
        });

        normalizedLines.push({
          text: l.text.trim(),
          confidence: l.confidence,
          words: lineWords,
          bbox: {
            x0: Math.round(l.bbox.x0 / scale),
            y0: Math.round(l.bbox.y0 / scale),
            x1: Math.round(l.bbox.x1 / scale),
            y1: Math.round(l.bbox.y1 / scale)
          }
        });
      });

      return {
        fullText: primaryData.text || '',
        lines: normalizedLines,
        words: normalizedWords,
        blocks: primaryData.blocks || []
      };
    }

    /**
     * Inspects document text and labels, localizes sensitive values, signatures, and MRZ zones,
     * and generates bounding boxes for pixel redaction.
     * @param {string|HTMLImageElement|HTMLCanvasElement|Buffer} imageInput
     * @returns {Promise<Object>} { sensitiveFields, ocrBoxes, fullText, lines }
     */
    async detectSensitiveBoxes(imageInput) {
      // In browser content script context (outside sandbox), delegate to extension sandbox
      if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__PHANTOM_OCR_IS_SANDBOX__) {
        return this._callSandbox('DETECT_SENSITIVE_BOXES', imageInput);
      }

      const ocrResult = await this.multiPassRecognize(imageInput);
      const lines = ocrResult.lines || [];
      const words = ocrResult.words || [];

      const detections = [];
      const ocrBoxes = [];
      const processedWordIndices = new Set();

      function isLabelWord(word) {
        return /\b(?:place|birth|date|issue|expiry|expiration|given|name|names|surname|last|first|nationality|sex|gender|country|code|type|kalite|nimevo|peyi|ayiti|pasp|passeport|titulaire|lieu|reconosion|du|de|of|siyati|s[eèitì]{1,2}ks|non|d[aá]t|n[eé]sans|kote|emisyon|ekspirasyon|holder|signature|republic|document|doc|no|num|number)\b/i.test(word.clean || word.text) || word.text === '/' || word.text === '|';
      }

      // ── 1. FIELD-LABEL DETECTION & SPATIAL VALUE LOCALIZATION ──
      for (const def of FIELD_RULES) {
        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          const line = lines[lIdx];
          const lineStr = line.text;
          const match = def.labelRegex.exec(lineStr);
          if (!match) continue;

          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          // Identify specific words matching the label pattern
          let charPos = 0;
          const labelWords = [];
          for (const w of line.words) {
            const wIdx = lineStr.indexOf(w.text, charPos);
            const wEnd = (wIdx !== -1 ? wIdx : charPos) + w.text.length;
            charPos = wEnd;
            if (wIdx < matchEnd && wEnd > matchStart) {
              labelWords.push(w);
            }
          }
          if (labelWords.length === 0) continue;

          // Cluster line words into column groups separated by horizontal gaps > 24px
          const clusters = [];
          let currentCluster = [];
          for (let i = 0; i < line.words.length; i++) {
            const w = line.words[i];
            if (currentCluster.length === 0) {
              currentCluster.push(w);
            } else {
              const prevW = currentCluster[currentCluster.length - 1];
              if (w.bbox.x0 - prevW.bbox.x1 > 24) {
                clusters.push(currentCluster);
                currentCluster = [w];
              } else {
                currentCluster.push(w);
              }
            }
          }
          if (currentCluster.length > 0) {
            clusters.push(currentCluster);
          }

          // Find the cluster containing the matched label words
          let matchedClusterIdx = -1;
          for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
            const cWords = clusters[cIdx];
            if (cWords.some(w => labelWords.includes(w))) {
              matchedClusterIdx = cIdx;
              break;
            }
          }

          const clusterWords = matchedClusterIdx !== -1 ? clusters[matchedClusterIdx] : labelWords;
          let lx0 = Math.min(...clusterWords.map(w => w.bbox.x0));
          const ly0 = Math.min(...clusterWords.map(w => w.bbox.y0));
          let lx1 = Math.max(...clusterWords.map(w => w.bbox.x1));
          const ly1 = Math.max(...clusterWords.map(w => w.bbox.y1));

          // Right boundary: where next column cluster starts (if any)
          const nextCluster = (matchedClusterIdx !== -1 && matchedClusterIdx < clusters.length - 1)
            ? clusters[matchedClusterIdx + 1]
            : null;
          const maxColX = nextCluster
            ? Math.min(...nextCluster.map(w => w.bbox.x0)) - 4
            : Math.max(lx1 + 60, lx0 + 175);
          const minColX = Math.max(0, lx0 - 18);

          // Case A: Value to the right on the same line (within same column and immediate vicinity)
          const rightCandidates = words.filter(w => {
            return w.lineIdx === lIdx &&
              w.bbox.x0 >= lx1 + 4 &&
              w.bbox.x1 <= maxColX &&
              (w.bbox.x0 - lx1) <= 60 &&
              !isLabelWord(w);
          });

          if (rightCandidates.length > 0 && def.key !== 'SIGNATURE') {
            const valText = rightCandidates.map(w => w.text).join(' ').trim();
            if (!def.valuePattern || def.valuePattern.test(valText)) {
              const vx0 = Math.min(...rightCandidates.map(w => w.bbox.x0));
              const vy0 = Math.min(...rightCandidates.map(w => w.bbox.y0));
              const vx1 = Math.max(...rightCandidates.map(w => w.bbox.x1));
              const vy1 = Math.max(...rightCandidates.map(w => w.bbox.y1));
              const box = {
                x: Math.max(0, vx0 - 2),
                y: Math.max(0, vy0 - 2),
                width: vx1 - vx0 + 4,
                height: vy1 - vy0 + 4,
                tokens: [`[${def.tokenPrefix}_1]`],
                field: def.key,
                value: valText
              };
              detections.push({
                field: def.key,
                name: def.name,
                value: valText,
                bbox: box,
                confidence: Math.round(rightCandidates.reduce((acc, w) => acc + w.confidence, 0) / rightCandidates.length),
                token: box.tokens[0]
              });
              ocrBoxes.push(box);
              rightCandidates.forEach(w => processedWordIndices.add(w));
              continue;
            }
          }

          // Case B: Value on the line directly below (within column bounds)
          const belowCandidates = words.filter(w => {
            if (processedWordIndices.has(w)) return false;
            if (w.bbox.y0 < ly1 - 2 || w.bbox.y0 > ly1 + 35) return false;
            if (w.bbox.x0 < minColX || w.bbox.x1 > maxColX + 30) return false;
            const xOverlap = Math.max(0, Math.min(w.bbox.x1, maxColX) - Math.max(w.bbox.x0, minColX));
            return xOverlap > 0 && !isLabelWord(w);
          });

          if (belowCandidates.length > 0 && def.key !== 'SIGNATURE') {
            const targetLineIdx = belowCandidates[0].lineIdx;
            const lineWords = belowCandidates.filter(w => w.lineIdx === targetLineIdx);
            const valText = lineWords.map(w => w.text).join(' ').trim();

            if (!def.valuePattern || def.valuePattern.test(valText) || valText.length >= 2) {
              const vx0 = Math.min(...lineWords.map(w => w.bbox.x0));
              const vy0 = Math.min(...lineWords.map(w => w.bbox.y0));
              const vx1 = Math.max(...lineWords.map(w => w.bbox.x1));
              const vy1 = Math.max(...lineWords.map(w => w.bbox.y1));
              const box = {
                x: Math.max(0, vx0 - 2),
                y: Math.max(0, vy0 - 2),
                width: vx1 - vx0 + 4,
                height: vy1 - vy0 + 4,
                tokens: [`[${def.tokenPrefix}_1]`],
                field: def.key,
                value: valText
              };
              detections.push({
                field: def.key,
                name: def.name,
                value: valText,
                bbox: box,
                confidence: Math.round(lineWords.reduce((acc, w) => acc + w.confidence, 0) / lineWords.length),
                token: box.tokens[0]
              });
              ocrBoxes.push(box);
              lineWords.forEach(w => processedWordIndices.add(w));
              continue;
            }
          }

          // Case C: Signature Area
          if (def.key === 'SIGNATURE' && !detections.some(d => d.field === 'SIGNATURE')) {
            const sigX0 = Math.max(0, Math.round(lx0 - 20));
            const sigY0 = Math.round(ly1 + 2);
            const sigW = Math.round(lx1 - lx0 + 40);
            const sigH = 45; // Generous height to cover signature ink glyphs
            const box = {
              x: sigX0,
              y: sigY0,
              width: sigW,
              height: sigH,
              tokens: ['[SIGNATURE_1]'],
              field: 'SIGNATURE',
              value: '[SIGNATURE_INK_REGION]'
            };
            detections.push({
              field: 'SIGNATURE',
              name: 'Signature',
              value: '[SIGNATURE_INK_REGION]',
              bbox: box,
              confidence: 90,
              token: '[SIGNATURE_1]'
            });
            ocrBoxes.push(box);
          }
        }
      }

      // ── 2. STANDALONE PASSPORT / ID NUMBER PATTERNS ──
      words.forEach(w => {
        // Matches standard alphanumeric passport numbers e.g. HA999999, Z3849201, 502198421, ID9872410
        // Excludes dates with slashes/dashes
        if (!w.text.includes('/') && !w.text.includes('-') && (/^[A-Z]{1,3}\d{6,9}$/i.test(w.clean) || /^[A-Z]\d{7,8}$/i.test(w.clean))) {
          if (!detections.some(d => d.value.includes(w.clean) && Math.abs(d.bbox.y - w.bbox.y0) < 15)) {
            const box = {
              x: Math.max(0, w.bbox.x0 - 2),
              y: Math.max(0, w.bbox.y0 - 2),
              width: w.bbox.x1 - w.bbox.x0 + 4,
              height: w.bbox.y1 - w.bbox.y0 + 4,
              tokens: [`[PASSPORT_NO_${detections.filter(d => d.field === 'PASSPORT_NO').length + 1}]`],
              field: 'PASSPORT_NO',
              value: w.clean
            };
            detections.push({
              field: 'PASSPORT_NO',
              name: 'Passport Number',
              value: w.clean,
              bbox: box,
              confidence: w.confidence,
              token: box.tokens[0]
            });
            ocrBoxes.push(box);
          }
        }
      });

      // ── 3. MRZ (MACHINE READABLE ZONE) DETECTION ──
      const mrzLines = lines.filter(l => {
        const text = l.text.replace(/\s+/g, '');
        const chevronCount = (text.match(/</g) || []).length;
        return (
          chevronCount >= 2 &&
          (
            /^[A-Z0-9<]{24,45}$/.test(text) ||
            /(?:P<[A-Z0-9<]{3}|I<[A-Z0-9<]{3}|V<[A-Z0-9<]{3}|[A-Z0-9<]{3}<<[A-Z0-9<]{3})/.test(text)
          )
        );
      });

      if (mrzLines.length > 0) {
        const mx0 = Math.min(...mrzLines.map(l => l.bbox.x0));
        const my0 = Math.min(...mrzLines.map(l => l.bbox.y0));
        const mx1 = Math.max(...mrzLines.map(l => l.bbox.x1));
        const my1 = Math.max(...mrzLines.map(l => l.bbox.y1));

        const mrzBox = {
          x: Math.max(0, mx0 - 4),
          y: Math.max(0, my0 - 4),
          width: mx1 - mx0 + 8,
          height: my1 - my0 + 8,
          tokens: ['[MRZ_COMPLETE]'],
          field: 'MRZ',
          value: mrzLines.map(l => l.text).join('\n')
        };
        detections.push({
          field: 'MRZ',
          name: 'Machine Readable Zone',
          value: mrzBox.value,
          bbox: mrzBox,
          confidence: 95,
          token: '[MRZ_COMPLETE]'
        });
        ocrBoxes.push(mrzBox);
      }

      // ── 4. INTEGRATED REGEX/CHECKSUM PII FALLBACK ──
      const textPIIDetector = (typeof window !== 'undefined' && window.textPIIDetector) 
        || (typeof require !== 'undefined' ? require('../pii/text-detector').detector : null);

      if (textPIIDetector && typeof textPIIDetector.detectAndSanitize === 'function') {
        for (const w of words) {
          if (processedWordIndices.has(w) || w.clean.length < 5) continue;
          const piiRes = textPIIDetector.detectAndSanitize(w.text);
          if (piiRes && piiRes.detectedSpans && piiRes.detectedSpans.length > 0) {
            const span = piiRes.detectedSpans[0];
            const box = {
              x: Math.max(0, w.bbox.x0 - 2),
              y: Math.max(0, w.bbox.y0 - 2),
              width: w.bbox.x1 - w.bbox.x0 + 4,
              height: w.bbox.y1 - w.bbox.y0 + 4,
              tokens: [span.token],
              field: span.category || 'PII',
              value: span.text
            };
            detections.push({
              field: span.category || 'PII',
              name: span.category || 'PII Entity',
              value: span.text,
              bbox: box,
              confidence: w.confidence,
              token: span.token
            });
            ocrBoxes.push(box);
          }
        }
      }

      return {
        sensitiveFields: detections,
        ocrBoxes: ocrBoxes,
        fullText: ocrResult.fullText,
        lines: lines
      };
    }

    /**
     * Scans all <img> elements on the page for identity documents / passports.
     * Maps detected sensitive fields to VIEWPORT coordinates for DOM overlays,
     * and SCREENSHOT coordinates for canvas redaction.
     * @returns {Promise<Object>} { domOcrBoxes, screenshotOcrBoxes, sensitiveCount }
     */
    async scanPageImages() {
      if (typeof document === 'undefined') return { domOcrBoxes: [], screenshotOcrBoxes: [], sensitiveCount: 0 };

      const images = Array.from(document.querySelectorAll('img'));
      const domOcrBoxes = [];
      const screenshotOcrBoxes = [];
      let sensitiveCount = 0;

      for (const img of images) {
        if (img.closest('#privacyshield-root')) continue;
        const rect = img.getBoundingClientRect();
        // Skip tiny icons and non-displayed images
        if (rect.width < 100 || rect.height < 80) continue;
        if (!img.complete || img.naturalWidth === 0) continue;

        try {
          const nw = img.naturalWidth || img.width || rect.width;
          const nh = img.naturalHeight || img.height || rect.height;
          const canvas = document.createElement('canvas');
          canvas.width = nw;
          canvas.height = nh;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, nw, nh);
          const dataUrl = canvas.toDataURL('image/png');

          const res = await this.detectSensitiveBoxes(dataUrl);
          if (!res || !res.sensitiveFields || res.sensitiveFields.length === 0) continue;

          // Scaling between natural image pixels and viewport CSS pixels
          const scaleX = rect.width / nw;
          const scaleY = rect.height / nh;

          // Screen scaling (DPR)
          const screenScaleX = (window.devicePixelRatio || 1);

          for (const f of res.sensitiveFields) {
            const b = f.bbox;
            if (!b || b.width < 4 || b.height < 4) continue;

            const vpX = Math.round(rect.left + b.x * scaleX);
            const vpY = Math.round(rect.top + b.y * scaleY);
            const vpW = Math.round(b.width * scaleX);
            const vpH = Math.round(b.height * scaleY);

            const token = f.tokens ? f.tokens[0] : `[${f.field}]`;

            // Viewport box for live DOM overlay
            domOcrBoxes.push({
              x: vpX,
              y: vpY,
              width: vpW,
              height: vpH,
              field: f.field,
              name: f.name,
              value: f.value,
              tokens: [token]
            });

            // Screenshot box for canvas pixel redaction
            screenshotOcrBoxes.push({
              x: Math.round(vpX * screenScaleX),
              y: Math.round(vpY * screenScaleX),
              width: Math.round(vpW * screenScaleX),
              height: Math.round(vpH * screenScaleX),
              field: f.field,
              value: f.value,
              tokens: [token]
            });

            sensitiveCount++;
          }
        } catch (imgErr) {
          console.warn('[PrivacyShield OCR] Failed to scan image element:', imgErr);
        }
      }

      return { domOcrBoxes, screenshotOcrBoxes, sensitiveCount };
    }

    /**
     * Backward-compatible basic recognize call.
     * @param {string|HTMLImageElement|HTMLCanvasElement} image 
     * @returns {Promise<Object>} { text, words }
     */
    async recognize(image) {
      if (!this.isReady) await this.init();
      if (!this.worker) return { text: '', words: [] };

      try {
        const result = await this.worker.recognize(image);
        return {
          text: result.data.text,
          words: (result.data.words || []).map(w => ({
            text: w.text,
            bbox: w.bbox,
            confidence: w.confidence
          }))
        };
      } catch (e) {
        console.error('[PrivacyShield] OCR error:', e);
        return { text: '', words: [] };
      }
    }
  }

  const ocrWorkerInstance = new OCRWorker();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OCRWorker, ocrWorker: ocrWorkerInstance };
  } else if (typeof window !== 'undefined') {
    window.OCRWorker = OCRWorker;
    window.ocrWorker = ocrWorkerInstance;
  }
})();
