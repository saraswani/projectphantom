/**
 * Phantom AI — Structured Action Protocol & Local Action Validator
 * 
 * Complies with SIH Requirement:
 * - Standardizes server responses into a strict structured action protocol:
 *   { "action": "click", "target": { "type": "text", "value": "Submit" }, "confidence": 0.94 }
 * - Supports action allowlist: click, scroll, type, fill, focus, select, navigate, wait.
 * - Validates every action locally on-device before execution.
 * - Rejects arbitrary JavaScript strings or script injection attempts.
 * - Enforces safety bounds (e.g. prohibits autonomous form submission).
 */

(function() {
  'use strict';

  const ALLOWED_ACTIONS = new Set([
    'click',
    'scroll',
    'type',
    'fill',
    'focus',
    'select',
    'navigate',
    'wait'
  ]);

  const DANGEROUS_PATTERNS = [
    /javascript:/i,
    /<script\b/i,
    /\beval\s*\(/i,
    /\bFunction\s*\(/i,
    /\bsetTimeout\s*\(/i,
    /\bsetInterval\s*\(/i,
    /\bdocument\.cookie\b/i,
    /\blocalStorage\b/i,
    /\bsessionStorage\b/i,
    /__proto__/i,
    /constructor/i
  ];

  class ActionValidator {
    constructor() {
      this.allowedActions = ALLOWED_ACTIONS;
      this.minConfidence = 0.50;
    }

    /**
     * Checks if a string contains prohibited injection patterns.
     */
    isUnsafeString(str) {
      if (typeof str !== 'string') return false;
      return DANGEROUS_PATTERNS.some(pattern => pattern.test(str));
    }

    /**
     * Validates a single action object and returns normalized action or error.
     */
    validateSingleAction(rawAction) {
      if (!rawAction || typeof rawAction !== 'object') {
        return { valid: false, error: 'Action must be a valid JSON object' };
      }

      // Action type can be provided as "action" or "type"
      const actionName = (rawAction.action || rawAction.type || '').toLowerCase().trim();

      if (!this.allowedActions.has(actionName)) {
        return { valid: false, error: `Action '${actionName}' is not in the allowlist [${Array.from(this.allowedActions).join(', ')}]` };
      }

      // Check for code injection in all string properties
      for (const [k, v] of Object.entries(rawAction)) {
        if (typeof v === 'string' && this.isUnsafeString(v)) {
          return { valid: false, error: `Security violation: Prohibited pattern detected in property '${k}'` };
        }
      }

      // Normalize target
      let selector = rawAction.selector || '';
      if (!selector && rawAction.target) {
        if (typeof rawAction.target === 'string') {
          selector = rawAction.target;
        } else if (rawAction.target.value) {
          if (rawAction.target.type === 'selector' || rawAction.target.type === 'css') {
            selector = rawAction.target.value;
          } else if (rawAction.target.type === 'text') {
            selector = `button:has-text("${rawAction.target.value}"), a:has-text("${rawAction.target.value}"), [value="${rawAction.target.value}"]`;
          } else {
            selector = rawAction.target.value;
          }
        }
      }

      if (this.isUnsafeString(selector)) {
        return { valid: false, error: 'Security violation: Unsafe selector string' };
      }

      const confidence = typeof rawAction.confidence === 'number' ? rawAction.confidence : 0.90;
      if (confidence < this.minConfidence) {
        return { valid: false, error: `Action confidence ${confidence} is below safety threshold ${this.minConfidence}` };
      }

      // Safety check: Filter out autonomous submit clicks
      if (actionName === 'click' && selector.toLowerCase().includes('submit')) {
        return {
          valid: true,
          blockedByPolicy: true,
          reason: 'Autonomous form submission is disabled by PrivacyShield safety policy',
          normalizedAction: {
            action: 'click',
            type: 'click',
            selector,
            confidence,
            blocked: true
          }
        };
      }

      const normalized = {
        action: actionName === 'fill' ? 'type' : actionName,
        type: actionName,
        selector,
        fieldType: rawAction.fieldType || null,
        value: rawAction.value || '',
        scrollY: typeof rawAction.scrollY === 'number' ? rawAction.scrollY : undefined,
        durationMs: typeof rawAction.durationMs === 'number' ? rawAction.durationMs : 500,
        url: rawAction.url || null,
        confidence
      };

      return {
        valid: true,
        blockedByPolicy: false,
        normalizedAction: normalized
      };
    }

    /**
     * Validates a full server response payload containing actions or informational text.
     */
    validateServerResponse(response) {
      if (!response || typeof response !== 'object') {
        return { valid: false, errors: ['Response must be a non-null object'], actions: [] };
      }

      // Handle direct array or { type: 'action', actions: [...] } or { actions: [...] }
      const rawActions = Array.isArray(response) ? response : (response.actions || (response.data && response.data.actions) || []);
      
      if (!Array.isArray(rawActions) || rawActions.length === 0) {
        // May be a conversational text response
        const text = response.text || response.response || (response.data && response.data.text) || '';
        return {
          valid: true,
          isTextResponse: true,
          text: text,
          actions: []
        };
      }

      const validatedActions = [];
      const errors = [];

      for (let i = 0; i < rawActions.length; i++) {
        const item = rawActions[i];
        const res = this.validateSingleAction(item);
        if (res.valid) {
          if (!res.blockedByPolicy) {
            validatedActions.push(res.normalizedAction);
          } else {
            console.warn(`[ActionValidator] Action ${i + 1} blocked by policy: ${res.reason}`);
          }
        } else {
          errors.push(`Action ${i + 1}: ${res.error}`);
        }
      }

      return {
        valid: errors.length === 0,
        isTextResponse: false,
        errors,
        actions: validatedActions,
        totalProvided: rawActions.length,
        totalValidated: validatedActions.length
      };
    }
  }

  const actionValidatorInstance = new ActionValidator();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      ActionValidator,
      actionValidator: actionValidatorInstance
    };
  } else {
    const root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
    root.ActionValidator = ActionValidator;
    root.actionValidator = actionValidatorInstance;
  }
})();
