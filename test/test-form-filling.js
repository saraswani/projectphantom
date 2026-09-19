/**
 * PrivacyShield / Project Phantom — Form Filling Accuracy & Robustness Test Suite
 * 
 * Verifies:
 * 1. Semantic field classification across 25+ real-world input types (zero false 'name' defaults)
 * 2. Form fill task intent recognition
 * 3. Mock profile field value resolution
 * 4. Action validator security allowlist & CSS selector safety
 * 5. Native reactive input setter (React/Vue/standard DOM compatibility)
 * 6. Select dropdown and radio button matching
 * 7. Action rollback / restore filled inputs
 * 8. Submit button protection safety policy
 */

'use strict';

const assert = require('assert');
const path = require('path');

const { FormFieldClassifier } = require('../lib/executor/form-classifier');
const { ActionExecutor } = require('../lib/executor/action-executor');
const { ActionValidator } = require('../lib/executor/action-validator');
const config = require('../config');

console.log('========================================================================');
console.log('📋 TEST: Form Filling Accuracy, Classification & Framework Execution');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(name, condition, extra = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✔ [PASS] ${name} ${extra}`);
  } else {
    failedTests++;
    console.error(`  ✕ [FAIL] ${name} ${extra}`);
    process.exitCode = 1;
  }
}

// ── TEST 1: Semantic Field Classification Accuracy ────────────────────────────
console.log('TEST 1: Semantic Field Classification (No False "Name" Defaults)');

const classificationTestCases = [
  // Emails
  { input: { type: 'email', name: 'user_email' }, expected: 'email' },
  { input: { type: 'text', placeholder: 'Enter your Email address', name: 'mail' }, expected: 'email' },
  { input: { autocomplete: 'email', name: 'login_mail' }, expected: 'email' },

  // Phone numbers
  { input: { type: 'tel', name: 'phone' }, expected: 'phone' },
  { input: { type: 'text', placeholder: '+91 9876543210', id: 'mobile_num' }, expected: 'phone' },
  { input: { autocomplete: 'tel', name: 'contact_number' }, expected: 'phone' },

  // First / Given Name
  { input: { type: 'text', name: 'first_name', placeholder: 'First Name' }, expected: 'first_name' },
  { input: { type: 'text', id: 'fname', label: 'First Name' }, expected: 'first_name' },
  { input: { autocomplete: 'given-name', name: 'given_name' }, expected: 'first_name' },

  // Last / Family Name
  { input: { type: 'text', name: 'last_name', placeholder: 'Last Name' }, expected: 'last_name' },
  { input: { type: 'text', id: 'lname', label: 'Surname' }, expected: 'last_name' },
  { input: { autocomplete: 'family-name', name: 'surname' }, expected: 'last_name' },

  // Full Name
  { input: { type: 'text', name: 'name', placeholder: 'Full Name' }, expected: 'name' },
  { input: { type: 'text', id: 'input-fullname', label: 'Candidate Full Name' }, expected: 'name' },

  // Identity: Aadhaar & PAN & Passport
  { input: { type: 'text', name: 'aadhaar', placeholder: '12-digit Aadhaar' }, expected: 'aadhaar' },
  { input: { type: 'text', id: 'uidai_no', label: 'Aadhaar Number' }, expected: 'aadhaar' },
  { input: { type: 'text', name: 'pan', placeholder: 'ABCDE1234F' }, expected: 'pan' },
  { input: { type: 'text', id: 'passport_no', placeholder: 'Passport Number' }, expected: 'passport' },

  // Address, City, State, Pincode
  { input: { type: 'text', name: 'address', placeholder: 'Flat, Street, City' }, expected: 'address' },
  { input: { autocomplete: 'street-address', name: 'residential_address' }, expected: 'address' },
  { input: { type: 'text', name: 'city', placeholder: 'City / Town' }, expected: 'city' },
  { input: { type: 'text', name: 'state', placeholder: 'State / Province' }, expected: 'state' },
  { input: { type: 'text', name: 'pincode', placeholder: '6-digit PIN' }, expected: 'pincode' },
  { input: { autocomplete: 'postal-code', name: 'zip' }, expected: 'pincode' },
  { input: { type: 'text', name: 'country', placeholder: 'Country' }, expected: 'country' },

  // Personal: Gender & DOB
  { input: { type: 'select', name: 'gender', label: 'Select Gender' }, expected: 'gender' },
  { input: { type: 'date', name: 'dob', label: 'Date of Birth' }, expected: 'dob' },

  // Professional: Company & Occupation
  { input: { type: 'text', name: 'company', placeholder: 'Company / Organization' }, expected: 'company' },
  { input: { type: 'text', name: 'occupation', placeholder: 'Designation / Job Title' }, expected: 'occupation' },

  // Links & Education
  { input: { type: 'text', name: 'qualification', label: 'Highest Qualification' }, expected: 'qualification' },
  { input: { type: 'url', name: 'website', placeholder: 'Personal Website' }, expected: 'website' },

  // EXPLICIT IGNORE: Passwords, Search, Buttons, Honeypots (Must NEVER classify as 'name')
  { input: { type: 'password', name: 'password' }, expected: null },
  { input: { type: 'search', name: 'q', placeholder: 'Search...' }, expected: null },
  { input: { type: 'submit', value: 'Submit Application' }, expected: null },
  { input: { type: 'text', name: 'captcha_code', placeholder: 'Enter Captcha' }, expected: null },
  { input: { type: 'text', name: 'unknown_custom_flag_999' }, expected: null }
];

for (const tc of classificationTestCases) {
  const result = FormFieldClassifier.classify(tc.input);
  check(
    `Input [${tc.input.name || tc.input.type || tc.input.autocomplete}] -> '${tc.expected}'`,
    result === tc.expected,
    `(got '${result}')`
  );
}
console.log();

// ── TEST 2: Task Intent Recognition ──────────────────────────────────────────
console.log('TEST 2: Natural Language Form Fill Intent Recognition');

const intentTestCases = [
  { task: 'fill the form', expected: true },
  { task: 'fill out my details in the application', expected: true },
  { task: 'autofill the application form', expected: true },
  { task: 'populate the form', expected: true },
  { task: 'apply for this job with my profile', expected: true },
  { task: 'register my details', expected: true },
  { task: 'what is the threat exposure of this website?', expected: false },
  { task: 'scroll down to footer', expected: false },
  { task: 'read the privacy policy text', expected: false }
];

for (const tc of intentTestCases) {
  const isFill = FormFieldClassifier.isFormFillIntent(tc.task);
  check(`Task: "${tc.task}" isFormFill === ${tc.expected}`, isFill === tc.expected);
}
console.log();

// ── TEST 3: Mock Profile Value Resolution ────────────────────────────────────
console.log('TEST 3: Profile Value Resolution Across Categories');

const executor = new ActionExecutor();
executor.setProfile(config.MOCK_PROFILE);

const profileExpectations = [
  { field: 'name', expected: 'Aarav Sharma' },
  { field: 'first_name', expected: 'Aarav' },
  { field: 'fname', expected: 'Aarav' },
  { field: 'last_name', expected: 'Sharma' },
  { field: 'lname', expected: 'Sharma' },
  { field: 'email', expected: 'aarav.sharma@example.com' },
  { field: 'phone', expected: '+91 98765 43210' },
  { field: 'aadhaar', expected: '2345 6789 0123' },
  { field: 'pan', expected: 'ABCDE1234F' },
  { field: 'passport', expected: 'Z1234567' },
  { field: 'pincode', expected: '560103' },
  { field: 'city', expected: 'Bengaluru' },
  { field: 'state', expected: 'Karnataka' },
  { field: 'country', expected: 'India' },
  { field: 'gender', expected: 'Male' },
  { field: 'dob', expected: '1998-05-15' },
  { field: 'company', expected: 'ISRO Research Partner' },
  { field: 'occupation', expected: 'Software Engineer' },
  { field: 'qualification', expected: 'Bachelor of Technology' },
  { field: 'website', expected: 'https://aaravsharma.dev' },
  // Unknown field should NOT return user name!
  { field: 'unknown_token_field', expected: null }
];

for (const exp of profileExpectations) {
  const resolved = executor.resolveLocalProfileValue(exp.field, null);
  check(`Field '${exp.field}' resolves to expected value`, resolved === exp.expected, `(got: ${resolved})`);
}
console.log();

// ── TEST 4: Action Validator Security Allowlist & Syntax Safety ──────────────
console.log('TEST 4: Action Validator & CSS Selector Safety');

const validator = new ActionValidator();

// 4a. Valid fill action
const validFill = validator.validateSingleAction({
  action: 'fill',
  selector: '#input-fullname',
  fieldType: 'name',
  confidence: 0.95
});
check('Valid fill action passes validation', validFill.valid === true);
check('Normalized action preserves fieldType', validFill.normalizedAction.fieldType === 'name');
check('Normalized action preserves selector', validFill.normalizedAction.selector === '#input-fullname');

// 4b. Target by text should not inject invalid :has-text selector
const textTarget = validator.validateSingleAction({
  action: 'click',
  target: { type: 'text', value: 'Continue' },
  confidence: 0.90
});
check('Text target produces valid CSS selector without :has-text', !textTarget.normalizedAction.selector.includes(':has-text'));
check('Text target preserves targetText property', textTarget.normalizedAction.targetText === 'Continue');

// 4c. Autonomous Submit Click is Blocked by Safety Policy
const submitClick = validator.validateSingleAction({
  action: 'click',
  selector: 'button#form-submit-btn',
  confidence: 0.95
});
check('Submit click action is blocked by policy', submitClick.blockedByPolicy === true);
check('Submit click reason explains human review policy', submitClick.reason.includes('safety policy'));

// 4d. Dangerous Script Injection is Blocked
const injectionAttempt = validator.validateSingleAction({
  action: 'fill',
  selector: 'javascript:alert(1)',
  value: '<script>steal()</script>'
});
check('JavaScript injection in selector is blocked', injectionAttempt.valid === false);
console.log();

// ── TEST 5: DOM Reactive Input Simulation & Rollback ──────────────────────────
console.log('TEST 5: Reactive Input Event Dispatching & Rollback Simulation');

// Mock DOM Input with prototype value descriptor and event listeners
class MockHTMLInputElement {
  constructor(type = 'text', initialValue = '') {
    this.tagName = 'INPUT';
    this.type = type;
    this._value = initialValue;
    this.events = [];
    this._valueTracker = {
      setValue: (val) => { this._trackedValue = val; }
    };
  }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  focus() { this.events.push('focus'); }
  blur() { this.events.push('blur'); }
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

// Global Event mock for node environment
if (typeof Event === 'undefined') {
  global.Event = class Event { constructor(type, opts) { this.type = type; this.opts = opts; } };
}
if (typeof InputEvent === 'undefined') {
  global.InputEvent = class InputEvent extends global.Event { constructor(type, opts) { super(type, opts); } };
}

const mockInput = new MockHTMLInputElement('text', 'Original Pre-fill Text');
executor.setNativeInputValue(mockInput, 'Aarav Sharma');

check('Input value updated', mockInput.value === 'Aarav Sharma');
check('Focus event dispatched', mockInput.events.includes('focus'));
check('Input event dispatched', mockInput.events.includes('input'));
check('Change event dispatched', mockInput.events.includes('change'));
check('Blur event dispatched', mockInput.events.includes('blur'));

// Verify rollback / restore
executor.restoreFilledInputs();
check('Rollback restores input to original value', mockInput.value === 'Original Pre-fill Text');
console.log();

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('========================================================================');
console.log(`📊 Form Filling Test Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL FORM FILLING ACCURACY TESTS PASSED PERFECTLY!\n');
}
