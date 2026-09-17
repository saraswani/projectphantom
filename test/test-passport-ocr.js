/**
 * Automated Test Suite: Passport and ID Multi-Pass OCR & Sensitive Field Detection
 * 
 * Tests 4 real distinct document layouts:
 * 1. Provided Haiti Passport (Multilingual Creole/French/English, custom specimen)
 * 2. UK ICAO Doc 9303 TD3 Passport (Two columns, 2-line MRZ, signature)
 * 3. Republic of India Passport (Bilingual Hindi/English, date slashes, 2-line MRZ, signature)
 * 4. National Identity Card (TD1 format, 3-line MRZ, Spanish nationality, signature)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ocrWorker } = require('../lib/vision/ocr-worker');

async function runTests() {
  console.log('===============================================================');
  console.log('  PROJECT PHANTOM — PASSPORT/ID OCR DETECTION TEST SUITE       ');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Provided Haiti Passport Test Image
  // ─────────────────────────────────────────────────────────────
  console.log('[Test 1] Testing Provided Haiti Passport (passport-test.png)...');
  const haitiPath = path.resolve(__dirname, 'fixtures/passport-test.png');
  assert(fs.existsSync(haitiPath), 'Haiti passport test image exists');

  const haitiRes = await ocrWorker.detectSensitiveBoxes(haitiPath);
  console.log(`  -> Detected ${haitiRes.sensitiveFields.length} sensitive fields`);
  haitiRes.sensitiveFields.forEach(f => {
    console.log(`     [${f.field}] ${f.name}: "${f.value}" (bbox: x=${f.bbox.x}, y=${f.bbox.y}, w=${f.bbox.width}, h=${f.bbox.height})`);
  });

  test('Haiti: Passport Number detected (HA999999)', () => {
    const pNo = haitiRes.sensitiveFields.find(f => f.field === 'PASSPORT_NO' && f.value.includes('HA999999'));
    assert(pNo, 'Passport number HA999999 must be detected');
    assert(pNo.bbox.width > 0 && pNo.bbox.height > 0, 'Bounding box must have positive dimensions');
  });

  test('Haiti: Surname detected (PIERRE)', () => {
    const sn = haitiRes.sensitiveFields.find(f => f.field === 'SURNAME' && f.value.includes('PIERRE'));
    assert(sn, 'Surname PIERRE must be detected');
  });

  test('Haiti: Given Name detected (JEAN-FRANCOIS)', () => {
    const gn = haitiRes.sensitiveFields.find(f => f.field === 'GIVEN_NAME' && (f.value.includes('JEAN') || f.value.includes('FRANCOIS')));
    assert(gn, 'Given Name JEAN-FRANCOIS must be detected');
  });

  test('Haiti: Nationality detected (HAITIENNE)', () => {
    const nat = haitiRes.sensitiveFields.find(f => f.field === 'NATIONALITY' && f.value.includes('HAITIENNE'));
    assert(nat, 'Nationality HAITIENNE must be detected');
  });

  test('Haiti: Sex detected (MASCULIN / MALE)', () => {
    const sex = haitiRes.sensitiveFields.find(f => f.field === 'SEX' && (f.value.includes('MASCULIN') || f.value.includes('MALE')));
    assert(sex, 'Sex MASCULIN/MALE must be detected');
  });

  test('Haiti: Date of Birth detected (15 JANVYE 1978)', () => {
    const dob = haitiRes.sensitiveFields.find(f => f.field === 'DOB' && (f.value.includes('1978') || f.value.includes('JANVYE')));
    assert(dob, 'DOB 15 JANVYE 1978 must be detected');
  });

  test('Haiti: Place of Birth detected (PORT-AU-PRINCE, HAITI)', () => {
    const pob = haitiRes.sensitiveFields.find(f => f.field === 'POB' && (f.value.includes('PORT-AU-PRINCE') || f.value.includes('HAITI')));
    assert(pob, 'POB PORT-AU-PRINCE, HAITI must be detected');
  });

  test('Haiti: Date of Issue detected (20 AVRIL 2022)', () => {
    const issue = haitiRes.sensitiveFields.find(f => f.field === 'ISSUE_DATE' && (f.value.includes('2022') || f.value.includes('AVRIL')));
    assert(issue, 'Date of Issue 20 AVRIL 2022 must be detected');
  });

  test('Haiti: Date of Expiry detected (19 AVRIL 2027)', () => {
    const expiry = haitiRes.sensitiveFields.find(f => f.field === 'EXPIRY_DATE' && (f.value.includes('2027') || f.value.includes('AVRIL')));
    assert(expiry, 'Date of Expiry 19 AVRIL 2027 must be detected');
  });

  test('Haiti: Signature region detected', () => {
    const sig = haitiRes.sensitiveFields.find(f => f.field === 'SIGNATURE');
    assert(sig, 'Signature region must be detected');
    assert(sig.bbox.y >= 200 && sig.bbox.y <= 260, 'Signature Y-coordinate must be around signature line');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 2: UK ICAO 9303 TD3 Passport Layout
  // ─────────────────────────────────────────────────────────────
  console.log('\n[Test 2] Testing UK ICAO Doc 9303 Passport (passport-uk.png)...');
  const ukPath = path.resolve(__dirname, 'fixtures/passport-uk.png');
  const ukRes = await ocrWorker.detectSensitiveBoxes(ukPath);
  console.log(`  -> Detected ${ukRes.sensitiveFields.length} sensitive fields`);
  ukRes.sensitiveFields.forEach(f => {
    console.log(`     [${f.field}] ${f.name}: "${f.value}"`);
  });

  test('UK: Passport Number detected (502198421)', () => {
    const pNo = ukRes.sensitiveFields.find(f => f.field === 'PASSPORT_NO' && f.value.includes('502198421'));
    assert(pNo, 'Passport number 502198421 must be detected');
  });

  test('UK: Surname detected (HENDRICK)', () => {
    const sn = ukRes.sensitiveFields.find(f => f.field === 'SURNAME' && f.value.includes('HENDRICK'));
    assert(sn, 'Surname HENDRICK must be detected');
  });

  test('UK: Given Names detected (ELEANOR JANE)', () => {
    const gn = ukRes.sensitiveFields.find(f => f.field === 'GIVEN_NAME' && (f.value.includes('ELEANOR') || f.value.includes('JANE')));
    assert(gn, 'Given Name ELEANOR JANE must be detected');
  });

  test('UK: Nationality detected (BRITISH CITIZEN)', () => {
    const nat = ukRes.sensitiveFields.find(f => f.field === 'NATIONALITY' && f.value.includes('BRITISH'));
    assert(nat, 'Nationality BRITISH CITIZEN must be detected');
  });

  test('UK: Complete 2-line MRZ detected and bounded', () => {
    const mrz = ukRes.sensitiveFields.find(f => f.field === 'MRZ');
    assert(mrz, 'MRZ zone must be detected');
    assert(mrz.value.includes('GBRHENDRICK'), 'MRZ must contain passport holder data');
    assert(mrz.bbox.width > 600, 'MRZ box must span the full document width');
  });

  test('UK: Signature region detected', () => {
    const sig = ukRes.sensitiveFields.find(f => f.field === 'SIGNATURE');
    assert(sig, 'Signature region must be detected');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Republic of India Passport Layout
  // ─────────────────────────────────────────────────────────────
  console.log('\n[Test 3] Testing Republic of India Passport (passport-india.png)...');
  const indiaPath = path.resolve(__dirname, 'fixtures/passport-india.png');
  const indiaRes = await ocrWorker.detectSensitiveBoxes(indiaPath);
  console.log(`  -> Detected ${indiaRes.sensitiveFields.length} sensitive fields`);
  indiaRes.sensitiveFields.forEach(f => {
    console.log(`     [${f.field}] ${f.name}: "${f.value}"`);
  });

  test('India: Passport Number detected (Z3849201)', () => {
    const pNo = indiaRes.sensitiveFields.find(f => f.field === 'PASSPORT_NO' && (f.value.includes('3849201') || f.value.includes('Z3849201')));
    assert(pNo, 'Passport number Z3849201 must be detected');
  });

  test('India: Surname detected (CHATTERJEE)', () => {
    const sn = indiaRes.sensitiveFields.find(f => f.field === 'SURNAME' && f.value.includes('CHATTERJEE'));
    assert(sn, 'Surname CHATTERJEE must be detected');
  });

  test('India: Given Name detected (SOUMYA)', () => {
    const gn = indiaRes.sensitiveFields.find(f => f.field === 'GIVEN_NAME' && f.value.includes('SOUMYA'));
    assert(gn, 'Given Name SOUMYA must be detected');
  });

  test('India: Nationality detected (INDIAN)', () => {
    const nat = indiaRes.sensitiveFields.find(f => f.field === 'NATIONALITY' && f.value.includes('INDIAN'));
    assert(nat, 'Nationality INDIAN must be detected');
  });

  test('India: Complete 2-line MRZ detected', () => {
    const mrz = indiaRes.sensitiveFields.find(f => f.field === 'MRZ');
    assert(mrz, 'MRZ zone must be detected');
    assert(mrz.value.includes('INDCHATTERJEE'), 'MRZ must contain India passport holder data');
  });

  // ─────────────────────────────────────────────────────────────
  // TEST 4: National Identity Card Layout
  // ─────────────────────────────────────────────────────────────
  console.log('\n[Test 4] Testing National Identity Card (id-card-national.png)...');
  const idPath = path.resolve(__dirname, 'fixtures/id-card-national.png');
  const idRes = await ocrWorker.detectSensitiveBoxes(idPath);
  console.log(`  -> Detected ${idRes.sensitiveFields.length} sensitive fields`);
  idRes.sensitiveFields.forEach(f => {
    console.log(`     [${f.field}] ${f.name}: "${f.value}"`);
  });

  test('National ID: Document No detected (ID9872410)', () => {
    const docNo = idRes.sensitiveFields.find(f => f.field === 'PASSPORT_NO' && f.value.includes('ID9872410'));
    assert(docNo, 'Document Number ID9872410 must be detected');
  });

  test('National ID: Surname detected (MARTINEZ)', () => {
    const sn = idRes.sensitiveFields.find(f => f.field === 'SURNAME' && f.value.includes('MARTINEZ'));
    assert(sn, 'Surname MARTINEZ must be detected');
  });

  test('National ID: Given Name detected (CARLOS ANDRES)', () => {
    const gn = idRes.sensitiveFields.find(f => f.field === 'GIVEN_NAME' && (f.value.includes('CARLOS') || f.value.includes('ANDRES')));
    assert(gn, 'Given Name CARLOS ANDRES must be detected');
  });

  test('National ID: Nationality detected (SPANISH)', () => {
    const nat = idRes.sensitiveFields.find(f => f.field === 'NATIONALITY' && f.value.includes('SPANISH'));
    assert(nat, 'Nationality SPANISH must be detected');
  });

  test('National ID: TD1 MRZ detected and bounded', () => {
    const mrz = idRes.sensitiveFields.find(f => f.field === 'MRZ');
    assert(mrz, 'MRZ zone must be detected');
    assert(mrz.value.includes('MARTINEZ'), 'MRZ must contain holder name');
  });

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n===============================================================');
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('===============================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
