'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
process.env.EMAIL_PASS ||= 'dummy';
process.env.DOWNLOAD_TOKEN_SECRET = 'test-download-token-secret';
process.env.DOWNLOAD_BASE_URL = 'https://downloads.achzodcoaching.test';
process.env.EBOOK_UPLOAD_SECRET = 'test-upload-token-secret';

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'achzod-ebooks-'));
process.env.EBOOK_STORAGE_DIR = storageDir;
fs.writeFileSync(path.join(storageDir, 'anabolic-code.pdf'), '%PDF-1.4\n% test ebook\n');

const {
  EBOOKS,
  app,
  buildEbookLink,
  findEbookLink,
} = require('./index');
const {
  signDownloadToken,
  verifyDownloadToken,
} = require('./ebook-downloads');

const forbiddenExternalDownloadHost = new RegExp(`${['go', 'file'].join('')}|store-${['eu', 'par'].join('-')}`, 'i');

function request(port, targetPath) {
  return httpRequest(port, { path: targetPath });
}

function httpRequest(port, options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      host: '127.0.0.1',
      method: options.method || 'GET',
      path: options.path,
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  assert.equal(EBOOKS.length, 4);

  const ebook = buildEbookLink('Anabolic Code', {
    customerEmail: 'client@example.com',
    orderId: 'checkout_session:cs_test',
    now: new Date('2026-09-02T00:00:00.000Z'),
  });
  assert.equal(ebook.slug, 'anabolic-code');
  assert.match(ebook.link, /^https:\/\/downloads\.achzodcoaching\.test\/download\/anabolic-code\?token=/);
  assert.doesNotMatch(ebook.link, forbiddenExternalDownloadHost);

  const routed = findEbookLink('EBOOK 49 00 EUR 4 semaines pour être SHRED', {
    customerEmail: 'client@example.com',
    orderId: 'checkout_session:cs_test',
  });
  assert.equal(routed.slug, '4-semaines-shred');
  assert.doesNotMatch(routed.link, forbiddenExternalDownloadHost);

  const verificationToken = signDownloadToken({
    slug: 'anabolic-code',
    customerEmail: 'client@example.com',
    orderId: 'checkout_session:cs_test',
    ttlSeconds: 60,
    now: new Date('2026-09-02T00:00:00.000Z'),
  });
  assert.equal(verifyDownloadToken(verificationToken, 'anabolic-code', {
    now: new Date('2026-09-02T00:00:30.000Z'),
  }).ok, true);
  assert.equal(verifyDownloadToken(`${verificationToken}x`, 'anabolic-code', {
    now: new Date('2026-09-02T00:00:30.000Z'),
  }).ok, false);
  assert.equal(verifyDownloadToken(verificationToken, '4-semaines-shred', {
    now: new Date('2026-09-02T00:00:30.000Z'),
  }).code, 'slug_mismatch');
  assert.equal(verifyDownloadToken(verificationToken, 'anabolic-code', {
    now: new Date('2026-09-02T00:02:00.000Z'),
  }).code, 'expired_token');

  const checkoutAnchored = buildEbookLink('Anabolic Code', {
    customerEmail: 'client@example.com',
    orderId: 'checkout_session:cs_old',
    ttlSeconds: 60,
    now: new Date('2026-09-02T00:00:00.000Z'),
  });
  const checkoutAnchoredToken = new URL(checkoutAnchored.link).searchParams.get('token');
  assert.equal(verifyDownloadToken(checkoutAnchoredToken, 'anabolic-code', {
    now: new Date('2026-09-02T00:02:00.000Z'),
  }).code, 'expired_token');

  const token = signDownloadToken({
    slug: 'anabolic-code',
    customerEmail: 'client@example.com',
    orderId: 'checkout_session:cs_test',
    ttlSeconds: 60,
    now: new Date(),
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    const ok = await request(port, `/download/anabolic-code?token=${encodeURIComponent(token)}`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers['content-type'], /application\/pdf/);
    assert.match(ok.headers['content-disposition'], /attachment; filename="anabolic-code\.pdf"/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.equal(ok.headers['referrer-policy'], 'no-referrer');
    assert.match(ok.body, /%PDF-1\.4/);

    const badToken = await request(port, '/download/anabolic-code?token=bad');
    assert.equal(badToken.status, 403);

    const wrongSlug = await request(port, `/download/4-semaines-shred?token=${encodeURIComponent(token)}`);
    assert.equal(wrongSlug.status, 403);

    const missingFileToken = signDownloadToken({
      slug: 'bioenergetique-timing-nutrition',
      ttlSeconds: 60,
      now: new Date(),
    });
    const missingFile = await request(port, `/download/bioenergetique-timing-nutrition?token=${encodeURIComponent(missingFileToken)}`);
    assert.equal(missingFile.status, 503);

    const health = await request(port, '/health');
    const healthBody = JSON.parse(health.body);
    assert.equal(health.status, 503);
    assert.equal(healthBody.checks.downloadTokenSecret, true);
    assert.equal(healthBody.checks.downloadsFiles, false);

    const uploadedPdf = '%PDF-1.4\n% uploaded ebook\n';
    const upload = await httpRequest(port, {
      method: 'PUT',
      path: '/admin/ebooks/bioenergetique-timing-nutrition',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Upload-Token': 'test-upload-token-secret',
      },
    }, uploadedPdf);
    assert.equal(upload.status, 200);
    const uploadBody = JSON.parse(upload.body);
    assert.equal(uploadBody.slug, 'bioenergetique-timing-nutrition');
    assert.equal(fs.readFileSync(path.join(storageDir, 'bioenergetique-timing-nutrition.pdf'), 'utf8'), uploadedPdf);

    const rejectedUpload = await httpRequest(port, {
      method: 'PUT',
      path: '/admin/ebooks/potentiel-genetique',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Upload-Token': 'bad-token',
      },
    }, '%PDF-1.4\n');
    assert.equal(rejectedUpload.status, 403);

    const rejectedMagic = await httpRequest(port, {
      method: 'PUT',
      path: '/admin/ebooks/potentiel-genetique',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Upload-Token': 'test-upload-token-secret',
      },
    }, 'not a pdf');
    assert.equal(rejectedMagic.status, 415);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('test-ebook-downloads: OK');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
