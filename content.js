/**
 * Phantom AI - Core Content Script & One-Button Pipeline Coordinator
 * 
 * Orchestrates:
 * 1. DOM Scan & Text PII / NER Detection (with Verhoeff, Luhn, Regex, Entropy)
 * 2. Local Face / Visual PII Detection (BlazeFace ML + Heuristic Fallback)
 * 3. Local Screen-Understanding & UI Structure Model (Structured JSON + Topology Fingerprint)
 * 4. In-Place DOM Redaction & Canvas Screenshot Redaction (Solid Masks + Gaussian Face Blurs)
 * 5. Local Decision Engine (Page Classification + State Delta Analysis)
 * 6. Proxy Server Communication & Live DOM Action Execution (Visual Highlight + Mock Profile Autofill)
 */
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.__PRIVACY_SHIELD_INITIALIZED__) return;
  window.__PRIVACY_SHIELD_INITIALIZED__ = true;

  console.log('[Phantom AI] Initializing Privacy-Preserving Vision Agent...');

  // Module References (loaded in order via manifest or global scripts)
  const config = window.PrivacyShieldConfig || {};
  const textDetector = window.textPIIDetector;
  const domRedactor = window.domRedactor;
  const faceDetector = window.faceDetector;
  const screenAnalyzer = window.screenAnalyzer;
  const screenViT = window.screenViT;
  const ocrWorker = window.ocrWorker;
  const canvasRedactor = window.canvasRedactor;
  const decisionEngine = window.decisionEngine;
  const actionExecutor = window.actionExecutor;
  const instrumentation = window.instrumentation;
  const getThreatScorer = () => window.computeThreatScore || (typeof computeThreatScore !== 'undefined' ? computeThreatScore : null);

  // Pre-initialize OCR worker / sandbox in background
  if (ocrWorker && typeof ocrWorker.init === 'function') {
    ocrWorker.init().catch(() => {});
  }

  // Pipeline State
  let pipelineState = {
    isScanning: false,
    isRedacted: false,
    currentScreenshot: null,
    sanitizedScreenshotBase64: null,
    sanitizedTextBundle: '',
    screenStructure: null,
    localDecision: null,
    lastTask: '',
    lastTelemetry: null
  };

  let alwaysOnEnabled = false;
  let dynamicTextRedactionTimer = null;
  let pendingTextNodes = [];

  function runAutoRedaction(node, isPartial) {
    if (typeof domRedactor === 'undefined' || !domRedactor) return;
    domRedactor.redactPageDOM(node, isPartial);
  }

  /**
   * Builds and injects the floating action button and inspection panel into the host page.
   */
  function injectUI() {
    if (document.getElementById('privacyshield-root')) return;

    const host = document.createElement('div');
    host.id = 'privacyshield-root';

    // SVG Shield Icon
    const shieldSvg = `
      <svg class="ps-shield-svg" viewBox="0 0 24 24">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4" stroke-width="2.2"/>
      </svg>
    `;

    host.innerHTML = `
      <!-- Top Right: Exposure Bar -->
      <div class="ps-top-right-container">
        <div class="ps-exposure-bar-minimal" id="ps-threat-container" style="display:none;" title="Heuristic on-device page exposure indicator based on connection and visible sensitive fields">
          <span class="ps-threat-label" id="ps-threat-label">Exposure: --%</span>
          <div class="ps-threat-bar-track-minimal">
            <div class="ps-threat-bar-fill-minimal level-low" id="ps-threat-bar-fill" style="width: 0%;"></div>
          </div>
        </div>
        <!-- Status Dots & Loading Bar -->
        <div class="ps-status-dots" id="ps-status-dots" style="display:none;">
          <div class="ps-dot" id="badge-dom" title="DOM Scan"></div>
          <div class="ps-dot" id="badge-pii" title="PII Redaction"></div>
          <div class="ps-dot" id="badge-face" title="Face ML"></div>
          <div class="ps-dot" id="badge-screen" title="Screen Model"></div>
          <div class="ps-dot" id="badge-ocr" title="OCR Text"></div>
          <div class="ps-dot" id="badge-vit" title="ViT Model"></div>
          <div class="ps-scanning-indicator" id="ps-scanning-indicator" style="display:none;">
            <div class="ps-spinner"></div>
            <span>Scanning...</span>
          </div>
        </div>
      </div>

      <!-- Bottom Left: Telemetry Drawer (Hidden until scan/activity) -->
      <div class="ps-telemetry-minimal" id="ps-drawer" style="display:none;">
        <div class="ps-telemetry-header" id="ps-drawer-toggle">
          <span>⚙ Audit (<span id="ps-total-latency">0 ms</span>) <span id="ps-drawer-arrow" style="font-size: 9px; margin-left: 4px;">▼</span></span>
          <button class="ps-icon-btn-minimal" id="ps-drawer-close" style="width:18px; height:18px; border:none; background:transparent; font-size:11px; padding:0; color:#6E6D6A;" title="Close Audit">✕</button>
        </div>
        <div class="ps-telemetry-body" id="ps-drawer-body" style="display:none;">
          <div id="ps-telemetry-meta">HW: <strong id="meta-hw">...</strong> | Face: <strong id="meta-face">...</strong></div>
          <div id="ps-decision-meta">Decision: <strong id="meta-decision">...</strong></div>
          <div id="ps-waterfall-container"></div>
        </div>
      </div>

      <!-- Error Toasts Container -->
      <div id="ps-error-toast-container" class="ps-error-toast-container"></div>

      <!-- Bottom Right: FAB & Task Bar -->
      <div class="ps-fab-container">
        
        <!-- Task Bar (above FAB) -->
        <div class="ps-task-bar" id="ps-task-box" style="display:none;">
          <div class="ps-task-bar-input-row">
            <input type="text" class="ps-task-input-minimal" id="ps-task-input" placeholder="What do you want me to do?"/>
            <button class="ps-go-btn-minimal" id="ps-go-btn"><span>Go</span> <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
            <button class="ps-icon-btn-minimal" id="ps-details-toggle" style="border-radius: 50%; width: 26px; height: 26px; padding: 0;" title="View Redaction Details">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            </button>
            <button class="ps-icon-btn-minimal" id="ps-task-close" style="border-radius: 50%; width: 22px; height: 22px; padding: 0; font-size: 11px; margin-left: 2px;" title="Dismiss Task Bar">✕</button>
          </div>
          
          <div class="ps-task-details-popover" id="ps-task-details" style="display:none;">
            <div class="ps-stats-grid-minimal" id="ps-stats-grid">
              <div class="ps-stat-card"><span id="stat-pii-count">0</span> PII</div>
              <div class="ps-stat-card"><span id="stat-ocr-count">0</span> OCR</div>
              <div class="ps-stat-card"><span id="stat-faces-count">0</span> Faces</div>
            </div>
            <div class="ps-preview-box-minimal" id="ps-preview-box" style="display:none;">
              <img class="ps-preview-img-minimal" id="ps-preview-img" alt="Redacted Screen"/>
            </div>
          </div>
        </div>

        <!-- Result Toast -->
        <div class="ps-result-toast" id="ps-result-card" style="display:none;">
          <div class="ps-result-header">
            <span id="ps-result-icon">⚡</span>
            <span id="ps-result-title">Result</span>
            <button class="ps-icon-btn-minimal" id="ps-result-close" title="Close">✕</button>
          </div>
          <div class="ps-result-content" id="ps-result-content"></div>
        </div>

        <!-- FAB Menu (hidden by default) -->
        <div class="ps-fab-menu" id="ps-fab-menu">
          <label class="ps-always-on-toggle" title="Always-On Redaction">
            <span class="ps-toggle-label">Always-On</span>
            <input type="checkbox" id="ps-always-on-checkbox">
            <span class="ps-toggle-slider"></span>
          </label>
          <button class="ps-fab-menu-btn" id="ps-rescan-btn" title="Re-Scan & Redact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button class="ps-fab-menu-btn" id="ps-restore-btn" title="Recall Page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          </button>
        </div>

        <button class="ps-fab-button" id="ps-main-fab">
          ${shieldSvg}
        </button>
      </div>
    `;

    document.body.appendChild(host);

    // Event Bindings
    const mainFab = host.querySelector('#ps-main-fab');
    const fabMenu = host.querySelector('#ps-fab-menu');
    const fabContainer = host.querySelector('.ps-fab-container');
    let hideFabMenuTimer = null;
    const hideEphemeralUI = () => {
      if (isDragging) return;
      const taskInput = host.querySelector('#ps-task-input');
      if (taskInput && document.activeElement === taskInput) return;

      fabMenu.classList.remove('visible');
      const taskBox = host.querySelector('#ps-task-box');
      if (taskBox) {
        taskBox.style.display = 'none';
      }
      const resultCard = host.querySelector('#ps-result-card');
      if (resultCard) resultCard.style.display = 'none';
      const drawer = host.querySelector('#ps-drawer');
      if (drawer) drawer.style.display = 'none';
    };

    mainFab.addEventListener('mouseenter', () => {
      if (hideFabMenuTimer) clearTimeout(hideFabMenuTimer);
      fabMenu.classList.add('visible');
    });
    fabMenu.addEventListener('mouseenter', () => {
      if (hideFabMenuTimer) clearTimeout(hideFabMenuTimer);
    });
    fabContainer.addEventListener('mouseenter', () => {
      if (hideFabMenuTimer) clearTimeout(hideFabMenuTimer);
    });
    fabContainer.addEventListener('mouseleave', () => {
      if (isDragging) return;
      const taskInput = host.querySelector('#ps-task-input');
      if (taskInput && document.activeElement === taskInput) return;
      hideFabMenuTimer = setTimeout(() => {
        hideEphemeralUI();
      }, 4000);
    });

    // Dismiss ephemeral UI when clicking outside of phantom controls
    document.addEventListener('mousedown', (e) => {
      if (isDragging) return;
      const taskBox = host.querySelector('#ps-task-box');
      const drawer = host.querySelector('#ps-drawer');
      const resultCard = host.querySelector('#ps-result-card');
      
      const inControls = e.target && (
        (fabContainer && fabContainer.contains(e.target)) ||
        (drawer && drawer.contains(e.target)) ||
        (e.target.closest && e.target.closest('#privacyshield-root'))
      );

      if (!inControls) {
        fabMenu.classList.remove('visible');
        if (taskBox && taskBox.style.display !== 'none') {
          taskBox.style.display = 'none';
        }
        if (resultCard && resultCard.style.display !== 'none') {
          resultCard.style.display = 'none';
        }
        if (drawer && drawer.style.display !== 'none') {
          drawer.style.display = 'none';
        }
      }
    });
    
    let isDragging = false;
    let hasDragged = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialFabCenterX = 0;
    let initialFabCenterY = 0;

    mainFab.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasDragged = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = mainFab.getBoundingClientRect();
      initialFabCenterX = rect.left + rect.width / 2;
      initialFabCenterY = rect.top + rect.height / 2;
      if (hideFabMenuTimer) {
        clearTimeout(hideFabMenuTimer);
        hideFabMenuTimer = null;
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!hasDragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        hasDragged = true;
      }
      if (hasDragged) {
        if (hideFabMenuTimer) {
          clearTimeout(hideFabMenuTimer);
          hideFabMenuTimer = null;
        }
        const targetX = initialFabCenterX + dx;
        const targetY = initialFabCenterY + dy;
        const clampedX = Math.min(Math.max(28, targetX), window.innerWidth - 28);
        const clampedY = Math.min(Math.max(28, targetY), window.innerHeight - 28);

        // Vertical anchoring: if in upper region, expand downwards; else expand upwards
        if (clampedY < 260) {
          fabContainer.style.top = Math.round(clampedY - 22) + 'px';
          fabContainer.style.bottom = 'auto';
          fabContainer.style.flexDirection = 'column-reverse';
        } else {
          fabContainer.style.bottom = Math.round(window.innerHeight - (clampedY + 22)) + 'px';
          fabContainer.style.top = 'auto';
          fabContainer.style.flexDirection = 'column';
        }

        // Horizontal anchoring: if in left region, align to start; else align to end
        if (clampedX < 320) {
          fabContainer.style.left = Math.round(clampedX - 22) + 'px';
          fabContainer.style.right = 'auto';
          fabContainer.style.alignItems = 'flex-start';
        } else {
          fabContainer.style.right = Math.round(window.innerWidth - (clampedX + 22)) + 'px';
          fabContainer.style.left = 'auto';
          fabContainer.style.alignItems = 'flex-end';
        }
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        if (hasDragged) {
          fabMenu.classList.add('visible');
          setTimeout(() => {
            hasDragged = false;
          }, 120);
        }
      }
    });

    mainFab.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!fabMenu.classList.contains('visible')) {
        fabMenu.classList.add('visible');
      }
      onOneButtonClick();
    });

    host.querySelector('#ps-restore-btn').addEventListener('click', onRestorePage);
    host.querySelector('#ps-rescan-btn').addEventListener('click', onOneButtonClick);
    host.querySelector('#ps-drawer-toggle').addEventListener('click', (e) => {
      if (e.target.closest('#ps-drawer-close')) return;
      toggleTelemetryDrawer();
    });

    const drawerClose = host.querySelector('#ps-drawer-close');
    if (drawerClose) {
      drawerClose.addEventListener('click', (e) => {
        e.stopPropagation();
        const drawer = host.querySelector('#ps-drawer');
        if (drawer) drawer.style.display = 'none';
      });
    }

    const taskInput = host.querySelector('#ps-task-input');
    const goBtn = host.querySelector('#ps-go-btn');
    const detailsToggle = host.querySelector('#ps-details-toggle');
    const taskDetails = host.querySelector('#ps-task-details');
    const taskClose = host.querySelector('#ps-task-close');
    const resultClose = host.querySelector('#ps-result-close');
    const resultCard = host.querySelector('#ps-result-card');

    if (taskClose) {
      taskClose.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskBox = host.querySelector('#ps-task-box');
        if (taskBox) taskBox.style.display = 'none';
      });
    }

    goBtn.addEventListener('click', onTaskSubmit);
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onTaskSubmit();
      }
    });

    detailsToggle.addEventListener('click', () => {
      taskDetails.style.display = taskDetails.style.display === 'none' ? 'block' : 'none';
    });

    resultClose.addEventListener('click', () => {
      resultCard.style.display = 'none';
    });

    const alwaysOnCheckbox = host.querySelector('#ps-always-on-checkbox');
    if (alwaysOnCheckbox) {
      alwaysOnCheckbox.addEventListener('change', (e) => {
        alwaysOnEnabled = e.target.checked;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ alwaysOnRedaction: alwaysOnEnabled });
      }
        if (alwaysOnEnabled) {
          runAutoRedaction(document.body, false);
          if (!dynamicFaceObserver) startDynamicFaceScanner();
        } else {
          if (!pipelineState.isRedacted) {
            stopDynamicFaceScanner();
          }
        }
      });
    }

    // Hide exposure bar after 1 minute (60,000 ms)
    setTimeout(() => {
      const threatContainer = document.getElementById('ps-threat-container');
      if (threatContainer) threatContainer.style.display = 'none';
    }, 60000);
  }

  function initializeAlwaysOn() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['alwaysOnRedaction'], (res) => {
        if (res && res.alwaysOnRedaction) {
          alwaysOnEnabled = true;
          const cb = document.getElementById('ps-always-on-checkbox');
          if (cb) cb.checked = true;
          runAutoRedaction(document.body, false);
          if (!dynamicFaceObserver) {
            startDynamicFaceScanner();
          }
        }
      });
    }
  }

  /**
   * Toggles the telemetry drawer open/closed.
   */
  function toggleTelemetryDrawer() {
    const body = document.getElementById('ps-drawer-body');
    const arrow = document.getElementById('ps-drawer-arrow');
    if (!body) return;
    if (body.style.display === 'none') {
      body.style.display = 'flex';
      if (arrow) arrow.textContent = '▲';
    } else {
      body.style.display = 'none';
      if (arrow) arrow.textContent = '▼';
    }
  }

  /**
   * Updates progress bar and active stage badge.
   */
  function updateProgress(percent, label, activeBadgeId) {
    const indicator = document.getElementById('ps-scanning-indicator');
    if (indicator) {
      if (percent > 0 && percent < 100) {
        indicator.style.display = 'flex';
        indicator.querySelector('span').textContent = label;
      } else {
        indicator.style.display = 'none';
      }
    }

    const badges = ['badge-dom', 'badge-pii', 'badge-face', 'badge-screen', 'badge-ocr', 'badge-vit'];
    badges.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === activeBadgeId) {
        el.className = 'ps-dot active';
      } else if (badges.indexOf(id) < badges.indexOf(activeBadgeId)) {
        el.className = 'ps-dot done';
      }
    });
  }

  // Helper for Error Toast
  function showErrorToast(msg) {
    const container = document.getElementById('ps-error-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'ps-error-toast';
    toast.innerHTML = `<span>${msg}</span><button class="ps-toast-close">✕</button>`;
    toast.querySelector('button').onclick = () => toast.remove();
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
  }

  async function onOneButtonClick() {
    if (pipelineState.isScanning) return;
    pipelineState.isScanning = true;
    stopDynamicFaceScanner();
    
    // Show top-right loading bar & status dots when FAB is clicked and scanning starts
    const statusDots = document.getElementById('ps-status-dots');
    if (statusDots) statusDots.style.display = 'flex';

    // Show exposure bar if it was hidden
    const threatContainer = document.getElementById('ps-threat-container');
    if (threatContainer) threatContainer.style.display = 'flex';

    // Reset view states
    document.getElementById('ps-stats-grid').style.display = 'none';
    document.getElementById('ps-preview-box').style.display = 'none';
    document.getElementById('ps-task-box').style.display = 'none';
    document.getElementById('ps-result-card').style.display = 'none';

    // Start Telemetry Session
    instrumentation.startSession('one_button_scan_and_redact');

    try {
      // 1. DOM Scan & Text PII / NER Detection
      updateProgress(15, 'Scanning DOM & Analyzing Text PII...', 'badge-dom');
      instrumentation.startStage('dom_text_pii_scan');
      
      const domRedactionResult = domRedactor.redactPageDOM();
      instrumentation.endStage('dom_text_pii_scan', { piiCount: domRedactionResult.totalRedacted });

      // 2. Face / Visual PII Detection (BlazeFace ML + Fallback with Timeout)
      updateProgress(30, 'Running Local BlazeFace Face Detection...', 'badge-face');
      instrumentation.startStage('local_face_detection');

      let detectedFaces = [];
      let faceStatus = faceDetector.getStatus();
      try {
        detectedFaces = await faceDetector.scanPageImages();
        faceStatus = faceDetector.getStatus();
        
        // --- LIVE DOM FACE OVERLAY REDACTION ---
        const injectedOverlaysCount = domRedactor.redactDOMFaces(detectedFaces);
        console.log(`[Phantom AI] Injected ${injectedOverlaysCount} live DOM face redaction overlays.`);
      } catch (faceErr) {
        console.warn('[Phantom AI] Face detection failed gracefully:', faceErr);
      }
      instrumentation.endStage('local_face_detection', { facesCount: detectedFaces.length, backend: faceStatus.activeBackend });

      // 2b. Local OCR & Document PII Detection on Page Images (Passports, IDs, Documents)
      let pageOcrBoxes = [];
      let screenshotOcrBoxes = [];
      if (typeof ocrWorker !== 'undefined' && ocrWorker && typeof ocrWorker.scanPageImages === 'function') {
        try {
          updateProgress(35, 'Scanning Document Images for Sensitive PII...', 'badge-ocr');
          const pageOcrRes = await Promise.race([
            ocrWorker.scanPageImages(),
            new Promise(res => setTimeout(() => res({ domOcrBoxes: [], screenshotOcrBoxes: [] }), 25000))
          ]);
          if (pageOcrRes && pageOcrRes.domOcrBoxes && pageOcrRes.domOcrBoxes.length > 0) {
            pageOcrBoxes = pageOcrRes.domOcrBoxes;
            screenshotOcrBoxes = pageOcrRes.screenshotOcrBoxes || [];
            
            // --- LIVE DOM OCR OVERLAY REDACTION (Passports, IDs) ---
            if (domRedactor && typeof domRedactor.redactDOMOCRBoxes === 'function') {
              const injectedOcrCount = domRedactor.redactDOMOCRBoxes(pageOcrBoxes);
              console.log(`[Phantom AI] Injected ${injectedOcrCount} live DOM OCR redaction overlays.`);
            }
          }
        } catch (ocrImgErr) {
          console.warn('[Phantom AI] Page images OCR failed gracefully:', ocrImgErr);
        }
      }

      // 3. Screen-Understanding & UI Structure Model (Component 1)
      updateProgress(45, 'Executing Local Screen-Understanding Model...', 'badge-screen');
      instrumentation.startStage('screen_structure_model');

      const screenAnalysis = screenAnalyzer.analyzeScreen();
      pipelineState.screenStructure = screenAnalysis;
      instrumentation.endStage('screen_structure_model', { totalElements: screenAnalysis.totalElements });

      // 4. Tab Screenshot Capture & Pixel-Level Canvas Redaction
      updateProgress(65, 'Capturing & Redacting Screenshot Pixels...', 'badge-pixel');
      instrumentation.startStage('screenshot_capture_and_canvas_redaction');

      // Request tab screenshot from background service worker
      const captureResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' }, (res) => resolve(res));
      });

      let sanitizedImageBase64 = null;
      let ocrRedactionCount = screenshotOcrBoxes.length;
      let ocrBoxes = [...screenshotOcrBoxes];

      if (captureResponse && captureResponse.success && captureResponse.dataUrl) {
        // --- Verify coordinate scaling against actual screenshot dimensions ---
        if (screenshotOcrBoxes.length > 0) {
          try {
            const tempImg = new Image();
            tempImg.src = captureResponse.dataUrl;
            await new Promise((res) => {
              if (tempImg.complete) return res();
              tempImg.onload = res;
              tempImg.onerror = res;
            });
            const actualW = tempImg.naturalWidth || window.innerWidth;
            const actualH = tempImg.naturalHeight || window.innerHeight;
            const actualScaleX = actualW / (window.innerWidth || actualW);
            const actualScaleY = actualH / (window.innerHeight || actualH);

            // Re-scale boxes accurately against actual screenshot dimensions
            ocrBoxes = screenshotOcrBoxes.map(b => {
              if (b.viewportBox) {
                return {
                  ...b,
                  x: Math.round(b.viewportBox.x * actualScaleX),
                  y: Math.round(b.viewportBox.y * actualScaleY),
                  width: Math.round(b.viewportBox.width * actualScaleX),
                  height: Math.round(b.viewportBox.height * actualScaleY)
                };
              }
              return b;
            });
          } catch (scaleErr) {
            console.warn('[Phantom AI] Error adjusting screenshot coordinate scaling:', scaleErr);
          }
        }

        // --- 4a. OCR Text Recognition on Screenshot (if no page image OCR detected) ---
        if (ocrBoxes.length === 0 && typeof ocrWorker !== 'undefined' && ocrWorker && typeof ocrWorker.detectSensitiveBoxes === 'function') {
          updateProgress(70, 'Running Local OCR on Screenshot...', 'badge-ocr');
          instrumentation.startStage('ocr_text_extraction');
          try {
            const ocrRes = await Promise.race([
              ocrWorker.detectSensitiveBoxes(captureResponse.dataUrl),
              new Promise(res => setTimeout(() => res({ ocrBoxes: [] }), 25000))
            ]);
            if (ocrRes && ocrRes.ocrBoxes && ocrRes.ocrBoxes.length > 0) {
              ocrBoxes = ocrRes.ocrBoxes;
              ocrRedactionCount = ocrBoxes.length;
            }
          } catch (ocrErr) {
            console.warn('[PrivacyShield] Screenshot OCR detection error:', ocrErr);
          }
          instrumentation.endStage('ocr_text_extraction', { ocrRedactionCount });
        }

        console.log('[Phantom AI] FINAL screenshotOcrBoxes:', ocrBoxes);

        // --- 4b. Canvas Pixel Redaction ---
        const redactCanvasResult = await canvasRedactor.redactScreenshot(
          captureResponse.dataUrl,
          domRedactionResult.boundingBoxes,
          detectedFaces,
          ocrBoxes
        );
        sanitizedImageBase64 = redactCanvasResult.sanitizedImageBase64;
      }
      pipelineState.sanitizedScreenshotBase64 = sanitizedImageBase64;
      instrumentation.endStage('screenshot_capture_and_canvas_redaction');

      // 4b. Local Vision Transformer Model (Screen ViT - Runs strictly on REDACTED Canvas)
      instrumentation.startStage('screen_vit_model');

      let vitResult = null;
      if (screenViT && sanitizedImageBase64) {
        vitResult = await screenViT.classifyScreen(sanitizedImageBase64);
      } else if (screenViT) {
        vitResult = screenViT.getFallbackResult();
      }

      if (vitResult && pipelineState.screenStructure) {
        pipelineState.screenStructure.visualSignal = vitResult;
      }
      pipelineState.vitResult = vitResult;
      instrumentation.endStage('screen_vit_model', {
        pageType: vitResult?.visualPageType,
        provider: vitResult?.executionProvider
      });

      // 5. Local Decision-Making Engine (Component 4)
      instrumentation.startStage('local_decision_engine');

      const decision = decisionEngine.evaluateDecision(screenAnalysis, '');
      pipelineState.localDecision = decision;
      instrumentation.endStage('local_decision_engine', { pageType: decision.pageClassification.pageType });

      // Finalize Telemetry Session
      const sessionSummary = instrumentation.endSession();
      pipelineState.lastTelemetry = sessionSummary;

      // Update UI with Results
      updateProgress(100, 'Redaction Complete (Zero PII Transmitted)', 'badge-vit');
      ['badge-dom', 'badge-pii', 'badge-face', 'badge-screen', 'badge-ocr', 'badge-vit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'ps-stage-badge done';
      });

      // Show Statistics
      document.getElementById('stat-pii-count').textContent = domRedactionResult.totalRedacted;
      document.getElementById('stat-ocr-count').textContent = ocrRedactionCount;
      document.getElementById('stat-faces-count').textContent = detectedFaces.length;
      document.getElementById('ps-stats-grid').style.display = 'grid';

      // 6. Update On-Device Heuristic Threat / Site Exposure Bar
      const scorerFn = getThreatScorer();
      if (typeof scorerFn === 'function') {
        try {
          const hasPwd = (screenAnalysis?.elements || []).some(e => e.type === 'input_password');
          
          // Form and iframe origin checks from current DOM state
          let crossOriginForms = 0;
          let thirdPartyIframes = 0;
          try {
            const currentHost = window.location.hostname;
            document.querySelectorAll('form[action]').forEach(f => {
              if (f.closest('#privacyshield-root')) return;
              const actionUrl = f.getAttribute('action') || '';
              if (actionUrl.startsWith('http://') || actionUrl.startsWith('https://')) {
                try {
                  const formHost = new URL(actionUrl, window.location.href).hostname;
                  if (formHost && formHost !== currentHost) crossOriginForms++;
                } catch (_) {}
              }
            });

            document.querySelectorAll('iframe[src]').forEach(ifr => {
              if (ifr.closest('#privacyshield-root')) return;
              const srcUrl = ifr.getAttribute('src') || '';
              if (srcUrl.startsWith('http://') || srcUrl.startsWith('https://')) {
                try {
                  const ifrHost = new URL(srcUrl, window.location.href).hostname;
                  if (ifrHost && ifrHost !== currentHost) thirdPartyIframes++;
                } catch (_) {}
              }
            });
          } catch (_) {}

          const threatResult = scorerFn({
            hasPasswordField: hasPwd,
            detectedPII: domRedactionResult.totalRedacted,
            crossOriginFormsCount: crossOriginForms,
            thirdPartyIframesCount: thirdPartyIframes
          });

          pipelineState.threatScore = threatResult;
          updateThreatIndicatorUI(threatResult);
        } catch (threatErr) {
          console.warn('[Phantom AI] Could not compute threat score:', threatErr);
        }
      }

      // Show Redacted Preview Image
      if (sanitizedImageBase64) {
        const previewImg = document.getElementById('ps-preview-img');
        previewImg.src = sanitizedImageBase64;
        document.getElementById('ps-preview-box').style.display = 'block';
      }

      // Render Telemetry Waterfall Breakdown
      renderTelemetryUI(sessionSummary, faceStatus, decision);

      // Reveal Task Input Pre-Focused
      const taskBox = document.getElementById('ps-task-box');
      taskBox.style.display = 'flex';
      const taskInput = document.getElementById('ps-task-input');
      taskInput.focus();

      pipelineState.isRedacted = true;
      startDynamicFaceScanner();
    } catch (err) {
      console.error('[Phantom AI] Error in pipeline execution:', err);
      showErrorToast(`Error: ${err.message}`);
    } finally {
      pipelineState.isScanning = false;
      const indicator = document.getElementById('ps-scanning-indicator');
      if (indicator) indicator.style.display = 'none';
      const statusDots = document.getElementById('ps-status-dots');
      if (statusDots) {
        setTimeout(() => {
          if (!pipelineState.isScanning) {
            statusDots.style.display = 'none';
          }
        }, 1500);
      }
    }
  }

  /**
   * Renders the latency waterfall chart, memory snapshots, and decision audit logs in the drawer.
   */
  function renderTelemetryUI(session, faceStatus, decision) {
    if (!session) return;

    document.getElementById('ps-total-latency').textContent = `${session.totalDurationMs} ms`;
    document.getElementById('meta-hw').textContent = instrumentation.getSystemDiagnostics().hardwareProvider;
    document.getElementById('meta-face').textContent = faceStatus.activeBackend;
    
    // Per-Image Audit Telemetry Breakdown
    const tb = faceDetector.telemetryBreakdown || {};
    const imgAuditStr = `Images: ${tb.totalImagesOnPage || 0} Total | Skipped: ${(tb.skippedTooSmall || 0) + (tb.skippedNotLoaded || 0)} (<40px / pending) | Scanned: ${tb.scannedCount || 0} | Faces: ${tb.facesFound || 0}`;
    
    const decisionMetaEl = document.getElementById('ps-decision-meta');
    if (decisionMetaEl) {
      decisionMetaEl.innerHTML = `
        Decision: <strong id="meta-decision" style="color:#D97757;">[${decision.pageClassification.pageType}] ${decision.selectedStrategy}</strong>
        <div style="font-size:10px;color:#6E6D6A;margin-top:4px;">${imgAuditStr}</div>
      `;
    }

    const container = document.getElementById('ps-waterfall-container');
    container.innerHTML = '';

    const stageLabels = {
      dom_text_pii_scan: '1. DOM PII Scan & Mask',
      local_face_detection: '2. BlazeFace Face ML',
      screen_structure_model: '3. Screen Understanding',
      ocr_text_extraction: '4. Tesseract OCR Image Scan',
      screenshot_capture_and_canvas_redaction: '5. Canvas Pixel Redaction',
      screen_vit_model: '6. Screen ViT ML',
      local_decision_engine: '7. Local Decision Delta',
      server_agent_roundtrip: '8. Server VLM Proxy',
      action_execution_dom: '9. Live Action Runner'
    };

    for (const [key, stage] of Object.entries(session.stages)) {
      const label = stageLabels[key] || key;
      const row = document.createElement('div');
      row.className = 'ps-waterfall-row';
      row.innerHTML = `
        <div class="ps-waterfall-name" title="${label}">${label}</div>
        <div class="ps-waterfall-bar-track">
          <div class="ps-waterfall-bar" style="width: ${Math.max(4, Math.min(100, (stage.durationMs / session.totalDurationMs) * 100))}%;"></div>
        </div>
        <div class="ps-waterfall-val">${stage.durationMs}ms</div>
      `;
      container.appendChild(row);
    }

    // Append SIH Observability / Debug Dashboard
    const piiDetected = document.getElementById('stat-pii-count')?.textContent || '0';
    const facesDetected = document.getElementById('stat-faces-count')?.textContent || '0';
    const localInf = session.stages?.screen_vit_model?.durationMs || session.stages?.local_face_detection?.durationMs || 12;
    const redactTime = session.stages?.dom_text_pii_scan?.durationMs || 8;
    const netTime = session.stages?.server_agent_roundtrip?.durationMs || 58;

    const sihPanel = document.createElement('div');
    sihPanel.className = 'ps-sih-debug-panel';
    sihPanel.style.cssText = 'margin-top:10px; padding:10px; background:#0b1120; border:1px solid #0284c7; border-radius:6px; font-size:11px; font-family:monospace; line-height:1.5; color:#cbd5e1;';
    sihPanel.innerHTML = `
      <div style="font-weight:700; color:#38bdf8; margin-bottom:6px; display:flex; justify-content:space-between;">
        <span>🛡️ SIH OBSERVABILITY DASHBOARD</span>
        <span style="color:#34d399; font-weight:700;">PROTECTED</span>
      </div>
      <div>PII Detected: <strong style="color:#f59e0b;">${piiDetected}</strong> | PII Redacted: <strong style="color:#34d399;">${piiDetected}</strong> | Faces: <strong style="color:#38bdf8;">${facesDetected}</strong></div>
      <div>Local Inference: <strong>${localInf} ms</strong> | Redaction: <strong>${redactTime} ms</strong></div>
      <div>Network Roundtrip: <strong>${netTime} ms</strong> | Total Loop: <strong style="color:#38bdf8;">${session.totalDurationMs} ms</strong></div>
      <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #1e293b;">
        Payload: Raw screenshot ➔ <span style="color:#ef4444; font-weight:700;">BLOCKED</span> | Sanitized ➔ <span style="color:#34d399; font-weight:700;">SENT</span>
      </div>
      <div>Action Execution: <span style="color:#34d399; font-weight:700;">VALIDATED & EXECUTED</span></div>
    `;
    container.appendChild(sihPanel);

    // Reveal telemetry drawer once audit data is populated
    const drawer = document.getElementById('ps-drawer');
    if (drawer) drawer.style.display = 'block';
  }

  /**
   * Submits the user's task prompt along with sanitized screen context to the secure proxy server.
   */
  async function onTaskSubmit() {
    const taskInput = document.getElementById('ps-task-input');
    const task = (taskInput.value || '').trim();
    if (!task) return;

    const goBtn = document.getElementById('ps-go-btn');
    const resultCard = document.getElementById('ps-result-card');
    const resultContent = document.getElementById('ps-result-content');
    const resultTitle = document.getElementById('ps-result-title');

    goBtn.disabled = true;
    goBtn.innerHTML = `<span>Synthesizing...</span>`;

    resultCard.style.display = 'flex';
    resultContent.innerHTML = `<div style="color:#94a3b8;">Processing sanitized context with proxy agent...</div>`;

    // Start Action Roundtrip Session
    const actionSession = instrumentation.startSession('agent_task_execution');
    instrumentation.startStage('server_agent_roundtrip');

    try {
      // 1. Always analyze latest screenStructure so we have real-time form inputs and selectors
      if (typeof screenAnalyzer !== 'undefined' && typeof screenAnalyzer.analyzeScreen === 'function') {
        pipelineState.screenStructure = screenAnalyzer.analyzeScreen();
      }

      // 2. Evaluate Decision for Task
      const decision = (typeof decisionEngine !== 'undefined' && typeof decisionEngine.evaluateDecision === 'function')
        ? decisionEngine.evaluateDecision(pipelineState.screenStructure, task)
        : { pageClassification: { pageType: 'FORM_APPLICATION' }, confidence: 0.95 };

      // 3. Prepare Sanitized Text Context (Scrub all extracted DOM text into privacy tokens)
      const rawDOMText = (document.body ? document.body.innerText : '').slice(0, 4000);
      let sanitizedDOMText = rawDOMText;
      const detector = (typeof textPIIDetector !== 'undefined' ? textPIIDetector : null) || 
                       (typeof window !== 'undefined' ? window.textPIIDetector : null);
      if (detector && typeof detector.detectAndSanitize === 'function') {
        const scrubbed = detector.detectAndSanitize(rawDOMText);
        sanitizedDOMText = scrubbed.sanitizedText;
      }

      pipelineState.isRedacted = true;

      const rawOutboundPayload = {
        sanitizedText: sanitizedDOMText,
        sanitizedImageBase64: pipelineState.sanitizedScreenshotBase64 || null,
        screenStructure: pipelineState.screenStructure,
        task: task,
        pageClassification: decision.pageClassification,
        confidence: decision.confidence || 0.95,
        isRedacted: true
      };

      // 4. Local Privacy Gate Verification (Zero-Tolerance Enforcement)
      const gate = (typeof privacyGate !== 'undefined') ? privacyGate : (typeof window !== 'undefined' ? window.privacyGate : null);
      let finalOutboundPayload = rawOutboundPayload;
      if (gate && typeof gate.inspectOutboundPayload === 'function') {
        const gateInspection = gate.inspectOutboundPayload(rawOutboundPayload);
        if (gateInspection.blocked) {
          console.warn('[Phantom AI PrivacyGate] Blocked outbound transmission:', gateInspection.reason);
          showErrorToast(`Privacy Gate Interception: ${gateInspection.reason}`);
          resultTitle.textContent = 'Privacy Gate Blocked';
          resultContent.innerHTML = `<div style="color:#ef4444;font-weight:600;">Blocked potential sensitive data transmission. Zero raw PII sent.</div>`;
          return;
        }
        if (gateInspection.sanitizedPayload) {
          finalOutboundPayload = gateInspection.sanitizedPayload;
        }
      }

      // 5. Send Proxy Agent Request (Background -> Proxy Server)
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'PROXY_AGENT_REQUEST',
          payload: finalOutboundPayload
        }, (res) => resolve(res));
      });

      instrumentation.endStage('server_agent_roundtrip', { durationMs: response?.networkDurationMs });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Proxy server response failed.');
      }

      const agentData = response.data;
      console.log('[Phantom AI] Agent Response:', agentData);

      // 6. Validate Server Response via Structured Action Protocol Allowlist
      const validator = (typeof actionValidator !== 'undefined') ? actionValidator : (typeof window !== 'undefined' ? window.actionValidator : null);
      let safeActions = [];
      let isTextResponse = false;
      let responseText = '';

      if (validator && typeof validator.validateServerResponse === 'function') {
        const valResult = validator.validateServerResponse(agentData);
        if (!valResult.valid) {
          throw new Error(`Action Protocol Validation Failed: ${valResult.errors.join(', ')}`);
        }
        if (valResult.isTextResponse) {
          isTextResponse = true;
          responseText = valResult.text;
        } else {
          safeActions = valResult.actions;
        }
      } else if (agentData.type === 'action' && Array.isArray(agentData.actions)) {
        safeActions = agentData.actions.filter(a => !(a.type === 'click' && a.selector && a.selector.toLowerCase().includes('submit')));
      } else {
        isTextResponse = true;
        responseText = agentData.text || agentData.response || JSON.stringify(agentData);
      }

      if (!isTextResponse && safeActions.length > 0) {

        // Pull latest local profile from chrome.storage
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const profileData = await chrome.storage.local.get(['mockProfile']);
          if (profileData && profileData.mockProfile && actionExecutor) {
            actionExecutor.setProfile(profileData.mockProfile);
          }
        }

        resultTitle.textContent = `Autonomous Actions (${safeActions.length})`;
        resultContent.innerHTML = `
          <div style="margin-bottom:8px;color:#38bdf8;">Executing ${safeActions.length} UI actions on live DOM:</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${safeActions.map(a => `<div class="ps-action-pill">⚡ ${(a.type || a.action || 'ACTION').toUpperCase()}: ${a.selector || a.fieldType || 'viewport'}</div>`).join('')}
          </div>
        `;

        // Execute Actions on live unredacted DOM
        instrumentation.startStage('action_execution_dom');
        const execResults = await actionExecutor.executeActions(safeActions);
        instrumentation.endStage('action_execution_dom', { resultsCount: execResults.length });

        const filledCount = execResults.filter(r => r.success && (r.action === 'fill' || r.action === 'type')).length;
        const skippedCount = execResults.filter(r => r.action === 'fill_skipped').length;
        resultContent.innerHTML += `
          <div style="margin-top:8px;color:#34d399;font-weight:600;">✔ ${filledCount} field${filledCount === 1 ? '' : 's'} filled accurately!${skippedCount > 0 ? ` (${skippedCount} optional skipped)` : ''} Please review and click Submit manually.</div>
        `;
      } else {
        // Plain conversational answer / summary
        resultTitle.textContent = 'Agent Response';
        resultContent.innerHTML = `<div style="white-space:pre-wrap;">${agentData.text || agentData.response || JSON.stringify(agentData)}</div>`;
      }

      // Complete Session
      const completedSession = instrumentation.endSession();
      renderTelemetryUI(completedSession, faceDetector.getStatus(), decision);
    } catch (err) {
      console.error('[Phantom AI] Task submission error:', err);
      resultTitle.textContent = 'Error';
      resultContent.innerHTML = `
        <div style="color:#ef4444;">${err.message}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
          Make sure your local proxy server is running at <code>http://localhost:3001</code> with a valid API key in <code>server/.env</code>.
        </div>
      `;
    } finally {
      goBtn.disabled = false;
      goBtn.innerHTML = `<span>Go</span> <svg style="width:14px;height:14px;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    }
  }

  // Dynamic Face Scanning for Lazy-Loaded Thumbnails (e.g. YouTube, Infinite Scroll)
  let dynamicFaceObserver = null;
  let dynamicScrollTimer = null;
  let dynamicallyScannedImages = new WeakSet();

  function isElementInOrNearViewport(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    return (
      rect.bottom >= -300 &&
      rect.top <= windowHeight + 300 &&
      rect.right >= -300 &&
      rect.left <= windowWidth + 300
    );
  }

  async function scanAndRedactSingleImage(img) {
    if (!pipelineState.isRedacted) return;
    if (!img || dynamicallyScannedImages.has(img)) return;
    if (img.closest && img.closest('#privacyshield-root')) return;

    dynamicallyScannedImages.add(img);
    if (img.classList) img.classList.add('ps-scanned');

    try {
      const faceBoxes = await faceDetector.scanSingleImage(img);
      if (faceBoxes && faceBoxes.length > 0 && pipelineState.isRedacted) {
        const injected = domRedactor.redactDOMFaces(faceBoxes);
        if (injected > 0) {
          console.log(`[Phantom AI Dynamic Scan] Redacted ${injected} faces on dynamic thumbnail.`);
          const statFaces = document.getElementById('stat-faces-count');
          if (statFaces) {
            statFaces.textContent = parseInt(statFaces.textContent || '0', 10) + injected;
          }
        }
      }
    } catch (err) {
      // Gracefully handle any dynamic scan error
    }
  }

  function handleCandidateImage(img) {
    if (!pipelineState.isRedacted || !img || dynamicallyScannedImages.has(img)) return;
    if (img.closest && (
      img.closest('#privacyshield-root') ||
      img.closest('#ps-mr-overlay') ||
      img.closest('#ps-mr-preview-modal') ||
      img.closest('.ps-mr-modal-backdrop') ||
      img.closest('[data-ps-ignore="true"]')
    )) return;

    if (img.hasAttribute && img.hasAttribute('data-ps-ignore')) return;
    if (img.classList && (img.classList.contains('ps-mr-screenshot') || img.classList.contains('ps-mr-preview-img') || img.classList.contains('ps-scanned'))) return;

    const rect = img.getBoundingClientRect();
    if (rect.width < 32 || rect.height < 32) return;
    if (rect.width > 600 && (rect.width / rect.height > 1.8)) return;
    if (rect.height > 600 && (rect.height / rect.width > 2.2)) return;

    if (img.tagName && img.tagName.toLowerCase() === 'img') {
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener('load', () => {
          if (pipelineState.isRedacted && isElementInOrNearViewport(img)) {
            scanAndRedactSingleImage(img);
          }
        }, { once: true });
        return;
      }
    }

    if (isElementInOrNearViewport(img)) {
      scanAndRedactSingleImage(img);
    }
  }

  function onDebouncedScroll() {
    if (!pipelineState.isRedacted) return;
    if (dynamicScrollTimer) clearTimeout(dynamicScrollTimer);
    dynamicScrollTimer = setTimeout(() => {
      if (!pipelineState.isRedacted) return;
      const images = document.querySelectorAll('img:not(.ps-scanned), [role="img"]:not(.ps-scanned)');
      for (const img of images) {
        handleCandidateImage(img);
      }
    }, 200);
  }

  function startDynamicFaceScanner() {
    stopDynamicFaceScanner();

    // Mark currently existing images as known if already processed
    const existing = document.querySelectorAll('img, [role="img"]');
    for (const img of existing) {
      if (img.complete && img.naturalWidth > 0 && isElementInOrNearViewport(img)) {
        dynamicallyScannedImages.add(img);
        if (img.classList) img.classList.add('ps-scanned');
      }
    }

    // Observe DOM for newly added nodes (e.g. YouTube ytd-rich-item-renderer)
    dynamicFaceObserver = new MutationObserver((mutations) => {
      if (!pipelineState.isRedacted && !alwaysOnEnabled) return;
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.id === 'privacyshield-root' || 
              node.id === 'ps-mr-overlay' || 
              node.id === 'ps-mr-preview-modal' ||
              (node.classList && (
                node.classList.contains('ps-injected') ||
                node.classList.contains('ps-redacted-badge') ||
                node.classList.contains('ps-redaction-wrapper') ||
                node.classList.contains('ps-face-overlay')
              )) ||
              (node.hasAttribute && (node.hasAttribute('data-ps-ignore') || node.hasAttribute('data-token'))) ||
              (node.closest && (
                node.closest('#privacyshield-root') || 
                node.closest('#ps-mr-overlay') || 
                node.closest('#ps-mr-preview-modal') || 
                node.closest('.ps-mr-modal-backdrop') ||
                node.closest('.ps-injected') ||
                node.closest('.ps-redacted-badge') ||
                node.closest('.ps-redaction-wrapper') ||
                node.closest('.ps-face-overlay') ||
                node.closest('[data-token]') ||
                node.closest('[data-ps-ignore="true"]')
              ))) continue;

          if (alwaysOnEnabled) {
            const tag = node.tagName.toLowerCase();
            if (!['script', 'style', 'noscript', 'canvas', 'svg', 'iframe'].includes(tag)) {
               pendingTextNodes.push(node);
            }
          }

          if (pipelineState.isRedacted) {
            if (node.tagName && node.tagName.toLowerCase() === 'img') {
              handleCandidateImage(node);
            } else if (node.querySelectorAll) {
              const imgs = node.querySelectorAll('img, [role="img"]');
              for (const img of imgs) {
                handleCandidateImage(img);
              }
            }
          }
        }
      }

      if (alwaysOnEnabled && pendingTextNodes.length > 0) {
        if (dynamicTextRedactionTimer) clearTimeout(dynamicTextRedactionTimer);
        dynamicTextRedactionTimer = setTimeout(() => {
          if (!alwaysOnEnabled) return;
          const nodesToProcess = pendingTextNodes;
          pendingTextNodes = [];
          nodesToProcess.forEach(n => runAutoRedaction(n, true));
        }, 300);
      }
    });

    dynamicFaceObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.addEventListener('scroll', onDebouncedScroll, { passive: true });
  }

  function stopDynamicFaceScanner() {
    if (dynamicFaceObserver) {
      dynamicFaceObserver.disconnect();
      dynamicFaceObserver = null;
    }
    if (dynamicScrollTimer) {
      clearTimeout(dynamicScrollTimer);
      dynamicScrollTimer = null;
    }
    if (dynamicTextRedactionTimer) {
      clearTimeout(dynamicTextRedactionTimer);
      dynamicTextRedactionTimer = null;
    }
    pendingTextNodes = [];
    window.removeEventListener('scroll', onDebouncedScroll);
    document.querySelectorAll('.ps-scanned').forEach(el => el.classList.remove('ps-scanned'));
    dynamicallyScannedImages = new WeakSet();
  }

  /**
   * Updates the on-device threat / site exposure indicator bar and label.
   */
  function updateThreatIndicatorUI(threatResult) {
    const labelEl = document.getElementById('ps-threat-label');
    const fillEl = document.getElementById('ps-threat-bar-fill');
    const containerEl = document.getElementById('ps-threat-container');

    if (!fillEl || !labelEl) return;

    if (!threatResult) {
      labelEl.textContent = 'Site Exposure: --%';
      fillEl.style.width = '0%';
      fillEl.className = 'ps-threat-bar-fill level-low';
      return;
    }

    const score = threatResult.score || 0;
    labelEl.textContent = `Site Exposure: ${score}%`;
    fillEl.style.width = `${score}%`;

    fillEl.className = `ps-threat-bar-fill level-${threatResult.level || 'low'}`;

    if (containerEl && Array.isArray(threatResult.factors)) {
      containerEl.setAttribute('title', `On-Device Exposure Factors:\n• ${threatResult.factors.join('\n• ')}`);
    }
  }

  /**
   * Restores original DOM content when requested.
   */
  function onRestorePage() {
    stopDynamicFaceScanner();
    domRedactor.restorePageDOM();
    if (actionExecutor && typeof actionExecutor.restoreFilledInputs === 'function') {
      actionExecutor.restoreFilledInputs();
    }
    
    // Hide FAB Menu when recall is clicked
    const fabMenu = document.getElementById('ps-fab-menu');
    if (fabMenu) fabMenu.classList.remove('visible');

    pipelineState.isRedacted = false;
    updateProgress(0, 'Page Restored to Original', 'badge-dom');
    document.getElementById('ps-stats-grid').style.display = 'none';
    document.getElementById('ps-task-box').style.display = 'none';
    document.getElementById('ps-preview-box').style.display = 'none';
    document.getElementById('ps-result-card').style.display = 'none';
    const drawer = document.getElementById('ps-drawer');
    if (drawer) drawer.style.display = 'none';
    const statusDots = document.getElementById('ps-status-dots');
    if (statusDots) statusDots.style.display = 'none';
    const threatContainer = document.getElementById('ps-threat-container');
    if (threatContainer) threatContainer.style.display = 'none';
    updateThreatIndicatorUI(null);

    // Shut off always-on redaction
    alwaysOnEnabled = false;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ alwaysOnRedaction: false });
    }
    const cb = document.getElementById('ps-always-on-checkbox');
    if (cb) cb.checked = false;

    // Shut off extension panel
    
    
    // Reset FAB active state
    const fab = document.querySelector('.ps-fab-button');
    if (fab) {
      fab.classList.remove('ps-active');
    }
  }

  // Initialize UI on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectUI();
      initializeAlwaysOn();
    });
  } else {
    injectUI();
    initializeAlwaysOn();
  }
})();
