const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;
const { ocrWorker } = require('../lib/vision/ocr-worker');

async function main() {
  console.log('====================================================');
  console.log('  RUNNING REAL PASSPORT REDACTION PIPELINE');
  console.log('====================================================\n');

  const imgPath = path.resolve(__dirname, 'fixtures/passport-test.png');
  const buf = fs.readFileSync(imgPath);
  const srcPng = PNG.sync.read(buf);

  // 1. OCR Stage
  const ocrRes = await ocrWorker.detectSensitiveBoxes(imgPath);

  console.log('\n--- VERIFYING COVERAGE OF SENSITIVE FIELDS ---');
  const requiredFields = [
    { name: 'PASSPORT NUMBER', check: f => f.field === 'PASSPORT_NO' },
    { name: 'SURNAME', check: f => f.field === 'SURNAME' },
    { name: 'GIVEN NAME', check: f => f.field === 'GIVEN_NAME' },
    { name: 'NATIONALITY', check: f => f.field === 'NATIONALITY' },
    { name: 'SEX', check: f => f.field === 'SEX' },
    { name: 'DOB', check: f => f.field === 'DOB' },
    { name: 'PLACE OF BIRTH', check: f => f.field === 'POB' },
    { name: 'ISSUE DATE', check: f => f.field === 'ISSUE_DATE' },
    { name: 'EXPIRY DATE', check: f => f.field === 'EXPIRY_DATE' },
    { name: 'SIGNATURE', check: f => f.field === 'SIGNATURE' }
  ];

  let allCovered = true;
  for (const rf of requiredFields) {
    const match = ocrRes.sensitiveFields.find(rf.check);
    if (match) {
      console.log(`  ✓ ${rf.name}: Covered by [${match.field}] -> "${match.value}" bbox: ${JSON.stringify(match.bbox)}`);
    } else {
      console.error(`  ✗ MISSING: ${rf.name}`);
      allCovered = false;
    }
  }

  // 2. Redact canvas / pixel image with solid privacy masks matching canvasRedactor logic
  const dstPng = new PNG({ width: srcPng.width, height: srcPng.height });
  srcPng.data.copy(dstPng.data);

  console.log(`\n[CanvasRedactor] CANVAS SIZE: ${dstPng.width}x${dstPng.height}`);

  for (const box of ocrRes.ocrBoxes) {
    const rx = Math.max(0, Math.round(box.x));
    const ry = Math.max(0, Math.round(box.y));
    const rw = Math.round(box.width || 100);
    const rh = Math.round(box.height || 24);
    const tokenLabel = (box.tokens && box.tokens[0]) ? box.tokens[0] : (box.field ? `[${box.field}]` : '[OCR_MASK]');

    console.log(`[CanvasRedactor] EACH REDACTION BOX: [${tokenLabel}] x=${rx}, y=${ry}, w=${rw}, h=${rh}`);

    // Apply dark solid privacy mask (#0f172a = rgb(15, 23, 42))
    for (let y = ry; y < Math.min(dstPng.height, ry + rh); y++) {
      for (let x = rx; x < Math.min(dstPng.width, rx + rw); x++) {
        const idx = (y * dstPng.width + x) * 4;
        dstPng.data[idx] = 15;     // R
        dstPng.data[idx + 1] = 23; // G
        dstPng.data[idx + 2] = 42; // B
        dstPng.data[idx + 3] = 255;// A
      }
    }
  }

  const outBuf = PNG.sync.write(dstPng);
  const outPath = path.resolve(__dirname, 'fixtures/passport-test-sanitized.png');
  fs.writeFileSync(outPath, outBuf);
  console.log(`\nSanitized image saved to ${outPath}`);

  // Also copy to scratch for visual inspection
  const scratchPath = path.resolve('C:/Users/saras/.gemini/antigravity-ide/brain/138100c8-c25e-4a92-9d53-2005564d9e6a/scratch/passport-test-sanitized.png');
  try {
    fs.writeFileSync(scratchPath, outBuf);
  } catch (_) {}

  if (allCovered) {
    console.log('\n>>> ALL SENSITIVE PASSPORT TEXT FIELDS SUCCESSFULLY COVERED AND REDACTED! <<<');
    process.exit(0);
  } else {
    console.error('\n>>> SOME FIELDS WERE MISSED! <<<');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
