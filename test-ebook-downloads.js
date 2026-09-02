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
  return new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: targetPath }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    }).on('error', reject);
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
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('test-ebook-downloads: OK');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
