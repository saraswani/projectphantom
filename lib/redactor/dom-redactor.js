/**
 * PrivacyShield - In-Place Reversible DOM Redaction Engine (Component 5)
 * Traverses visible DOM text nodes with TreeWalker, redacts PII in-place with styled badges,
 * and maintains in-memory token maps with instantaneous "Restore Page" and "Reveal Original" toggles.
 */
(function() {
  'use strict';

  const textDetector = (typeof window !== 'undefined' && window.textPIIDetector) || (typeof require !== 'undefined' ? require('../pii/text-detector').detector : null);

  class DOMRedactor {
    constructor() {
      this.mutatedElements = []; // [{ element, originalHTML, originalText, spans, tokens }]
      this.redactedNodeRects = []; // Bounding boxes for screenshot pixel masking
      this.isRedacted = false;
      this.revealedTokens = new Set();
    }

    /**
     * Resets redactor state and cleans tracking arrays.
     */
    reset() {
      this.mutatedElements = [];
      this.redactedNodeRects = [];
      this.isRedacted = false;
      this.revealedTokens.clear();
    }

    /**
     * Filters out non-content or internal extension DOM subtrees.
     */
    shouldSkipElement(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'textarea', 'iframe', 'svg', 'canvas'].includes(tag)) {
        return true;
      }
      if (el.id === 'privacyshield-root' || el.id === 'ps-mr-overlay' || el.id === 'ps-mr-preview-modal') {
        return true;
      }
      if (el.hasAttribute && (el.hasAttribute('data-token') || el.getAttribute('data-ps-ignore') === 'true')) {
        return true;
      }
      if (el.classList && (
        el.classList.contains('ps-injected') ||
        el.classList.contains('ps-redacted-badge') ||
        el.classList.contains('ps-redaction-wrapper') ||
        el.classList.contains('ps-face-overlay')
      )) {
        return true;
      }
      if (typeof el.closest === 'function' && el.closest(
        '#privacyshield-root, #ps-mr-overlay, #ps-mr-preview-modal, .ps-mr-modal-backdrop, .ps-injected, .ps-redacted-badge, .ps-redaction-wrapper, .ps-face-overlay, [data-token], [data-ps-ignore="true"]'
      )) {
        return true;
      }
      return false;
    }

    /**
     * Scans all visible text nodes in the DOM, redacts sensitive entities,
     * and injects subtle interactive privacy badges with reveal tooltips.
     * @returns {Object} Redaction summary { totalRedacted, tokens, boundingBoxes }
     */
    redactPageDOM(rootNode = document.body, isPartial = false) {
      const startTime = performance.now();
      if (!isPartial) {
        this.reset();
      }

      if (!rootNode) {
        return { totalRedacted: 0, tokens: [], boundingBoxes: [], durationMs: 0 };
      }

      if (rootNode.nodeType === Node.ELEMENT_NODE && this.shouldSkipElement(rootNode)) {
        return { totalRedacted: 0, tokens: [], boundingBoxes: [], durationMs: 0 };
      }

      if (!textDetector) {
        console.error('[PrivacyShield] TextPIIDetector not initialized.');
        return { totalRedacted: 0, durationMs: 0 };
      }

      // Collect eligible text nodes using TreeWalker
      const walker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent || this.shouldSkipElement(parent)) {
              return NodeFilter.FILTER_REJECT;
            }
            if (!node.nodeValue || node.nodeValue.trim().length === 0) {
              return NodeFilter.FILTER_SKIP;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes = [];
      let currentNode;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
      }

      let totalRedacted = 0;
      const allTokens = [];

      for (const textNode of textNodes) {
        const rawText = textNode.nodeValue;
        const extraEntities = [];
        const parent = textNode.parentElement;

        // Contextual table column detection for Person / Candidate Names
        const td = parent ? (parent.tagName === 'TD' ? parent : parent.closest('td')) : null;
        if (td) {
          const table = td.closest('table');
          if (table) {
            const colIdx = td.cellIndex;
            if (colIdx !== undefined && colIdx >= 0) {
              const th = table.querySelector(`thead tr th:nth-child(${colIdx + 1})`) || table.querySelector(`tr th:nth-child(${colIdx + 1})`);
              const headerText = th ? th.textContent.trim().toLowerCase() : '';
              if (/candidate|name|patient|employee|author|person/i.test(headerText)) {
                const trimmed = rawText.trim();
                if (
                  trimmed &&
                  !trimmed.startsWith('#') &&
                  !/^\[[A-Z0-9_]+\]$/i.test(trimmed) &&
                  !(trimmed.startsWith('[') && trimmed.endsWith(']')) &&
                  !/^(?:active|pending|submitted|status|true|false|\d+)$/i.test(trimmed)
                ) {
                  const sIdx = rawText.indexOf(trimmed);
                  if (sIdx !== -1) {
                    extraEntities.push({
                      text: trimmed,
                      label: 'PERSON',
                      start: sIdx,
                      end: sIdx + trimmed.length
                    });
                  }
                }
              }
            }
          }
        }

        const result = textDetector.detectAndSanitize(rawText, extraEntities);

        if (result.detectedSpans.length > 0) {
          totalRedacted += result.detectedSpans.length;
          const parent = textNode.parentElement;

          // Save mutation state for lossless restoration
          const wrapper = document.createElement('span');
          wrapper.style.display = 'contents';
          wrapper.className = 'ps-redaction-wrapper ps-injected';
          wrapper.setAttribute('data-ps-ignore', 'true');

          this.mutatedElements.push({
            parent: parent,
            textNode: textNode,
            originalText: rawText,
            spans: result.detectedSpans,
            wrapper: wrapper
          });

          // Replace text node content with sanitized token spans
          const fragment = document.createDocumentFragment();
          let lastIdx = 0;

          for (const span of result.detectedSpans) {
            allTokens.push(span.token);

            // Preceding text
            if (span.start > lastIdx) {
              fragment.appendChild(document.createTextNode(rawText.substring(lastIdx, span.start)));
            }

            // Create interactive redacted badge
            const badge = document.createElement('span');
            badge.className = 'ps-redacted-badge ps-injected';
            badge.setAttribute('data-ps-ignore', 'true');
            badge.setAttribute('data-token', span.token);
            badge.setAttribute('data-category', span.prefix);
            badge.setAttribute('title', `PrivacyShield: ${span.category} Masked (Click to Reveal)`);
            badge.textContent = span.token;

            // Inline badge styling for robust encapsulation
            badge.style.cssText = `
              background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
              color: #38bdf8;
              border: 1px solid #0284c7;
              border-radius: 4px;
              padding: 1px 5px;
              font-family: ui-monospace, monospace;
              font-size: 0.88em;
              font-weight: 600;
              letter-spacing: 0.03em;
              cursor: pointer;
              box-shadow: 0 0 8px rgba(2, 132, 199, 0.25);
              transition: all 0.2s ease;
              display: inline-block;
              user-select: all;
            `;

            // Click-to-reveal toggle event
            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              e.preventDefault();
              this.toggleRevealBadge(badge, span.token, span.text);
            });

            fragment.appendChild(badge);
            lastIdx = span.end;
          }

          // Trailing text
          if (lastIdx < rawText.length) {
            fragment.appendChild(document.createTextNode(rawText.substring(lastIdx)));
          }

          // Swap text node with wrapper in live DOM
          wrapper.appendChild(fragment);
          parent.replaceChild(wrapper, textNode);

          // Record bounding rect of the redacted region for canvas synchronization
          const parentRect = parent.getBoundingClientRect();
          this.redactedNodeRects.push({
            x: Math.round(parentRect.left + window.scrollX),
            y: Math.round(parentRect.top + window.scrollY),
            width: Math.round(parentRect.width),
            height: Math.round(parentRect.height),
            tokens: result.detectedSpans.map(s => s.token)
          });
        }
      }

      this.isRedacted = true;
      const durationMs = performance.now() - startTime;

      return {
        totalRedacted: totalRedacted,
        tokens: allTokens,
        mutatedCount: this.mutatedElements.length,
        boundingBoxes: this.redactedNodeRects,
        durationMs: Math.round(durationMs * 100) / 100
      };
    }

    /**
     * Redacts detected faces on the live webpage DOM by injecting non-destructive overlay elements over face regions.
     * Never mutates img.src or img.crossOrigin, ensuring zero broken images or CORS corruptions.
     * @param {Array} faceBoxes - [{ x, y, width, height, confidence }]
     */
    redactDOMFaces(faceBoxes = []) {
      if (!Array.isArray(faceBoxes) || faceBoxes.length === 0) return 0;

      let count = 0;
      for (const face of faceBoxes) {
        if (!face.width || !face.height || face.width < 4 || face.height < 4) continue;

        const overlay = document.createElement('div');
        overlay.className = 'ps-face-overlay ps-injected';
        overlay.setAttribute('aria-hidden', 'true');

        // Coordinates use scrollX/scrollY for absolute positioning on the page
        const left = Math.round(face.x + window.scrollX);
        const top = Math.round(face.y + window.scrollY);
        const w = Math.round(face.width);
        const h = Math.round(face.height);

        const borderRadius = face.borderRadius || '8px';

        // Scale the badge label so it fits small overlays
        const minDim = Math.min(w, h);
        const badgeFontSize = Math.max(7, Math.min(11, Math.floor(minDim * 0.12)));
        const showLabel = minDim >= 40;

        overlay.style.cssText = `
          position: absolute !important;
          left: ${left}px !important;
          top: ${top}px !important;
          width: ${w}px !important;
          height: ${h}px !important;
          background: rgba(8, 12, 28, 0.88) !important;
          backdrop-filter: blur(18px) saturate(0.3) !important;
          -webkit-backdrop-filter: blur(18px) saturate(0.3) !important;
          border: 2px solid rgba(217, 119, 87, 0.85) !important;
          border-radius: ${borderRadius} !important;
          z-index: 2147483640 !important;
          pointer-events: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 2px 16px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(217,119,87,0.15) !important;
          user-select: none !important;
          overflow: hidden !important;
        `;

        if (showLabel) {
          overlay.innerHTML = `<span style="
            background: rgba(217,119,87,0.92);
            color: #fff;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: ${badgeFontSize}px;
            font-weight: 700;
            font-family: ui-monospace, monospace;
            letter-spacing: 0.04em;
            white-space: nowrap;
            max-width: 90%;
            overflow: hidden;
            text-overflow: ellipsis;
          ">🛡 FACE</span>`;
        }

        document.body.appendChild(overlay);
        this.mutatedElements.push({ isOverlay: true, element: overlay });
        count++;
      }

      console.log(`[PrivacyShield] Face overlays injected: ${count}`);
      return count;
    }

    /**
     * Redacts detected sensitive OCR text boxes on the live webpage DOM
     * by injecting non-destructive overlay elements over sensitive fields.
     * @param {Array} ocrBoxes - [{ x, y, width, height, field, tokens, value }]
     * @returns {number} count of overlays injected
     */
    redactDOMOCRBoxes(ocrBoxes = []) {
      if (!Array.isArray(ocrBoxes) || ocrBoxes.length === 0) return 0;

      let count = 0;
      for (const box of ocrBoxes) {
        if (!box.width || !box.height || box.width < 4 || box.height < 4) continue;

        const overlay = document.createElement('div');
        overlay.className = 'ps-ocr-overlay ps-injected';
        overlay.setAttribute('aria-hidden', 'true');

        const left = Math.round(box.x + window.scrollX);
        const top = Math.round(box.y + window.scrollY);
        const w = Math.round(box.width);
        const h = Math.round(box.height);

        const token = (box.tokens && box.tokens[0]) ? box.tokens[0] : `[${box.field || 'REDACTED'}]`;
        const fontSize = Math.max(7, Math.min(10, Math.floor(h * 0.65)));

        overlay.style.cssText = `
          position: absolute !important;
          left: ${left}px !important;
          top: ${top}px !important;
          width: ${w}px !important;
          height: ${h}px !important;
          background: rgba(15, 23, 42, 0.94) !important;
          border: 1.5px solid #f59e0b !important;
          border-radius: 4px !important;
          z-index: 2147483640 !important;
          pointer-events: none !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
          user-select: none !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        `;

        overlay.innerHTML = `<span style="
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: ${fontSize}px;
          font-weight: 700;
          font-family: ui-monospace, monospace;
          letter-spacing: 0.03em;
          white-space: nowrap;
          max-width: 95%;
          overflow: hidden;
          text-overflow: ellipsis;
        ">${token}</span>`;

        document.body.appendChild(overlay);
        this.mutatedElements.push({ isOverlay: true, element: overlay });
        count++;
      }

      console.log(`[PrivacyShield] OCR overlays injected: ${count}`);
      return count;
    }

    /**
     * Toggles reveal/mask for an individual redacted badge.
     */

    toggleRevealBadge(badge, token, originalText) {
      if (this.revealedTokens.has(token)) {
        // Re-mask
        this.revealedTokens.delete(token);
        badge.textContent = token;
        badge.style.color = '#38bdf8';
        badge.style.borderColor = '#0284c7';
        badge.style.background = 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))';
      } else {
        // Reveal
        this.revealedTokens.add(token);
        badge.textContent = originalText;
        badge.style.color = '#f59e0b';
        badge.style.borderColor = '#f59e0b';
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
      }
    }

    /**
     * Completely restores the webpage DOM back to original unredacted text and removes all face overlays.
     */
    restorePageDOM() {
      if (!this.isRedacted) return;

      for (const item of this.mutatedElements) {
        if (item.isOverlay && item.element && item.element.parentNode) {
          item.element.parentNode.removeChild(item.element);
        } else if (item.wrapper && item.wrapper.parentNode) {
          item.wrapper.parentNode.replaceChild(item.textNode, item.wrapper);
        }
      }

      // Also clean up any lingering overlays
      const overlays = document.querySelectorAll('.ps-face-overlay, .ps-ocr-overlay');
      overlays.forEach(el => el.remove());

      this.reset();
    }
  }

  const domRedactorInstance = new DOMRedactor();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DOMRedactor,
      domRedactor: domRedactorInstance
    };
  } else if (typeof window !== 'undefined') {
    window.DOMRedactor = DOMRedactor;
    window.domRedactor = domRedactorInstance;
  }
})();
