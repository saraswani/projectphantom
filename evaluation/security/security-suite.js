/**
 * Phantom AI — Comprehensive Security Test Suite & Dynamic DOM Mutation Evaluator
 * 
 * Tests detection and redaction across complex vectors:
 * 1. Hidden inputs (<input type="hidden" value="...">) containing tokens
 * 2. Password fields (<input type="password">)
 * 3. Accessibility labels & alt text (aria-label, alt, title)
 * 4. Canvas & SVG rendered content
 * 5. Dynamically generated / inserted DOM elements (MutationObserver simulation)
 * 6. Dynamic PII added AFTER page load
 * 7. Outbound network payload sanitizer verification
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { TextPIIDetector } = require('../../lib/pii/text-detector');
const { PrivacyGateEngine } = require('../../lib/privacy/privacy-gate');

console.log('========================================================================');
console.log('🔒 Phantom AI — Comprehensive Security & Dynamic DOM Test Suite');
console.log('========================================================================\n');

async function runSecuritySuite() {
  const detector = new TextPIIDetector();
  const gate = new PrivacyGateEngine();

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  // ── TEST 1: Hidden Inputs Redaction ─────────────────────────────────────────
  totalTests++;
  console.log('TEST 1: Hidden Inputs (<input type="hidden">) Protection');
  const hiddenInputSnippet = '<input type="hidden" name="user_token" value="ghp_111122223333444455556666777788889999" />';
  const res1 = detector.detectAndSanitize(hiddenInputSnippet);
  if (res1.detectedSpans.length > 0 && !res1.sanitizedText.includes('ghp_1111')) {
    console.log(`  ✔ PASS: Hidden input token detected and replaced with ${res1.detectedSpans[0].token}.`);
    passedTests++;
  } else {
    console.error('  ✕ FAIL: Hidden input token missed:', res1);
    failedTests++;
  }

  // ── TEST 2: Password Field Value Masking ────────────────────────────────────
  totalTests++;
  console.log('\nTEST 2: Password Field Protection');
  const pwdSnippet = '<input type="password" name="user_pwd" value="SecretMasterKey2026!" />';
  const res2 = detector.detectAndSanitize(pwdSnippet);
  const gateCheck2 = gate.inspectOutboundPayload({
    sanitizedText: res2.sanitizedText,
    screenStructure: { elements: [{ type: 'input_password', value: 'SecretMasterKey2026!' }] }
  });
  if (gateCheck2.blocked) {
    console.log('  ✔ PASS: Privacy Gate intercepted and blocked raw password in structure.');
    passedTests++;
  } else {
    console.error('  ✕ FAIL: Password leak was not blocked:', gateCheck2);
    failedTests++;
  }

  // ── TEST 3: Accessibility Labels & Alt Text (aria-label, alt) ────────────────
  totalTests++;
  console.log('\nTEST 3: Accessibility Labels & Alt Text Attributes');
  const attrSnippet = '<img alt="Photo of Satish Dhawan at ISRO launch pad" aria-label="Account aadhaar 2345 6789 0124" />';
  const res3 = detector.detectAndSanitize(attrSnippet);
  if (res3.detectedSpans.length > 0 && res3.sanitizedText.includes('[AADHAAR_')) {
    console.log(`  ✔ PASS: PII inside aria-label detected and masked: ${res3.sanitizedText}`);
    passedTests++;
  } else {
    console.error('  ✕ FAIL: Accessibility PII missed:', res3);
    failedTests++;
  }

  // ── TEST 4: Canvas & SVG Encapsulated Text ──────────────────────────────────
  totalTests++;
  console.log('\nTEST 4: SVG & Canvas Text Buffer Content');
  const svgSnippet = '<svg><text x="20" y="35">User phone: +91 98765 43210</text></svg>';
  const res4 = detector.detectAndSanitize(svgSnippet);
  if (res4.detectedSpans.length > 0 && res4.sanitizedText.includes('[PHONE_')) {
    console.log(`  ✔ PASS: SVG embedded phone number detected and sanitized: ${res4.sanitizedText}`);
    passedTests++;
  } else {
    console.error('  ✕ FAIL: SVG text missed:', res4);
    failedTests++;
  }

  // ── TEST 5: Dynamic DOM Mutation (PII Added AFTER Initial Page Load) ─────────
  totalTests++;
  console.log('\nTEST 5: Dynamic DOM Mutation (PII Inserted Post-Load via MutationObserver)');
  // Simulate initial state
  const initialPage = 'Welcome to the portal. Please wait for account details to load...';
  const initialScan = detector.detectAndSanitize(initialPage);
  console.log(`  Initial Page Load: ${initialScan.detectedSpans.length} PII entities found.`);

  // Simulate dynamic injection: e.g. Ajax/WebSocket loads customer credit card
  const dynamicNodeText = 'Asynchronous statement loaded: Card 4532 0150 5190 7100 charged ₹5,000.';
  const dynamicScan = detector.detectAndSanitize(dynamicNodeText);
  if (dynamicScan.detectedSpans.length > 0 && dynamicScan.sanitizedText.includes('[CARD_')) {
    console.log(`  ✔ PASS: Dynamically inserted element detected post-load and masked: "${dynamicScan.sanitizedText}".`);
    passedTests++;
  } else {
    console.error('  ✕ FAIL: Dynamic mutation PII missed:', dynamicScan);
    failedTests++;
  }

  // ── TEST 6: Zero Raw PII in Outbound Network Payload ────────────────────────
  totalTests++;
  console.log('\nTEST 6: Zero Raw PII in Network Request Payload Verification');
  const testPayload = {
    sanitizedText: dynamicScan.sanitizedText,
    sanitizedImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    screenStructure: { elements: [{ type: 'card', selector: '#txn-card' }] },
    task: 'Summarize dynamic statement',
    confidence: 0.95
  };
  const gateCheck6 = gate.inspectOutboundPayload(testPayload);
  if (gateCheck6.allowed && gateCheck6.rawPIIDetectedCount === 0) {
    console.log('  ✔ PASS: Outbound network request contains ZERO raw PII tokens.');
    passedTests++;
  } else {
    console.error('  ✕ FAIL: Outbound request failed privacy check:', gateCheck6);
    failedTests++;
  }

  console.log('\n========================================================================');
  console.log('📊 SECURITY TEST SUITE RESULTS:');
  console.log('========================================================================');
  console.log(`• Total Security Tests:   ${totalTests}`);
  console.log(`• Passed Security Tests:  ${passedTests}`);
  console.log(`• Failed Security Tests:  ${failedTests}`);
  console.log(`• Success Rate:           ${((passedTests / totalTests) * 100).toFixed(2)}%`);
  console.log('========================================================================\n');

  const reportData = {
    benchmark: 'security_test_suite',
    timestamp: new Date().toISOString(),
    totalTests,
    passedTests,
    failedTests,
    successRate: (passedTests / totalTests) * 100
  };

  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'security-suite-report.json'), JSON.stringify(reportData, null, 2));

  return reportData;
}

if (require.main === module) {
  runSecuritySuite().catch(err => {
    console.error('Security suite error:', err);
    process.exit(1);
  });
}

module.exports = { runSecuritySuite };
