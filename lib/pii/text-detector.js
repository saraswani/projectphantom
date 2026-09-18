/**
 * PrivacyShield - In-Memory Text PII Detection & Span Deduplication Engine
 * Identifies sensitive entities, deduplicates overlapping spans, and assigns reversible tokens.
 */
(function() {
  'use strict';

  const PIIRulesEngine = (typeof window !== 'undefined' && window.PIIRulesEngine) || (typeof require !== 'undefined' ? require('./regex-rules') : null);

  class TextPIIDetector {
    constructor() {
      this.tokenStore = new Map(); // token -> { originalText, ruleId, category, id }
      this.reverseStore = new Map(); // originalText -> token
      this.categoryCounters = {};
    }

    /**
     * Resets the in-memory token mapping store.
     */
    reset() {
      this.tokenStore.clear();
      this.reverseStore.clear();
      this.categoryCounters = {};
    }

    /**
     * Generates or retrieves a unique deterministic token for a sensitive value.
     */
    getOrCreateToken(originalText, prefix) {
      if (this.reverseStore.has(originalText)) {
        return this.reverseStore.get(originalText);
      }

      const cleanPrefix = prefix || 'PII';
      this.categoryCounters[cleanPrefix] = (this.categoryCounters[cleanPrefix] || 0) + 1;
      const token = `[${cleanPrefix}_${this.categoryCounters[cleanPrefix]}]`;

      this.tokenStore.set(token, {
        token: token,
        originalText: originalText,
        prefix: cleanPrefix,
        timestamp: Date.now()
      });
      this.reverseStore.set(originalText, token);

      return token;
    }

    /**
     * Scans a text string and returns all valid, non-overlapping PII spans.
     * @param {string} text - The input raw text.
     * @param {Array} [extraEntities] - Optional external NER entities [{text, label, start, end}].
     * @returns {Object} - { sanitizedText, detectedSpans, piiCountByCategory, totalRedacted }
     */
    detectAndSanitize(text, extraEntities = []) {
      if (!text || typeof text !== 'string') {
        return { sanitizedText: '', detectedSpans: [], piiCountByCategory: {}, totalRedacted: 0 };
      }

      const candidates = [];
      const rules = PIIRulesEngine?.rules || [];

      // 1. Run Regex & Checksum Rules
      for (const rule of rules) {
        const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
          let matchText = match[0];
          let start = match.index;
          let end = start + matchText.length;

          // If rule explicitly requests capture extraction to isolate sensitive value from a label/prefix
          if (rule.extractCapture) {
            let captured = null;
            for (let i = 1; i < match.length; i++) {
              if (match[i] !== undefined && match[i] !== '') {
                captured = match[i];
                break;
              }
            }
            if (captured) {
              const offset = match[0].indexOf(captured);
              matchText = captured;
              start = match.index + offset;
              end = start + matchText.length;
            }
          }

          // Run custom validator (e.g. Verhoeff, Luhn, Passport)
          if (rule.validate && !rule.validate(matchText, match[0])) {
            continue;
          }

          candidates.push({
            start,
            end,
            length: end - start,
            text: matchText,
            ruleId: rule.id,
            category: rule.name,
            prefix: rule.tokenPrefix,
            priority: rule.priority || 50
          });
        }
      }

      // 2. Incorporate NER Entities (e.g. PERSON, LOCATION, ORGANIZATION, PASSPORT_NO)
      if (Array.isArray(extraEntities)) {
        for (const ent of extraEntities) {
          if (!ent.text || ent.start === undefined || ent.end === undefined) continue;
          let prefix = 'PERSON';
          let priority = 60;
          if (ent.label === 'LOC' || ent.label === 'LOCATION') {
            prefix = 'LOC';
            priority = 55;
          } else if (ent.label === 'ORG' || ent.label === 'ORGANIZATION') {
            prefix = 'ORG';
            priority = 55;
          } else if (ent.label === 'PASSPORT_NO' || ent.label === 'PASSPORT') {
            prefix = 'PASSPORT_NO';
            priority = 88;
          }

          candidates.push({
            start: ent.start,
            end: ent.end,
            length: ent.end - ent.start,
            text: ent.text,
            ruleId: `NER_${ent.label || 'ENTITY'}`,
            category: ent.label || 'Named Entity',
            prefix: prefix,
            priority: priority
          });
        }
      }

      // 3. Deduplicate Overlapping Spans by Priority and Length
      // Sort: Highest priority first, then longest span, then earlier start
      candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (b.length !== a.length) return b.length - a.length;
        return a.start - b.start;
      });

      const acceptedSpans = [];
      const isOverlapping = (spanA, spanB) => {
        return Math.max(spanA.start, spanB.start) < Math.min(spanA.end, spanB.end);
      };

      for (const cand of candidates) {
        // Never re-redact existing tokens (e.g. [EMAIL_1], [PERSON_1], [AADHAAR_1])
        const trimmedCand = (cand.text || '').trim();
        if (/^\[[A-Z0-9_]+\]$/.test(trimmedCand)) {
          continue;
        }

        let hasConflict = false;
        for (const accepted of acceptedSpans) {
          if (isOverlapping(cand, accepted)) {
            hasConflict = true;
            break;
          }
        }
        if (!hasConflict) {
          acceptedSpans.push(cand);
        }
      }

      // Sort accepted spans strictly by character start index
      acceptedSpans.sort((a, b) => a.start - b.start);

      // 4. Construct Sanitized Text with Reversible Tokens
      let sanitizedText = '';
      let lastIndex = 0;
      const piiCountByCategory = {};

      for (const span of acceptedSpans) {
        // Append text before this span
        sanitizedText += text.substring(lastIndex, span.start);

        // Get or create deterministic token
        const token = this.getOrCreateToken(span.text, span.prefix);
        span.token = token;
        sanitizedText += token;

        lastIndex = span.end;

        // Tally category count
        piiCountByCategory[span.prefix] = (piiCountByCategory[span.prefix] || 0) + 1;
      }

      // Append trailing text
      sanitizedText += text.substring(lastIndex);

      return {
        originalText: text,
        sanitizedText: sanitizedText,
        detectedSpans: acceptedSpans,
        piiCountByCategory: piiCountByCategory,
        totalRedacted: acceptedSpans.length
      };
    }

    /**
     * Restores a sanitized string back to original using current in-memory tokens.
     */
    restoreText(sanitizedText) {
      if (!sanitizedText) return '';
      let restored = sanitizedText;
      for (const [token, info] of this.tokenStore.entries()) {
        restored = restored.split(token).join(info.originalText);
      }
      return restored;
    }

    /**
     * Gets all token mappings for export or inspection.
     */
    getAllTokens() {
      const result = {};
      for (const [token, info] of this.tokenStore.entries()) {
        result[token] = info.originalText;
      }
      return result;
    }
  }

  const textPIIDetectorInstance = new TextPIIDetector();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TextPIIDetector,
      detector: textPIIDetectorInstance
    };
  } else if (typeof window !== 'undefined') {
    window.TextPIIDetector = TextPIIDetector;
    window.textPIIDetector = textPIIDetectorInstance;
  }
})();
