const assert = require('assert');
const { TextPIIDetector } = require('../lib/pii/text-detector');

console.log('===============================================================');
console.log('  TESTING PASSPORT NUMBER TEXT & DOM REDACTION');
console.log('===============================================================\n');

// 1. PURE TEXT REDACTION TESTS
console.log('[Suite 1] Pure Text PII Detection:');
const detector = new TextPIIDetector();

const textCases = [
  {
    desc: 'Multiline Passport No (like user screenshot)',
    input: 'PASSPORT NO\n12345678',
    expectedMask: 'PASSPORT NO\n[PASSPORT_NO_1]',
    expectedValue: '12345678'
  },
  {
    desc: 'Passport No with space',
    input: 'PASSPORT NO 12345678',
    expectedMask: 'PASSPORT NO [PASSPORT_NO_1]',
    expectedValue: '12345678'
  },
  {
    desc: 'Passport No with colon',
    input: 'Passport No: 12345678',
    expectedMask: 'Passport No: [PASSPORT_NO_1]',
    expectedValue: '12345678'
  },
  {
    desc: 'Passport Number with colon',
    input: 'Passport Number: 12345678',
    expectedMask: 'Passport Number: [PASSPORT_NO_1]',
    expectedValue: '12345678'
  },
  {
    desc: 'Standalone Indian Passport format (Z3849201)',
    input: 'Holder passport is Z3849201 for applicant',
    expectedMask: 'Holder passport is [PASSPORT_NO_1] for applicant',
    expectedValue: 'Z3849201'
  },
  {
    desc: 'International Passport format (HA999999)',
    input: 'Passeport No: HA999999',
    expectedMask: 'Passeport No: [PASSPORT_NO_1]',
    expectedValue: 'HA999999'
  }
];

textCases.forEach(tc => {
  detector.reset();
  const res = detector.detectAndSanitize(tc.input);
  assert.strictEqual(res.sanitizedText, tc.expectedMask, `Failed text mask for ${tc.desc}`);
  assert.strictEqual(res.detectedSpans.length, 1, `Expected 1 span for ${tc.desc}`);
  assert.strictEqual(res.detectedSpans[0].text, tc.expectedValue, `Expected value ${tc.expectedValue}`);
  console.log(`  ✓ PASS: ${tc.desc} -> "${res.sanitizedText.replace(/\n/g, '\\n')}"`);
});

// 2. CONTEXTUAL DOM TREE MOCK REDACTION TEST
console.log('\n[Suite 2] Contextual DOM Tree Redaction:');

class MockNode {
  constructor(nodeType, nodeValue = '') {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
    this.parentElement = null;
    this.previousSibling = null;
    this.nextSibling = null;
    this.children = [];
    this.attributes = {};
    this.classList = {
      contains: (cls) => this.className.split(/\s+/).includes(cls)
    };
    this.className = '';
    this.tagName = 'DIV';
    this.style = {};
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, val) { this.attributes[name] = val; }
  hasAttribute(name) { return name in this.attributes; }
  get parentNode() { return this.parentElement; }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 80, height: 20, x: 0, y: 0, right: 80, bottom: 20 }; }
  appendChild(child) {
    if (this.children.length > 0) {
      const prev = this.children[this.children.length - 1];
      prev.nextSibling = child;
      child.previousSibling = prev;
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  replaceChild(newChild, oldChild) {
    const idx = this.children.indexOf(oldChild);
    if (idx !== -1) {
      newChild.parentElement = this;
      this.children[idx] = newChild;
      return oldChild;
    }
    return null;
  }
  closest(selector) {
    if (selector.includes('field-group') && this.className.includes('field-group')) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
  querySelector(selector) {
    for (const ch of this.children) {
      if (selector.includes('field-label') && ch.className.includes('field-label')) return ch;
      if (selector.includes('ps-redacted-badge') && ch.className.includes('ps-redacted-badge')) return ch;
      const sub = ch.querySelector ? ch.querySelector(selector) : null;
      if (sub) return sub;
    }
    return null;
  }
  querySelectorAll(selector) {
    const res = [];
    for (const ch of this.children) {
      if (selector.includes('ps-redacted-badge') && ch.className.includes('ps-redacted-badge')) res.push(ch);
      if (ch.querySelectorAll) res.push(...ch.querySelectorAll(selector));
    }
    return res;
  }
  get previousElementSibling() {
    let p = this.previousSibling;
    while (p && p.nodeType !== 1) p = p.previousSibling;
    return p;
  }
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.children.map(c => c.textContent).join('');
  }
  set textContent(val) {
    this.children = [];
    if (val) this.appendChild(new MockNode(3, val));
  }
}

global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
global.NodeFilter = {
  SHOW_TEXT: 4,
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  FILTER_SKIP: 3
};
global.performance = { now: () => Date.now() };
global.window = { scrollX: 0, scrollY: 0 };

// Build Mock DOM Structure:
// <div class="field-group">
//   <span class="field-label">PASSPORT NO</span>
//   <span class="field-val">12345678</span>
// </div>
const body = new MockNode(1);
const card = new MockNode(1);
const group = new MockNode(1);
group.className = 'field-group';

const labelEl = new MockNode(1);
labelEl.className = 'field-label';
labelEl.tagName = 'SPAN';
labelEl.appendChild(new MockNode(3, 'PASSPORT NO'));

const valEl = new MockNode(1);
valEl.className = 'field-val';
valEl.tagName = 'SPAN';
const targetTextNode = new MockNode(3, '12345678');
valEl.appendChild(targetTextNode);

group.appendChild(labelEl);
group.appendChild(valEl);
card.appendChild(group);
body.appendChild(card);

global.document = {
  body: body,
  querySelectorAll: (sel) => [],
  createTreeWalker: (root, whatToShow, filter) => {
    const textNodes = [];
    function traverse(node) {
      if (node.nodeType === 3) {
        if (filter.acceptNode(node) === 1) textNodes.push(node);
      }
      for (const child of node.children) traverse(child);
    }
    traverse(root);
    let idx = 0;
    return {
      nextNode: () => textNodes[idx++] || null
    };
  },
  createElement: (tag) => {
    const el = new MockNode(1);
    el.tagName = tag.toUpperCase();
    return el;
  },
  createTextNode: (text) => new MockNode(3, text),
  createDocumentFragment: () => {
    const frag = new MockNode(11);
    return frag;
  }
};

global.textPIIDetector = new TextPIIDetector();
const { DOMRedactor } = require('../lib/redactor/dom-redactor');
const redactor = new DOMRedactor();

const res = redactor.redactPageDOM(body);
console.log(`  -> Redacted ${res.totalRedacted} DOM items:`, res.tokens);
assert.strictEqual(res.totalRedacted, 1, 'Expected exactly 1 redacted item in DOM');
assert.strictEqual(res.tokens[0], '[PASSPORT_NO_1]', 'Expected [PASSPORT_NO_1] token');
console.log('  ✓ PASS: Contextual DOM detection recognized and redacted 12345678 as [PASSPORT_NO_1]');

// Test restore
redactor.restorePageDOM();
assert.strictEqual(valEl.textContent, '12345678', 'Original value restored');
console.log('  ✓ PASS: Restoration successfully reverted to 12345678');

console.log('\n===============================================================');
console.log('  ALL PASSPORT TEXT & DOM REDACTION TESTS PASSED! ');
console.log('===============================================================');
