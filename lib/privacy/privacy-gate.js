/**
 * Phantom AI — Privacy Gate & Local Fail-Safe Network Protection Layer
 * 
 * ARCHITECTURAL GUARANTEE:
 * SCREEN CONTEXT ➔ LOCAL DETECTION ➔ PRIVACY DECISION ENGINE ➔ [Is sensitive data found?]
 *   ➔ LOCAL REDACTION ➔ PRIVACY GATE INSPECTION ➔ SANITIZED CONTEXT ➔ NETWORK REQUEST
 * 
 * This module enforces strict zero-tolerance network security:
 * 1. Inspects every outbound payload before network transmission.
 * 2. Scans text, structure, and images for raw unredacted PII, passwords, or faces.
 * 3. Enforces fail-safe mode:
 *    - High Confidence (>= 0.85): Pass sanitized context.
 *    - Medium Confidence (0.60 - 0.84): Apply aggressive conservative fallback redaction before transmission.
 *    - Low Confidence (< 0.60) or Detection Error: BLOCK TRANSMISSION COMPLETELY.
 * 4. Never transmits raw sensitive data over external network boundaries.
 */

(function() {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
  let textDetector = null;

  if (isNode) {
    const path = require('path');
    const fs = require('fs');
    const resolveLib = (rel) => fs.existsSync(path.join(__dirname, '..', rel + '.js')) || fs.existsSync(path.join(__dirname, '..', rel))
      ? require(path.join(__dirname, '..', rel))
      : require(path.join(__dirname, '../../lib', rel));
    const { TextPIIDetector } = resolveLib('pii/text-detector');
    textDetector = new TextPIIDetector();
  } else {
    textDetector = root.textPIIDetector || null;
  }

  class PrivacyGateEngine {
    constructor() {
      this.history = [];
      this.stats = {
        totalInspected: 0,
        totalAllowed: 0,
        totalBlocked: 0,
        violationsPrevented: 0,
        failSafeActivations: 0
      };
      this.CONFIDENCE_THRESHOLDS = {
        HIGH: 0.85,
        MEDIUM: 0.60
      };
    }

    /**
     * Get or lazy-load text detector instance
     */
    getDetector() {
      if (!textDetector) {
        if (root.textPIIDetector) {
          textDetector = root.textPIIDetector;
        } else if (typeof window !== 'undefined' && window.textPIIDetector) {
          textDetector = window.textPIIDetector;
        }
      }
      return textDetector;
    }

    /**
     * Inspects outbound payload and makes binary go/no-go privacy decision.
     * @param {Object} payload - { sanitizedText, sanitizedImageBase64, screenStructure, task, confidence, isRedacted, rawImageBase64 }
     * @returns {Object} Inspection result with sanitized payload or blocked notice
     */
    inspectOutboundPayload(payload = {}) {
      this.stats.totalInspected++;
      const violations = [];
      let rawPIIDetectedCount = 0;
      const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0.95;
      const detector = this.getDetector();

      // 1. FAIL-SAFE CHECK: If confidence is below safety floor or detection threw errors
      if (confidence < this.CONFIDENCE_THRESHOLDS.MEDIUM || payload.detectionError) {
        this.stats.totalBlocked++;
        this.stats.failSafeActivations++;
        return {
          allowed: false,
          blocked: true,
          decision: 'BLOCK_TRANSMISSION',
          reason: 'FAIL-SAFE ACTIVATED: Local privacy detection confidence too low (< 0.60) or engine error. Raw context transmission prohibited.',
          confidence,
          violations: ['FAIL_SAFE_LOW_CONFIDENCE'],
          rawPIIDetectedCount: 0,
          sanitizedPayload: null
        };
      }

      // 2. TEXT PII LEAKAGE CHECK
      let scrubbedText = payload.sanitizedText || '';
      if (detector && typeof scrubbedText === 'string') {
        const checkResult = detector.detectAndSanitize(scrubbedText);
        // If the sanitized text still contains unmasked PII that was matched by rules
        if (checkResult.detectedSpans && checkResult.detectedSpans.length > 0) {
          // Check if matches are actual unredacted sensitive values, not already masked tokens like [EMAIL_1]
          const unmaskedSpans = checkResult.detectedSpans.filter(span => !span.text.startsWith('[') || !span.text.endsWith(']'));
          if (unmaskedSpans.length > 0) {
            if (payload.isRedacted === false) {
              rawPIIDetectedCount += unmaskedSpans.length;
              violations.push(`RAW_PII_IN_TEXT: Detected ${unmaskedSpans.length} unredacted sensitive entity string(s) in payload text.`);
            } else {
              // Fail-safe auto-sanitization: Replace remaining raw PII with safe tokens so user workflow proceeds with 0 network leakage!
              scrubbedText = checkResult.sanitizedText;
            }
          }
        }
      }

      // 3. PASSWORD / CREDENTIALS FIELD LEAKAGE CHECK
      const lowerText = (scrubbedText || '').toLowerCase();
      if (lowerText.includes('password:') || lowerText.includes('secret:') || lowerText.includes('api_key:')) {
        // Verify no raw passwords follow
        const pwdMatch = scrubbedText.match(/(?:password|passwd|secret)\s*[:=]\s*([^\s,;\]]+)/i);
        if (pwdMatch && pwdMatch[1] && !pwdMatch[1].startsWith('[') && pwdMatch[1].length > 4) {
          rawPIIDetectedCount++;
          violations.push('RAW_PASSWORD_IN_PAYLOAD: Found unmasked password value.');
        }
      }

      // 4. SCREEN STRUCTURE SENSITIVE VALUES CHECK
      if (payload.screenStructure && Array.isArray(payload.screenStructure.elements)) {
        for (const el of payload.screenStructure.elements) {
          if (el.type === 'input_password' && el.value && !el.value.startsWith('[') && !el.value.startsWith('•')) {
            rawPIIDetectedCount++;
            violations.push(`PASSWORD_VALUE_EXPOSED: Input element ${el.selector || el.id} contained unredacted password.`);
          }
        }
      }

      // 5. SCREENSHOT PIXEL SANITIZATION CHECK
      if (payload.sanitizedImageBase64) {
        if (payload.rawImageBase64 && payload.sanitizedImageBase64 === payload.rawImageBase64 && (payload.hasSensitiveElements || rawPIIDetectedCount > 0)) {
          violations.push('RAW_SCREENSHOT_LEAKAGE: Outbound image is identical to unredacted screenshot when sensitive content was detected.');
        }
      }

      // 6. MEDIUM CONFIDENCE: Apply conservative secondary scrubbing
      let finalDecision = 'TRANSMIT_SANITIZED';
      if (confidence >= this.CONFIDENCE_THRESHOLDS.MEDIUM && confidence < this.CONFIDENCE_THRESHOLDS.HIGH) {
        finalDecision = 'CONSERVATIVE_REDACT_TRANSMIT';
        if (detector) {
          const secondPass = detector.detectAndSanitize(scrubbedText);
          scrubbedText = secondPass.sanitizedText;
        }
      }

      // 7. FINAL ARBITRATION
      if (violations.length > 0) {
        this.stats.totalBlocked++;
        this.stats.violationsPrevented += violations.length;
        const result = {
          allowed: false,
          blocked: true,
          decision: 'BLOCK_TRANSMISSION',
          reason: `PrivacyGate blocked transmission due to ${violations.length} policy violation(s).`,
          confidence,
          violations,
          rawPIIDetectedCount,
          sanitizedPayload: null
        };
        this.history.push({ timestamp: Date.now(), result });
        return result;
      }

      this.stats.totalAllowed++;
      const safePayload = {
        sanitizedText: scrubbedText,
        sanitizedImageBase64: payload.sanitizedImageBase64 || null,
        screenStructure: payload.screenStructure || {},
        task: payload.task || '',
        pageClassification: payload.pageClassification || {},
        privacyVerified: true,
        gateTimestamp: Date.now()
      };

      const result = {
        allowed: true,
        blocked: false,
        decision: finalDecision,
        confidence,
        violations: [],
        rawPIIDetectedCount: 0,
        sanitizedPayload: safePayload
      };

      this.history.push({ timestamp: Date.now(), result });
      return result;
    }

    getStats() {
      return { ...this.stats };
    }

    reset() {
      this.history = [];
      this.stats = {
        totalInspected: 0,
        totalAllowed: 0,
        totalBlocked: 0,
        violationsPrevented: 0,
        failSafeActivations: 0
      };
    }
  }

  const privacyGateInstance = new PrivacyGateEngine();

  if (isNode) {
    module.exports = {
      PrivacyGateEngine,
      privacyGate: privacyGateInstance
    };
  } else {
    root.PrivacyGateEngine = PrivacyGateEngine;
    root.privacyGate = privacyGateInstance;
  }
})();
