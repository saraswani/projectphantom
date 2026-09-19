/**
 * Phantom Face — Precision Risk & Threat Popup Controller
 *
 * Implements:
 * 1. Immediate <1s glanceability with smooth radial arc gauge fill & linear color interpolation.
 * 2. Prominent domain card with favicon and unicode/cyrillic lookalike homograph detection.
 * 3. Detail on demand with an expandable weighted signal accordion.
 * 4. Multi-state resilience (scanning, internal chrome:// pages, error, active).
 * 5. Passive badge updating and instant security report clipboard copy.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Element References
  const stateScanning = document.getElementById('state-scanning');
  const stateInternal = document.getElementById('state-internal');
  const stateError = document.getElementById('state-error');
  const stateActive = document.getElementById('state-active');

  const domainNameEl = document.getElementById('domain-name');
  const urlSubtextEl = document.getElementById('url-subtext');
  const domainFaviconEl = document.getElementById('domain-favicon');
  const domainFaviconFallbackEl = document.getElementById('domain-favicon-fallback');
  const sslBadgeEl = document.getElementById('ssl-badge');
  const sslTextEl = document.getElementById('ssl-text');

  const homographBannerEl = document.getElementById('homograph-banner');
  const homographDescEl = document.getElementById('homograph-desc');

  const gaugeFillArcEl = document.getElementById('gauge-fill-arc');
  const gaugeSvgEl = document.getElementById('gauge-svg-element');
  const gaugeScoreValueEl = document.getElementById('gauge-score-value');
  const verdictBadgeEl = document.getElementById('verdict-badge');
  const verdictIconEl = document.getElementById('verdict-icon');
  const verdictTextEl = document.getElementById('verdict-text');

  const signalsToggleBtn = document.getElementById('signals-toggle-btn');
  const signalsCountBadge = document.getElementById('signals-count-badge');
  const signalsListContainer = document.getElementById('signals-list-container');
  const signalsList = document.getElementById('signals-list');

  const btnCopyReport = document.getElementById('btn-copy-report');
  const btnOpenOptions = document.getElementById('btn-open-options');
  const btnActivateRedactor = document.getElementById('btn-activate-redactor');
  const btnOpenBenchmark = document.getElementById('btn-open-benchmark');
  const btnOpenBenchmarkInternal = document.getElementById('btn-open-benchmark-internal');
  const btnRetryScan = document.getElementById('btn-retry-scan');
  const toastEl = document.getElementById('toast-message');

  let currentAnalysisData = null;

  // Arc Gauge Geometry Constants
  // Arc radius = 75, angle = 180 degrees (PI radians) -> arcLength = 75 * Math.PI = ~235.619
  const ARC_LENGTH = 235.62;

  // 5-Point Color Ramp Specification
  const COLOR_RAMP = [
    { score: 0,   color: [45, 212, 167] },  // #2DD4A7 (Safe)
    { score: 25,  color: [125, 216, 96] },  // #7DD860 (Low)
    { score: 45,  color: [242, 193, 78] },  // #F2C14E (Medium)
    { score: 65,  color: [240, 138, 60] },  // #F08A3C (High)
    { score: 85,  color: [229, 72, 77] },   // #E5484D (Critical)
    { score: 100, color: [229, 72, 77] }
  ];

  /**
   * Linear color interpolation across the risk ramp stops.
   * Produces smooth continuous color transition so 44 and 46 don't snap.
   */
  function interpolateRiskColor(score) {
    const clamped = Math.max(0, Math.min(100, score));

    for (let i = 0; i < COLOR_RAMP.length - 1; i++) {
      const p1 = COLOR_RAMP[i];
      const p2 = COLOR_RAMP[i + 1];

      if (clamped >= p1.score && clamped <= p2.score) {
        const range = p2.score - p1.score;
        const factor = range === 0 ? 0 : (clamped - p1.score) / range;

        const r = Math.round(p1.color[0] + (p2.color[0] - p1.color[0]) * factor);
        const g = Math.round(p1.color[1] + (p2.color[1] - p1.color[1]) * factor);
        const b = Math.round(p1.color[2] + (p2.color[2] - p1.color[2]) * factor);

        return {
          rgb: `rgb(${r}, ${g}, ${b})`,
          dim: `rgba(${r}, ${g}, ${b}, 0.12)`,
          hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        };
      }
    }
    return { rgb: 'rgb(45, 212, 167)', dim: 'rgba(45, 212, 167, 0.12)', hex: '#2DD4A7' };
  }

  /**
   * Homograph / Lookalike Detection:
   * Flags mixed cyrillic/greek characters that mimic latin domain names (e.g. раypal vs paypal).
   */
  function detectHomographLookalikes(domain) {
    if (!domain) return null;
    const clean = domain.toLowerCase();

    // Check for Punycode representation (starts with xn--)
    if (clean.includes('xn--')) {
      return {
        isHomograph: true,
        type: 'punycode',
        message: 'Domain uses internationalized Punycode encoding (often used to disguise lookalike URLs).'
      };
    }

    // Common Cyrillic & Greek homoglyphs mapped to Latin counterparts
    // Cyrillic: а (U+0430), с (U+0441), е (U+0435), о (U+043E), р (U+0440), х (U+0445), у (U+0443), і (U+0456)
    // Greek: ο (U+03BF), ν (U+03BD), α (U+03B1)
    const homoglyphRegex = /[\u0400-\u04FF\u0370-\u03FF]/;
    const hasHomoglyph = homoglyphRegex.test(clean);

    if (hasHomoglyph) {
      const suspiciousChars = [];
      for (const char of clean) {
        if (homoglyphRegex.test(char) && !suspiciousChars.includes(char)) {
          suspiciousChars.push(char);
        }
      }
      return {
        isHomograph: true,
        type: 'mixed_script',
        chars: suspiciousChars,
        message: `Non-ASCII lookalike character(s) detected: ${suspiciousChars.map(c => `[${c}]`).join(' ')}. Verify domain spelling carefully!`
      };
    }

    return null;
  }

  /**
   * Updates Chrome Action Toolbar Badge with passive peripheral awareness
   */
  function updatePassiveBadge(score, hexColor) {
    try {
      if (typeof chrome !== 'undefined' && chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: `${score}%` });
        chrome.action.setBadgeBackgroundColor({ color: hexColor });
      }
    } catch (_) {}
  }

  /**
   * Renders the animated radial arc gauge & verdict
   */
  function renderGauge(score) {
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    const colorInfo = interpolateRiskColor(clampedScore);

    // Dynamic custom properties for CSS
    document.documentElement.style.setProperty('--current-risk-color', colorInfo.rgb);
    document.documentElement.style.setProperty('--current-risk-dim', colorInfo.dim);

    // Apply soft outer glow only when score >= 65
    if (clampedScore >= 65) {
      document.documentElement.style.setProperty('--current-glow', `drop-shadow(0 0 10px rgba(${colorInfo.rgb.slice(4, -1)}, 0.28))`);
    } else {
      document.documentElement.style.setProperty('--current-glow', 'none');
    }

    // SVG arc stroke fill animation
    // Arc starts from left (115y, 25x) to right (115y, 175x)
    const targetOffset = ARC_LENGTH - (ARC_LENGTH * (clampedScore / 100));
    gaugeFillArcEl.style.strokeDashoffset = targetOffset;
    gaugeSvgEl.setAttribute('aria-label', `Security risk gauge: ${clampedScore} out of 100`);

    // Counter number count-up animation
    let currentVal = 0;
    const duration = 500;
    const startStamp = performance.now();

    function step(stamp) {
      const progress = Math.min(1, (stamp - startStamp) / duration);
      currentVal = Math.round(progress * clampedScore);
      gaugeScoreValueEl.textContent = currentVal;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        gaugeScoreValueEl.textContent = clampedScore;
      }
    }
    requestAnimationFrame(step);

    // Verdict Badge & Category
    verdictBadgeEl.className = 'verdict-pill';
    if (clampedScore < 25) {
      verdictBadgeEl.classList.add('verdict-safe');
      verdictIconEl.textContent = '✔';
      verdictTextEl.textContent = 'Looks safe';
    } else if (clampedScore < 45) {
      verdictBadgeEl.classList.add('verdict-low');
      verdictIconEl.textContent = '●';
      verdictTextEl.textContent = 'Low risk — normal traffic';
    } else if (clampedScore < 65) {
      verdictBadgeEl.classList.add('verdict-medium');
      verdictIconEl.textContent = '▲';
      verdictTextEl.textContent = 'Suspicious — verify identity';
    } else if (clampedScore < 85) {
      verdictBadgeEl.classList.add('verdict-high');
      verdictIconEl.textContent = '⚠';
      verdictTextEl.textContent = 'High risk — do not enter credentials';
    } else {
      verdictBadgeEl.classList.add('verdict-critical');
      verdictIconEl.textContent = '✕';
      verdictTextEl.textContent = 'Critical threat — high phishing risk';
    }

    // Set passive badge
    updatePassiveBadge(clampedScore, colorInfo.hex);
  }

  /**
   * Renders the expandable list of weighted contributing signals
   */
  function renderSignals(factors = [], rawSignals = {}) {
    signalsList.innerHTML = '';
    const signalItems = [];

    // Parse factors from threat-score.js and construct weighted structured signal items
    if (factors.length === 0) {
      signalItems.push({
        label: 'No risk factors detected',
        impact: 0,
        type: 'neutral',
        icon: '🛡️'
      });
    } else {
      for (const factor of factors) {
        if (typeof factor !== 'string') continue;

        if (factor.includes('Unencrypted connection (HTTP)')) {
          signalItems.push({
            label: 'Insecure transport (HTTP protocol)',
            impact: 30,
            type: 'high',
            icon: '🔓'
          });
        } else if (factor.includes('Password input on insecure HTTP')) {
          signalItems.push({
            label: 'Password input over unencrypted connection',
            impact: 40,
            type: 'critical',
            icon: '🔑'
          });
        } else if (factor.includes('sensitive PII field(s) visible')) {
          const match = factor.match(/\+(\d+)/);
          const impact = match ? parseInt(match[1], 10) : 20;
          signalItems.push({
            label: factor.split(':')[0],
            impact: impact,
            type: impact >= 30 ? 'high' : 'medium',
            icon: '🪪'
          });
        } else if (factor.includes('Form submitting to third-party')) {
          signalItems.push({
            label: 'Form posts data to third-party domain',
            impact: 15,
            type: 'medium',
            icon: '↗️'
          });
        } else if (factor.includes('Third-party iframe embedded')) {
          signalItems.push({
            label: 'Embedded external third-party iframe',
            impact: 10,
            type: 'low',
            icon: '🪟'
          });
        } else if (factor.includes('Zero redactable sensitive PII')) {
          signalItems.push({
            label: 'No sensitive credentials/PII exposed',
            impact: 0,
            type: 'neutral',
            icon: '✔'
          });
        } else {
          // General fallback
          const match = factor.match(/\+(\d+)/);
          const impact = match ? parseInt(match[1], 10) : 10;
          signalItems.push({
            label: factor,
            impact: impact,
            type: impact >= 30 ? 'high' : (impact >= 15 ? 'medium' : 'low'),
            icon: '⚡'
          });
        }
      }
    }

    // Check homograph
    if (rawSignals.homographAlert) {
      signalItems.unshift({
        label: 'Domain homograph / lookalike spoofing',
        impact: 50,
        type: 'critical',
        icon: '⚠️'
      });
    }

    // Sort signals by descending impact
    signalItems.sort((a, b) => b.impact - a.impact);

    const nonZeroCount = signalItems.filter(s => s.impact > 0).length;
    signalsCountBadge.textContent = nonZeroCount > 0 ? `${nonZeroCount} risk factor${nonZeroCount > 1 ? 's' : ''}` : 'All clear';

    for (const item of signalItems) {
      const row = document.createElement('div');
      let weightClass = 'weight-neutral';
      if (item.impact >= 40) weightClass = 'weight-high';
      else if (item.impact >= 20) weightClass = 'weight-medium';
      else if (item.impact > 0) weightClass = 'weight-low';

      row.className = `signal-row ${weightClass}`;
      row.innerHTML = `
        <div class="signal-left">
          <div class="signal-icon-box" aria-hidden="true">${item.icon}</div>
          <span class="signal-label" title="${item.label}">${item.label}</span>
        </div>
        <span class="signal-badge">${item.impact > 0 ? `+${item.impact}` : '0'}</span>
      `;
      signalsList.appendChild(row);
    }
  }

  /**
   * Switch Active State Views
   */
  function showState(stateName) {
    stateScanning.style.display = stateName === 'scanning' ? 'flex' : 'none';
    stateInternal.style.display = stateName === 'internal' ? 'flex' : 'none';
    stateError.style.display = stateName === 'error' ? 'flex' : 'none';
    stateActive.style.display = stateName === 'active' ? 'flex' : 'none';
  }

  /**
   * Shows a brief toast notification
   */
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /**
   * Core Analysis Dispatcher
   */
  async function analyzeCurrentTab() {
    showState('scanning');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        showState('error');
        return;
      }

      const tabUrl = tab.url;

      // Check for internal browser URLs
      if (
        tabUrl.startsWith('chrome://') ||
        tabUrl.startsWith('chrome-extension://') && !tabUrl.includes('evaluation_page.html') ||
        tabUrl.startsWith('about:') ||
        tabUrl.startsWith('edge://') ||
        tabUrl.startsWith('view-source:')
      ) {
        const internalDesc = document.getElementById('internal-page-desc');
        if (internalDesc) {
          internalDesc.textContent = `Active page is a browser system page (${tabUrl.split('?')[0]}). System security and extension sandboxing apply.`;
        }
        showState('internal');
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(tabUrl);
      } catch (e) {
        showState('error');
        return;
      }

      const domain = parsedUrl.hostname || 'Unknown Domain';
      const isHttps = parsedUrl.protocol === 'https:';

      // 1. Populate Domain Info
      domainNameEl.textContent = domain;
      domainNameEl.title = domain;
      urlSubtextEl.textContent = tabUrl;

      // Favicon handling
      if (tab.favIconUrl) {
        domainFaviconEl.src = tab.favIconUrl;
        domainFaviconEl.style.display = 'block';
        domainFaviconFallbackEl.style.display = 'none';
      } else {
        domainFaviconEl.style.display = 'none';
        domainFaviconFallbackEl.style.display = 'block';
      }

      // SSL status
      if (isHttps) {
        sslBadgeEl.className = 'ssl-badge secure';
        sslTextEl.textContent = 'HTTPS';
        sslBadgeEl.title = 'Secure HTTPS encrypted connection';
      } else {
        sslBadgeEl.className = 'ssl-badge insecure';
        sslTextEl.textContent = 'HTTP (Insecure)';
        sslBadgeEl.title = 'Insecure connection. Plaintext transport.';
      }

      // 2. Homograph / Lookalike Character Inspection
      const homograph = detectHomographLookalikes(domain);
      if (homograph && homograph.isHomograph) {
        homographBannerEl.style.display = 'flex';
        homographDescEl.textContent = homograph.message;
      } else {
        homographBannerEl.style.display = 'none';
      }

      // 3. Inspect In-Page Heuristics via Scripting Execution
      let pageSignals = {
        hasPasswordField: false,
        detectedPII: 0,
        crossOriginFormsCount: 0,
        thirdPartyIframesCount: 0
      };

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const hasPassword = Boolean(document.querySelector('input[type="password"]'));
            const currentHost = window.location.hostname;

            let crossOriginForms = 0;
            document.querySelectorAll('form[action]').forEach(f => {
              if (f.closest('#privacyshield-root')) return;
              const act = f.getAttribute('action') || '';
              if (act.startsWith('http://') || act.startsWith('https://')) {
                try {
                  const formHost = new URL(act, window.location.href).hostname;
                  if (formHost && formHost !== currentHost) crossOriginForms++;
                } catch (_) {}
              }
            });

            let thirdPartyIframes = 0;
            document.querySelectorAll('iframe[src]').forEach(ifr => {
              if (ifr.closest('#privacyshield-root')) return;
              const src = ifr.getAttribute('src') || '';
              if (src.startsWith('http://') || src.startsWith('https://')) {
                try {
                  const ifrHost = new URL(src, window.location.href).hostname;
                  if (ifrHost && ifrHost !== currentHost) thirdPartyIframes++;
                } catch (_) {}
              }
            });

            // Count visible redactable elements or PII spans if already scanned
            const redactedOverlays = document.querySelectorAll('.ps-face-overlay, .ps-overlay, .ps-pii-masked').length;

            return {
              hasPassword,
              crossOriginForms,
              thirdPartyIframes,
              detectedPII: redactedOverlays
            };
          }
        });

        if (results && results[0] && results[0].result) {
          const r = results[0].result;
          pageSignals.hasPasswordField = r.hasPassword;
          pageSignals.crossOriginFormsCount = r.crossOriginForms;
          pageSignals.thirdPartyIframesCount = r.thirdPartyIframes;
          pageSignals.detectedPII = r.detectedPII;
        }
      } catch (scriptErr) {
        // Content script might be restricted on certain pages; fall back calmly to URL-level signals
        console.warn('[Phantom Face] Content script query notice:', scriptErr.message);
      }

      // 4. Compute Threat & Exposure Score via Preserved computeThreatScore Engine
      let threatScoreFn = null;
      if (typeof computeThreatScore === 'function') {
        threatScoreFn = computeThreatScore;
      } else if (typeof window !== 'undefined' && typeof window.computeThreatScore === 'function') {
        threatScoreFn = window.computeThreatScore;
      }

      let threatResult = {
        score: 0,
        factors: [],
        level: 'low'
      };

      if (threatScoreFn) {
        threatResult = threatScoreFn({
          isHttps,
          hasPasswordField: pageSignals.hasPasswordField,
          detectedPII: pageSignals.detectedPII,
          crossOriginFormsCount: pageSignals.crossOriginFormsCount,
          thirdPartyIframesCount: pageSignals.thirdPartyIframesCount
        });
      } else {
        // Safe internal fallback computation matching same rules
        let score = 0;
        const factors = [];
        if (!isHttps) {
          score += 30;
          factors.push('Unencrypted connection (HTTP): +30');
          if (pageSignals.hasPasswordField) {
            score += 40;
            factors.push('Password input on insecure HTTP transport: +40');
          }
        }
        if (pageSignals.crossOriginFormsCount > 0) {
          score += 15;
          factors.push('Form submitting to third-party domain: +15');
        }
        if (pageSignals.thirdPartyIframesCount > 0) {
          score += 10;
          factors.push('Third-party iframe embedded: +10');
        }
        threatResult = {
          score: Math.min(100, score),
          factors,
          level: score > 66 ? 'high' : (score >= 33 ? 'medium' : 'low')
        };
      }

      // If homograph was detected, augment score (+35) without altering base engine
      if (homograph && homograph.isHomograph) {
        threatResult.score = Math.min(100, threatResult.score + 35);
        threatResult.factors.unshift('Domain homograph / lookalike spoofing: +35');
      }

      // Store analysis data for clipboard report
      currentAnalysisData = {
        domain,
        url: tabUrl,
        isHttps,
        score: threatResult.score,
        level: threatResult.level,
        factors: threatResult.factors,
        signals: pageSignals,
        homograph: homograph,
        timestamp: new Date().toISOString()
      };

      // 5. Render Active View
      showState('active');
      renderGauge(threatResult.score);
      renderSignals(threatResult.factors, { homographAlert: Boolean(homograph) });

    } catch (globalErr) {
      console.error('[Phantom Face] Analysis error:', globalErr);
      showState('error');
    }
  }

  // --- EVENT LISTENERS ---

  // Signals Accordion Toggle
  signalsToggleBtn.addEventListener('click', () => {
    const isExpanded = signalsToggleBtn.getAttribute('aria-expanded') === 'true';
    const nextState = !isExpanded;
    signalsToggleBtn.setAttribute('aria-expanded', String(nextState));
    signalsListContainer.style.display = nextState ? 'block' : 'none';
  });

  // Copy Security Report
  btnCopyReport.addEventListener('click', () => {
    if (!currentAnalysisData) {
      showToast('No active report to copy.');
      return;
    }

    const reportMarkdown = [
      `# 🛡️ Phantom Face — Security Analysis Report`,
      `**Target Domain:** ${currentAnalysisData.domain}`,
      `**Target URL:** ${currentAnalysisData.url}`,
      `**Timestamp:** ${currentAnalysisData.timestamp}`,
      `**Risk Score:** ${currentAnalysisData.score}/100 (${currentAnalysisData.level.toUpperCase()})`,
      `**Transport:** ${currentAnalysisData.isHttps ? 'HTTPS (Encrypted)' : 'HTTP (INSECURE)'}`,
      currentAnalysisData.homograph ? `**Homograph Alert:** ${currentAnalysisData.homograph.message}` : null,
      ``,
      `### Contributing Risk Factors:`,
      currentAnalysisData.factors.length > 0 
        ? currentAnalysisData.factors.map(f => `- ${f}`).join('\n')
        : `- No suspicious factors detected (Clean baseline).`,
      ``,
      `*Generated by Phantom Face — ISRO SIH Privacy Vision Shield*`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(reportMarkdown).then(() => {
      showToast('Report copied to clipboard!');
    }).catch(() => {
      showToast('Failed to copy report.');
    });
  });

  // Activate In-Page Redactor on Current Tab
  btnActivateRedactor.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const fab = document.querySelector('.ps-fab-button');
          if (fab) {
            fab.click();
          } else {
            console.log('[Phantom Face] FAB not present on page.');
          }
        }
      });
      window.close();
    }
  });

  // Open Benchmark Suite Page
  function openBenchmark() {
    chrome.tabs.create({ url: chrome.runtime.getURL('test/evaluation_page.html') });
    window.close();
  }
  btnOpenBenchmark.addEventListener('click', openBenchmark);
  if (btnOpenBenchmarkInternal) {
    btnOpenBenchmarkInternal.addEventListener('click', openBenchmark);
  }

  // Open Options Page
  btnOpenOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
    }
    window.close();
  });

  // Close Popup
  const btnClosePopup = document.getElementById('btn-close-popup');
  if (btnClosePopup) {
    btnClosePopup.addEventListener('click', () => {
      window.close();
    });
  }

  // Retry Analysis
  if (btnRetryScan) {
    btnRetryScan.addEventListener('click', analyzeCurrentTab);
  }

  // Execute initial scan
  analyzeCurrentTab();
});
