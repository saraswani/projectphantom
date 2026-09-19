/**
 * PrivacyShield - Local Screen-Understanding & UI Structure Model (Component 1)
 * Hybrid Vision + DOM Accessibility Tree Engine.
 * Extracts structured UI regions, semantic labels, viewport bounding boxes, confidence scores,
 * and generates a topological screen structure fingerprint.
 */
(function() {
  'use strict';

  class ScreenUnderstandingModel {
    constructor() {
      this.lastScreenFingerprint = null;
      this.lastAnalysis = null;
    }

    /**
     * Helper to compute a unique and reproducible CSS selector for a DOM element.
     */
    getElementSelector(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
      if (el.id) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
          return `#${CSS.escape(el.id)}`;
        }
        return `[id="${el.id.replace(/"/g, '\\"')}"]`;
      }

      // Check name attribute for form fields
      if (el.name) {
        const tag = el.tagName.toLowerCase();
        return `${tag}[name="${el.name.replace(/"/g, '\\"')}"]`;
      }

      // Check unique placeholder or aria-label
      if (el.getAttribute('placeholder')) {
        return `${el.tagName.toLowerCase()}[placeholder="${el.getAttribute('placeholder').replace(/"/g, '\\"')}"]`;
      }
      if (el.getAttribute('aria-label')) {
        return `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label').replace(/"/g, '\\"')}"]`;
      }

      // Path based selector
      const path = [];
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        let sibling = current;
        let nth = 1;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          if (sibling.tagName === current.tagName) nth++;
        }
        if (nth > 1) {
          selector += `:nth-of-type(${nth})`;
        }
        path.unshift(selector);
        current = current.parentElement;
      }
      return path.join(' > ') || el.tagName.toLowerCase();
    }

    /**
     * Extracts readable human semantic label for a UI element.
     */
    getElementLabel(el) {
      if (!el) return '';

      // 1. Check aria-label / aria-labelledby
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }
      if (el.getAttribute('aria-labelledby')) {
        const labelEl = document.getElementById(el.getAttribute('aria-labelledby'));
        if (labelEl) return labelEl.innerText.trim();
      }

      // 2. Check HTML <label for="id">
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) return labelEl.innerText.trim();
      }

      // 3. Check enclosing <label>
      const parentLabel = el.closest('label');
      if (parentLabel) {
        return parentLabel.innerText.trim();
      }

      // 4. Check enclosing form-group container for a label
      const container = el.closest('.form-group, .form-row, .field, .form-field, div');
      if (container) {
        const cLabel = container.querySelector('label');
        if (cLabel) return cLabel.innerText.trim();
      }

      // 5. Check placeholder or title
      if (el.getAttribute('placeholder')) return el.getAttribute('placeholder').trim();
      if (el.getAttribute('title')) return el.getAttribute('title').trim();

      // 6. Check HTML5 autocomplete
      if (el.getAttribute('autocomplete')) return el.getAttribute('autocomplete').trim();

      // 7. Check text content for buttons / links / headings
      const tag = el.tagName.toLowerCase();
      if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'summary'].includes(tag)) {
        return el.innerText.trim().slice(0, 60);
      }

      // 8. Check nearby preceding sibling text (e.g. standard form label before input)
      if (el.previousElementSibling && ['LABEL', 'SPAN', 'P'].includes(el.previousElementSibling.tagName)) {
        return el.previousElementSibling.innerText.trim().slice(0, 50);
      }

      return el.name || el.id || tag;
    }

    /**
     * Determines whether an element is visible in the current viewport or DOM layout.
     * @param {HTMLElement} el
     * @param {DOMRect} rect
     * @param {boolean} allowOffscreen If true, considers element visible as long as it's rendered in document flow (not display:none, etc.)
     */
    isElementVisible(el, rect, allowOffscreen = false) {
      if (!rect || (rect.width <= 0 && rect.height <= 0)) return false;
      if (el.offsetParent === null && el.tagName !== 'BODY') return false;

      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) {
        return false;
      }

      if (allowOffscreen) {
        return true;
      }

      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;

      // Check if partially inside viewport
      return (
        rect.top < vh &&
        rect.bottom > 0 &&
        rect.left < vw &&
        rect.right > 0
      );
    }

    /**
     * Analyzes the entire on-screen viewport and produces structured UI regions.
     * @returns {Object} Structured screen description JSON
     */
    analyzeScreen() {
      const startTime = performance.now();
      const elements = [];
      let elementIdCounter = 1;

      // Track distribution for page classification and fingerprinting
      const counts = {
        inputs: 0,
        buttons: 0,
        forms: 0,
        images: 0,
        headings: 0,
        tables: 0,
        textBlocks: 0,
        navigation: 0
      };

      // 1. Detect Form Inputs
      const inputEls = document.querySelectorAll('input, select, textarea');
      const classifier = (typeof FormFieldClassifier !== 'undefined' ? FormFieldClassifier : (typeof formClassifier !== 'undefined' ? formClassifier : null));

      inputEls.forEach((el) => {
        // Skip button types, hidden types, disabled, and privacy shield panel elements
        const inputType = (el.type || '').toLowerCase();
        if (['submit', 'button', 'reset', 'image', 'hidden'].includes(inputType) || el.disabled || el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect, true)) return;

        const tag = el.tagName.toLowerCase();
        let type = 'input_text';
        let confidence = 0.96;

        if (tag === 'select') type = 'select_dropdown';
        else if (tag === 'textarea') type = 'textarea';
        else if (inputType === 'password') type = 'input_password';
        else if (inputType === 'email') type = 'input_email';
        else if (inputType === 'checkbox') type = 'input_checkbox';
        else if (inputType === 'radio') type = 'input_radio';
        else if (inputType === 'number') type = 'input_number';
        else if (inputType === 'date') type = 'input_date';
        else if (inputType === 'search') type = 'input_search';

        const semanticFieldType = classifier ? classifier.classify(el) : null;
        counts.inputs++;

        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: type,
          role: el.getAttribute('role') || tag,
          label: this.getElementLabel(el),
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: confidence,
          interactable: true,
          semanticFieldType: semanticFieldType,
          autocomplete: el.getAttribute('autocomplete') || '',
          value: el.type === 'password' ? '••••••••' : (el.value ? el.value.slice(0, 30) : '')
        });
      });

      // 2. Detect Buttons & Interactive Action Triggers
      const buttonEls = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a.button');
      buttonEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;

        counts.buttons++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'button',
          role: 'button',
          label: this.getElementLabel(el) || 'Submit / Action',
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.94,
          interactable: true
        });
      });

      // 3. Detect Forms & Semantic Containers
      const formEls = document.querySelectorAll('form, [role="form"]');
      formEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;

        counts.forms++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'form_container',
          role: 'form',
          label: el.getAttribute('aria-label') || el.name || el.id || 'Web Form',
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.90,
          interactable: false
        });
      });

      // 4. Detect Images & Visual Media
      const imageEls = document.querySelectorAll('img, svg, canvas, [role="img"]');
      imageEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;
        // Ignore tiny icon images
        if (rect.width < 24 || rect.height < 24) return;

        counts.images++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'image_media',
          role: 'image',
          label: el.alt || el.getAttribute('aria-label') || el.title || 'Image Content',
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.92,
          interactable: false,
          src: (el.src || '').slice(0, 120)
        });
      });

      // 5. Detect Headings & Key Typography
      const headingEls = document.querySelectorAll('h1, h2, h3, [role="heading"]');
      headingEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;

        counts.headings++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'heading',
          role: 'heading',
          label: el.innerText.trim().slice(0, 80),
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.88,
          interactable: false
        });
      });

      // 6. Detect Tables & Data Grids
      const tableEls = document.querySelectorAll('table, [role="table"], [role="grid"]');
      tableEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;

        counts.tables++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'table_grid',
          role: 'table',
          label: el.getAttribute('aria-label') || 'Data Table',
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.89,
          interactable: false
        });
      });

      // 7. Detect Navigation Bars
      const navEls = document.querySelectorAll('nav, [role="navigation"]');
      navEls.forEach((el) => {
        if (el.closest('#privacyshield-root')) return;

        const rect = el.getBoundingClientRect();
        if (!this.isElementVisible(el, rect)) return;

        counts.navigation++;
        elements.push({
          id: `elem_${elementIdCounter++}`,
          type: 'navigation',
          role: 'navigation',
          label: el.getAttribute('aria-label') || 'Navigation Bar',
          bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
          selector: this.getElementSelector(el),
          confidence: 0.86,
          interactable: true
        });
      });

      // 8. Compute Screen Structure Fingerprint (Topology Hash)
      const fingerprint = this.computeFingerprint(elements, counts);
      const isChanged = (this.lastScreenFingerprint !== fingerprint);
      this.lastScreenFingerprint = fingerprint;

      const durationMs = performance.now() - startTime;

      const result = {
        elements: elements,
        totalElements: elements.length,
        interactableCount: counts.inputs + counts.buttons,
        summaryCounts: counts,
        viewport: {
          width: window.innerWidth || document.documentElement.clientWidth,
          height: window.innerHeight || document.documentElement.clientHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        },
        fingerprint: fingerprint,
        isStateChanged: isChanged,
        durationMs: Math.round(durationMs * 100) / 100
      };

      this.lastAnalysis = result;
      return result;
    }

    /**
     * Computes a deterministic structural fingerprint for the current screen state.
     */
    computeFingerprint(elements, counts) {
      const parts = [
        `i:${counts.inputs}`,
        `b:${counts.buttons}`,
        `f:${counts.forms}`,
        `img:${counts.images}`,
        `h:${counts.headings}`,
        `t:${counts.tables}`
      ];

      // Sample first 8 elements' types & coordinates
      const sample = elements.slice(0, 8).map(e => `${e.type}@${e.bbox[0]},${e.bbox[1]}`).join('|');
      parts.push(sample);

      // Simple fast hash
      const raw = parts.join(';');
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
      }
      return `SF_${Math.abs(hash).toString(16)}`;
    }
  }

  const screenAnalyzerInstance = new ScreenUnderstandingModel();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ScreenUnderstandingModel,
      screenAnalyzer: screenAnalyzerInstance
    };
  } else if (typeof window !== 'undefined') {
    window.ScreenUnderstandingModel = ScreenUnderstandingModel;
    window.screenAnalyzer = screenAnalyzerInstance;
  }
})();
