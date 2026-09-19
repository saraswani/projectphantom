/**
 * PrivacyShield - Client-Side AI Action Executor
 * Executes UI actions (click, fill, scroll) on the real, live DOM with glowing visual feedback.
 * Safely substitutes form field values from the local mock user profile (zero server roundtrip of real PII).
 */
(function() {
  'use strict';

  const config = (typeof window !== 'undefined' && window.PrivacyShieldConfig) || (typeof require !== 'undefined' ? require('../../config') : null);

  class ActionExecutor {
    constructor() {
      this.isExecuting = false;
      this.actionHistory = [];
      this.filledInputs = [];
      this.activeProfile = null;
      this.initProfile();
    }

    /**
     * Initializes active profile from chrome.storage.local if available
     */
    async initProfile() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const data = await chrome.storage.local.get(['mockProfile']);
          if (data && data.mockProfile) {
            this.activeProfile = data.mockProfile;
          }
        } catch (e) {
          // fallback to config
        }
      }
    }

    /**
     * Updates active mock profile manually
     */
    setProfile(profile) {
      if (profile && typeof profile === 'object') {
        this.activeProfile = profile;
      }
    }

    /**
     * Refreshes active mock profile from chrome.storage.local
     */
    async refreshProfile() {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const data = await chrome.storage.local.get(['mockProfile']);
          if (data && data.mockProfile) {
            this.activeProfile = data.mockProfile;
            return this.activeProfile;
          }
        } catch (e) {
          console.warn('[PrivacyShield] Could not load profile from storage:', e);
        }
      }
      return this.activeProfile;
    }

    /**
     * Highlights an element with an animated glowing neon aura before performing an action.
     */
    async highlightElement(el, durationMs = 700) {
      if (!el || !el.getBoundingClientRect) return;

      const rect = el.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.className = 'ps-action-highlight-overlay';
      highlight.style.cssText = `
        position: fixed;
        left: ${rect.left - 4}px;
        top: ${rect.top - 4}px;
        width: ${rect.width + 8}px;
        height: ${rect.height + 8}px;
        border: 2px solid #00f2fe;
        border-radius: 6px;
        background: rgba(0, 242, 254, 0.2);
        box-shadow: 0 0 20px #00f2fe, inset 0 0 10px #00f2fe;
        pointer-events: none;
        z-index: 2147483640;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        animation: ps-pulse-aura 0.7s infinite alternate;
      `;

      document.body.appendChild(highlight);

      return new Promise((resolve) => {
        setTimeout(() => {
          if (highlight.parentNode) {
            highlight.parentNode.removeChild(highlight);
          }
          resolve();
        }, durationMs);
      });
    }

    /**
     * Resolves appropriate local mock value for a given field category without touching server.
     */
    resolveLocalProfileValue(fieldType, fallbackValue) {
      const baseConfigProfile = (typeof window !== 'undefined' && window.PrivacyShieldConfig?.MOCK_PROFILE) || config?.MOCK_PROFILE;
      const profile = this.activeProfile || baseConfigProfile || {};

      if (!fieldType) return fallbackValue || null;

      const key = fieldType.toLowerCase().replace(/[^a-z0-9_]/g, '');
      let resolvedValue = undefined;

      if (key.includes('email')) {
        resolvedValue = profile.email;
      } else if (key === 'fname' || key === 'firstname' || key === 'first_name' || key.includes('first')) {
        resolvedValue = profile.first_name || (profile.name ? profile.name.split(/\s+/)[0] : undefined);
      } else if (key === 'lname' || key === 'lastname' || key === 'last_name' || key.includes('last') || key.includes('surname')) {
        resolvedValue = profile.last_name || (profile.name ? profile.name.split(/\s+/).slice(1).join(' ') : undefined);
      } else if (key.includes('fullname') || key === 'name' || key === 'applicant_name' || key === 'candidate_name') {
        resolvedValue = profile.name;
      } else if (key.includes('phone') || key.includes('mobile') || key.includes('contact') || key.includes('tel') || key.includes('cell')) {
        resolvedValue = profile.phone;
      } else if (key.includes('aadhaar') || key.includes('uid') || key.includes('aadhar')) {
        resolvedValue = profile.aadhaar;
      } else if (key === 'pan' || key === 'pancard' || key === 'pan_no' || key === 'pan_number' || (key.includes('pan') && !key.includes('company') && !key.includes('span') && !key.includes('japan'))) {
        resolvedValue = profile.pan;
      } else if (key.includes('passport')) {
        resolvedValue = profile.passport || 'Z1234567';
      } else if (key.includes('address2') || key.includes('landmark') || key.includes('address_line2')) {
        resolvedValue = profile.address_line2 || '';
      } else if (key.includes('addr') || key.includes('street') || key.includes('residence') || key.includes('flat')) {
        resolvedValue = profile.address;
      } else if (key.includes('city') || key.includes('town') || key.includes('district')) {
        resolvedValue = profile.city;
      } else if (key.includes('state') || key.includes('province') || key.includes('region')) {
        resolvedValue = profile.state;
      } else if (key.includes('pin') || key.includes('zip') || key.includes('postal')) {
        resolvedValue = profile.pincode;
      } else if (key.includes('country') || key.includes('nation')) {
        resolvedValue = profile.country;
      } else if (key.includes('gender') || key.includes('sex')) {
        resolvedValue = profile.gender;
      } else if (key.includes('day') && key.includes('birth')) {
        resolvedValue = profile.dob_day || '15';
      } else if (key.includes('month') && key.includes('birth')) {
        resolvedValue = profile.dob_month || '05';
      } else if (key.includes('year') && key.includes('birth')) {
        resolvedValue = profile.dob_year || '1998';
      } else if (key.includes('dob') || key.includes('birth')) {
        resolvedValue = profile.dob;
      } else if (key.includes('company') || key.includes('org') || key.includes('employer') || key.includes('institute') || key.includes('firm')) {
        resolvedValue = profile.company;
      } else if (key.includes('occupation') || key.includes('job') || key.includes('designation') || key.includes('profession') || key.includes('role')) {
        resolvedValue = profile.occupation;
      } else if (key.includes('qualification') || key.includes('degree') || key.includes('education')) {
        resolvedValue = profile.qualification;
      } else if (key.includes('website') || key.includes('portfolio') || key.includes('url')) {
        resolvedValue = profile.website;
      } else if (key.includes('linkedin')) {
        resolvedValue = profile.linkedin;
      } else if (key.includes('github')) {
        resolvedValue = profile.github;
      } else if (key.includes('age')) {
        resolvedValue = profile.age;
      } else {
        resolvedValue = profile[key];
      }

      if (resolvedValue !== undefined && resolvedValue !== null && resolvedValue !== '') {
        return resolvedValue;
      }

      return fallbackValue || null;
    }

    /**
     * Dispatches proper reactive input events so modern frameworks (React, Vue, Svelte, Angular) catch updates.
     */
    setNativeInputValue(el, value) {
      if (!el) return;

      // Handle Select element
      if (el.tagName && el.tagName.toLowerCase() === 'select') {
        let matchedOption = false;
        const targetVal = String(value).trim().toLowerCase();
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const optText = (opt.text || '').trim().toLowerCase();
          const optVal = (opt.value || '').trim().toLowerCase();
          if (optText === targetVal || optVal === targetVal || optText.includes(targetVal) || (targetVal.length > 2 && optVal.includes(targetVal))) {
            el.selectedIndex = i;
            matchedOption = true;
            break;
          }
        }
        if (matchedOption) {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      // Handle Checkbox
      if (el.type === 'checkbox') {
        const checked = (value === true || value === 'true' || value === '1' || value === 'yes' || value === 'on');
        if (el.checked !== checked) {
          el.checked = checked;
          el.dispatchEvent(new Event('click', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      // Handle Radio buttons
      if (el.type === 'radio') {
        const valStr = String(value).trim().toLowerCase();
        const elVal = (el.value || '').trim().toLowerCase();
        const elId = (el.id || '').trim().toLowerCase();
        const elLabel = (el.closest('label')?.textContent || el.parentElement?.textContent || '').trim().toLowerCase();

        const isMatch = (elVal && (elVal === valStr || elVal.includes(valStr) || valStr.includes(elVal))) ||
                        (elLabel && elLabel.includes(valStr)) ||
                        (elId && elId.includes(valStr)) ||
                        (valStr === 'true' || valStr === '1');
        if (isMatch) {
          el.checked = true;
          el.dispatchEvent(new Event('click', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      // Handle standard text / date / number / textarea inputs
      el.focus();
      const lastValue = el.value;
      this.filledInputs.push({ el, lastValue });

      // Call React / DOM Prototype value setter
      const prototype = Object.getPrototypeOf(el);
      const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (prototypeValueSetter) {
        prototypeValueSetter.call(el, value);
      } else {
        el.value = value;
      }

      // Call React _valueTracker if present
      const tracker = el._valueTracker;
      if (tracker) {
        tracker.setValue(lastValue);
      }

      try {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(value) }));
      } catch (e) {}

      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(value) }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }

    /**
     * Restores all inputs modified by the executor to their original values.
     */
    restoreFilledInputs() {
      for (const item of this.filledInputs) {
        if (item.el) {
          item.el.focus();
          const prototype = Object.getPrototypeOf(item.el);
          const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (prototypeValueSetter) {
            prototypeValueSetter.call(item.el, item.lastValue);
          } else {
            item.el.value = item.lastValue;
          }

          const tracker = item.el._valueTracker;
          if (tracker) {
            tracker.setValue(item.lastValue);
          }

          item.el.dispatchEvent(new Event('input', { bubbles: true }));
          item.el.dispatchEvent(new Event('change', { bubbles: true }));
          item.el.blur();
        }
      }
      this.filledInputs = [];
    }

    /**
     * Executes a single UI action.
     */
    async executeSingleAction(action) {
      const type = (action.type || action.action || '').toLowerCase();
      let selector = action.selector || (action.target && typeof action.target === 'object' ? action.target.value : action.target) || '';
      const targetText = action.targetText || (action.target && action.target.type === 'text' ? action.target.value : null);
      const { fieldType, value, scrollY } = action;
      let targetEl = null;

      if (selector) {
        try {
          targetEl = document.querySelector(selector);
        } catch (e) {
          // Selector syntax failed, attempt sanitized ID extraction
          const idMatch = selector.match(/#([a-zA-Z0-9_\-]+)/);
          if (idMatch && idMatch[1]) {
            targetEl = document.getElementById(idMatch[1]);
          }
        }
      }

      // 1. FILL & TYPE Actions (Autofill form inputs)
      if (type === 'fill' || type === 'type') {
        const classifier = (typeof FormFieldClassifier !== 'undefined' ? FormFieldClassifier : (typeof formClassifier !== 'undefined' ? formClassifier : null));

        if (!targetEl && fieldType) {
          // Multi-tier smart element discovery:
          // Tier A: Check unfilled inputs using semantic classifier
          const allInputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(inp => {
            const t = (inp.type || '').toLowerCase();
            return !['submit', 'button', 'reset', 'image', 'hidden', 'password'].includes(t) && !inp.disabled;
          });

          // Prefer unfilled inputs first
          const unfilledInputs = allInputs.filter(inp => !this.filledInputs.some(f => f.el === inp));
          const candidates = unfilledInputs.length > 0 ? unfilledInputs : allInputs;

          if (classifier) {
            targetEl = candidates.find(inp => classifier.classify(inp) === fieldType);
          }

          // Tier B: Attribute keyword queries
          if (!targetEl) {
            const kw = fieldType.replace(/_/g, '');
            for (const inp of candidates) {
              const str = `${inp.name} ${inp.id} ${inp.getAttribute('placeholder') || ''} ${inp.getAttribute('autocomplete') || ''}`.toLowerCase();
              if (str.includes(kw) || (fieldType === 'first_name' && str.includes('fname')) || (fieldType === 'last_name' && str.includes('lname'))) {
                targetEl = inp;
                break;
              }
            }
          }

          // Tier C: Associated label queries
          if (!targetEl) {
            const labels = Array.from(document.querySelectorAll('label'));
            for (const lbl of labels) {
              const txt = lbl.textContent.toLowerCase();
              if (txt.includes(fieldType.replace(/_/g, ' '))) {
                const forId = lbl.getAttribute('for');
                if (forId) {
                  const el = document.getElementById(forId);
                  if (el) { targetEl = el; break; }
                }
                const nested = lbl.querySelector('input, select, textarea');
                if (nested) { targetEl = nested; break; }
              }
            }
          }
        }

        if (targetEl) {
          const safeValue = this.resolveLocalProfileValue(fieldType, value);
          
          if (safeValue === null || safeValue === undefined || safeValue === '') {
            return { success: true, action: 'fill_skipped', selector, fieldType, reason: 'Field skipped as it is not present in local profile' };
          }

          await this.highlightElement(targetEl, 500);
          this.setNativeInputValue(targetEl, safeValue);
          return { success: true, action: 'fill', selector, fieldType, valueApplied: '••••••••' };
        } else {
          return { success: false, error: `Target element not found for selector: ${selector || fieldType}` };
        }
      }

      // 2. CLICK Action
      if (type === 'click') {
        if (!targetEl && targetText) {
          const clickables = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
          targetEl = clickables.find(c => {
            const txt = (c.innerText || c.value || c.getAttribute('aria-label') || '').trim().toLowerCase();
            return txt === targetText.toLowerCase() || txt.includes(targetText.toLowerCase());
          });
        }

        if (targetEl) {
          // STRICT SAFETY CHECK: Never auto-submit forms!
          const tag = (targetEl.tagName || '').toLowerCase();
          const btnType = (targetEl.getAttribute('type') || '').toLowerCase();
          const btnId = (targetEl.id || '').toLowerCase();
          const btnClass = (targetEl.className || '').toLowerCase();
          const btnText = (targetEl.innerText || targetEl.value || '').toLowerCase();
          const isSubmit = btnType === 'submit' || 
                           btnId.includes('submit') || 
                           btnClass.includes('submit') || 
                           btnText.includes('submit');

          if (isSubmit) {
            console.warn('[PrivacyShield Policy] Form submission skipped. Handing over to user for manual review and submission.');
            await this.highlightElement(targetEl, 800);
            return { success: true, action: 'click_blocked', selector, reason: 'Form submission skipped by safety policy. Please submit manually.' };
          }

          await this.highlightElement(targetEl, 600);
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
          targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          targetEl.click();
          targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          return { success: true, action: 'click', selector };
        } else {
          return { success: false, error: `Click target element not found: ${selector || targetText}` };
        }
      }

      // 3. SCROLL Action
      if (type === 'scroll') {
        const top = (scrollY !== undefined) ? scrollY : (targetEl ? targetEl.getBoundingClientRect().top + window.scrollY - 100 : 300);
        window.scrollTo({ top: top, behavior: 'smooth' });
        return { success: true, action: 'scroll', top };
      }

      // 5. FOCUS Action
      if (type === 'focus') {
        if (targetEl) {
          await this.highlightElement(targetEl, 300);
          targetEl.focus();
          return { success: true, action: 'focus', selector };
        }
        return { success: false, error: `Focus target not found: ${selector}` };
      }

      // 6. SELECT Action
      if (type === 'select') {
        if (targetEl && targetEl.tagName && targetEl.tagName.toLowerCase() === 'select') {
          await this.highlightElement(targetEl, 400);
          this.setNativeInputValue(targetEl, value || '');
          return { success: true, action: 'select', selector, value };
        }
        return { success: false, error: `Select dropdown element not found: ${selector}` };
      }

      // 7. NAVIGATE Action
      if (type === 'navigate') {
        const targetUrl = action.url || selector;
        if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#') || targetUrl.startsWith('/'))) {
          window.location.href = targetUrl;
          return { success: true, action: 'navigate', url: targetUrl };
        }
        return { success: false, error: `Invalid or unsafe navigation target: ${targetUrl}` };
      }

      // 8. WAIT Action
      if (type === 'wait') {
        const ms = Math.min(action.durationMs || 500, 5000);
        await new Promise(r => setTimeout(r, ms));
        return { success: true, action: 'wait', durationMs: ms };
      }

      return { success: false, error: `Unknown action type: ${type}` };
    }

    /**
     * Executes an array of actions sequentially.
     * @param {Array} actions 
     * @returns {Promise<Array>} Results
     */
    async executeActions(actions) {
      if (!Array.isArray(actions) || actions.length === 0) return [];
      this.isExecuting = true;
      // Refresh latest profile from chrome.storage before executing
      await this.refreshProfile();
      const results = [];

      for (const action of actions) {
        try {
          const result = await this.executeSingleAction(action);
          results.push(result);
          this.actionHistory.push({ timestamp: Date.now(), action, result });
          // Brief pause between actions for natural feel
          await new Promise(r => setTimeout(r, 250));
        } catch (err) {
          results.push({ success: false, error: err.message });
        }
      }

      this.isExecuting = false;
      return results;
    }
  }

  const actionExecutorInstance = new ActionExecutor();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ActionExecutor,
      actionExecutor: actionExecutorInstance
    };
  } else {
    const root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
    root.ActionExecutor = ActionExecutor;
    root.actionExecutor = actionExecutorInstance;
  }
})();
