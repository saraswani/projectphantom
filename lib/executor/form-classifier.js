/**
 * PrivacyShield - Universal Semantic Form Field Classifier
 * 
 * Provides deterministic, multi-signal inference for web form fields:
 * - Inspects HTML5 autocomplete, input type, name, id, placeholder, aria-label, and associated <label>.
 * - Maps fields into 20+ precise semantic categories.
 * - Safely ignores search inputs, passwords, files, honeypots, and captcha.
 * - Never defaults ambiguous inputs to 'name' (eliminates corrupt autofill).
 */
(function() {
  'use strict';

  // Category definitions with ordered priority patterns
  const FIELD_RULES = [
    // 1. Password / Search / File / Submit - EXPLICIT IGNORE
    {
      category: null,
      isIgnored: true,
      test: (s) => {
        if (s.type && ['password', 'search', 'file', 'hidden', 'submit', 'reset', 'button', 'image'].includes(s.type)) return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel} ${s.role}`.toLowerCase();
        return /\b(?:search|query|find|captcha|otp|passcode|token|csrf|honeypot|cvv|cvc)\b/i.test(text);
      }
    },

    // 2. Email Address
    {
      category: 'email',
      test: (s) => {
        if (s.autocomplete === 'email' || s.type === 'email') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:email|e-mail|mail_id|emailaddress|useremail)\b/i.test(text) || text.includes('email');
      }
    },

    // 3. Phone / Mobile Number
    {
      category: 'phone',
      test: (s) => {
        if (['tel', 'tel-national', 'tel-local', 'mobile'].includes(s.autocomplete) || s.type === 'tel') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:phone|mobile|telephone|cellphone|cell|contact(?:_no|num|number)?|whatsapp)\b/i.test(text) ||
               text.includes('phone') || text.includes('mobile');
      }
    },

    // 4. Aadhaar / UIDAI
    {
      category: 'aadhaar',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:aadhaar|aadhar|uidai|uid_no|uidnumber)\b/i.test(text) || text.includes('aadhaar') || text.includes('aadhar');
      }
    },

    // 5. PAN Card Number
    {
      category: 'pan',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:pan|pancard|pan_no|pan_num|pan_number)\b/i.test(text) && !text.includes('company') && !text.includes('span');
      }
    },

    // 6. Passport Number
    {
      category: 'passport',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:passport|passport_no|passport_number)\b/i.test(text);
      }
    },

    // 7. First Name / Given Name
    {
      category: 'first_name',
      test: (s) => {
        if (s.autocomplete === 'given-name') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:first[_\-\s]?name|fname|given[_\-\s]?name|forename)\b/i.test(text);
      }
    },

    // 8. Last Name / Surname
    {
      category: 'last_name',
      test: (s) => {
        if (s.autocomplete === 'family-name') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:last[_\-\s]?name|lname|surname|family[_\-\s]?name)\b/i.test(text);
      }
    },

    // 9. Full Name (when not explicitly first or last)
    {
      category: 'name',
      test: (s) => {
        if (s.autocomplete === 'name') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        if (/\b(?:first[_\-\s]?name|fname|last[_\-\s]?name|lname|company|organization|user[_\-\s]?name)\b/i.test(text)) {
          return false;
        }
        return /\b(?:full[_\-\s]?name|applicant[_\-\s]?name|candidate[_\-\s]?name|your[_\-\s]?name|customer[_\-\s]?name|person[_\-\s]?name|\bname\b)\b/i.test(text);
      }
    },

    // 10. Date of Birth / DOB
    {
      category: 'dob',
      test: (s) => {
        if (['bday', 'bday-day', 'bday-month', 'bday-year'].includes(s.autocomplete)) return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:dob|date[_\-\s]?of[_\-\s]?birth|birth[_\-\s]?date|birthday|bday)\b/i.test(text) ||
               (s.type === 'date' && (text.includes('birth') || text.includes('dob')));
      }
    },

    // 11. Gender / Sex
    {
      category: 'gender',
      test: (s) => {
        if (s.autocomplete === 'sex') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:gender|sex)\b/i.test(text);
      }
    },

    // 12. Pincode / Postal Code / ZIP
    {
      category: 'pincode',
      test: (s) => {
        if (s.autocomplete === 'postal-code') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:pincode|pin[_\-\s]?code|pin|zipcode|zip[_\-\s]?code|zip|postal[_\-\s]?code|postcode)\b/i.test(text);
      }
    },

    // 13. Address Line 2 / Landmark
    {
      category: 'address_line2',
      test: (s) => {
        if (s.autocomplete === 'address-line2') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:address[_\-\s]?2|address[_\-\s]?line[_\-\s]?2|landmark|apartment|suite|locality)\b/i.test(text);
      }
    },

    // 14. Residential Address / Street (Primary)
    {
      category: 'address',
      test: (s) => {
        if (['street-address', 'address-line1'].includes(s.autocomplete)) return true;
        const nameId = `${s.name} ${s.id}`.toLowerCase();
        if (/\b(?:address|street|residence|residential|house[_\-\s]?no|flat[_\-\s]?no|addr)\b/i.test(nameId)) return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        if (text.includes('email') || text.includes('ip address') || text.includes('web address') || text.includes('url')) return false;
        return /\b(?:address|street|residence|residential|house[_\-\s]?no|flat[_\-\s]?no|addr)\b/i.test(text);
      }
    },

    // 15. City / Town / District
    {
      category: 'city',
      test: (s) => {
        if (s.autocomplete === 'address-level2') return true;
        const nameId = `${s.name} ${s.id}`.toLowerCase();
        if (nameId.includes('address') || nameId.includes('street') || nameId.includes('flat')) return false;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        if (text.includes('street') || text.includes('flat') || text.includes('house')) return false;
        return /\b(?:city|town|district)\b/i.test(text);
      }
    },

    // 16. State / Province
    {
      category: 'state',
      test: (s) => {
        if (s.autocomplete === 'address-level1') return true;
        const nameId = `${s.name} ${s.id}`.toLowerCase();
        if (nameId.includes('address') || nameId.includes('street')) return false;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        if (text.includes('street') || text.includes('flat') || text.includes('house')) return false;
        return /\b(?:state|province|region)\b/i.test(text);
      }
    },

    // 17. Country / Nationality
    {
      category: 'country',
      test: (s) => {
        if (['country', 'country-name'].includes(s.autocomplete)) return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:country|nationality|citizenship)\b/i.test(text);
      }
    },

    // 18. Company / Organization / Employer
    {
      category: 'company',
      test: (s) => {
        if (s.autocomplete === 'organization') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:company|organization|organisation|employer|workplace|institution|institute|firm)\b/i.test(text);
      }
    },

    // 19. Occupation / Job Title / Designation
    {
      category: 'occupation',
      test: (s) => {
        if (s.autocomplete === 'organization-title') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:occupation|designation|job[_\-\s]?title|profession|role|position)\b/i.test(text);
      }
    },

    // 20. Qualification / Highest Degree
    {
      category: 'qualification',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:qualification|degree|education|highest[_\-\s]?qualification|course)\b/i.test(text);
      }
    },

    // 21. Website / Portfolio / URL
    {
      category: 'website',
      test: (s) => {
        if (s.autocomplete === 'url' || s.type === 'url') return true;
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return /\b(?:website|portfolio|web[_\-\s]?url|homepage|portfolio[_\-\s]?url)\b/i.test(text);
      }
    },

    // 22. LinkedIn Profile
    {
      category: 'linkedin',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return text.includes('linkedin');
      }
    },

    // 23. GitHub Profile
    {
      category: 'github',
      test: (s) => {
        const text = `${s.name} ${s.id} ${s.placeholder} ${s.label} ${s.ariaLabel}`.toLowerCase();
        return text.includes('github');
      }
    }
  ];

  class FormFieldClassifier {
    /**
     * Normalizes raw signals from an element or descriptor object.
     */
    static normalizeSignals(input) {
      if (!input) return { name: '', id: '', placeholder: '', label: '', ariaLabel: '', autocomplete: '', type: 'text', role: '' };

      // If it's a DOM element
      if (typeof Node !== 'undefined' && input instanceof Node && input.nodeType === Node.ELEMENT_NODE) {
        const el = input;
        const tag = (el.tagName || '').toLowerCase();
        const type = (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text')).toLowerCase();
        const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        
        let label = '';
        if (el.id) {
          const lEl = document.querySelector(`label[for="${el.id}"]`);
          if (lEl) label = lEl.textContent || '';
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.textContent || '';
        }
        if (!label) {
          const formGroup = el.closest('.form-group, .form-row, .field, .form-field, div');
          if (formGroup) {
            const grpLabel = formGroup.querySelector('label');
            if (grpLabel) label = grpLabel.textContent || '';
          }
        }

        return {
          tag,
          type,
          autocomplete,
          name,
          id,
          placeholder,
          ariaLabel,
          role,
          label: (label || '').toLowerCase().trim()
        };
      }

      // Plain object descriptor
      return {
        tag: (input.tag || '').toLowerCase(),
        type: (input.type || 'text').toLowerCase(),
        autocomplete: (input.autocomplete || '').toLowerCase(),
        name: (input.name || '').toLowerCase(),
        id: (input.id || '').toLowerCase(),
        placeholder: (input.placeholder || '').toLowerCase(),
        ariaLabel: (input.ariaLabel || '').toLowerCase(),
        role: (input.role || '').toLowerCase(),
        label: (input.label || '').toLowerCase().trim()
      };
    }

    /**
     * Classifies an element descriptor into a recognized semantic field category.
     * Returns string category (e.g. 'email', 'first_name') or null if unclassified/ignored.
     */
    static classify(input) {
      const signals = this.normalizeSignals(input);

      for (const rule of FIELD_RULES) {
        if (rule.test(signals)) {
          if (rule.isIgnored) return null;
          return rule.category;
        }
      }

      // Deterministic null - NEVER default to 'name'
      return null;
    }

    /**
     * Returns true if a task string is requesting form autofill/completion.
     */
    static isFormFillIntent(task) {
      if (!task || typeof task !== 'string') return false;
      const lower = task.toLowerCase();
      return /(?:fill|auto[- ]?fill|populate|complete|enter|type|input|apply|register|sign[- ]?up|profile|details|form)/i.test(lower);
    }
  }

  // Universal export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      FormFieldClassifier,
      formClassifier: FormFieldClassifier
    };
  } else {
    const root = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
    root.FormFieldClassifier = FormFieldClassifier;
    root.formClassifier = FormFieldClassifier;
  }
})();
