'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STORAGE_DIR = '/var/data/ebooks';
const DEFAULT_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_DOWNLOAD_BASE_URL = 'https://achzod-klarna-checkout.onrender.com';

function normalizeEbookLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const EBOOKS = Object.freeze([
  Object.freeze({
    slug: 'anabolic-code',
    name: 'Anabolic Code',
    filename: 'anabolic-code.pdf',
    aliases: Object.freeze(['anabolic code', 'anabolic', 'code anabolic']),
  }),
  Object.freeze({
    slug: 'potentiel-genetique',
    name: 'Libérer son potentiel génétique',
    filename: 'potentiel-genetique.pdf',
    aliases: Object.freeze([
      'liberer son potentiel genetique',
      'liberer son potentiel genetique en 10 semaines',
      'liberer son potentiel',
      'potentiel genetique',
      '10 semaines',
    ]),
  }),
  Object.freeze({
    slug: '4-semaines-shred',
    name: '4 semaines pour être SHRED',
    filename: '4-semaines-shred.pdf',
    aliases: Object.freeze([
      '4 semaines pour etre shred perte de gras et prise de muscles',
      'ebook 49 00 eur 4 semaines pour etre shred',
      'ebook 4 semaines pour etre shred',
      '4 semaines pour etre shred',
      'perte de gras et prise de muscles',
      '4 semaines shred',
      'semaines shred',
      'pour etre shred',
      'perte de gras',
      'prise de muscles',
      '4 semaines',
      'shred',
    ]),
  }),
  Object.freeze({
    slug: 'bioenergetique-timing-nutrition',
    name: 'Bioénergétique et timing de la nutrition',
    filename: 'bioenergetique-timing-nutrition.pdf',
    aliases: Object.freeze([
      'bioenergetique',
      'bioenergetique et timing',
      'bioenergetique timing',
      'bioenergetique et timing de la nutrition',
    ]),
  }),
]);

const EBOOK_BY_SLUG = new Map(EBOOKS.map((ebook) => [ebook.slug, ebook]));
const EBOOK_BY_NAME = new Map(EBOOKS.map((ebook) => [ebook.name, ebook]));
const GENERIC_MATCH_WORDS = new Set(['ebook', 'ebooks', 'semaines', 'semaine']);
const GENERIC_EBOOK_KEYS = new Set([
  '4 semaines',
  '10 semaines',
  'semaines shred',
  'perte de gras',
  'prise de muscles',
  'shred',
]);

function getDownloadBaseUrl(req, env = process.env) {
  const configured = String(env.DOWNLOAD_BASE_URL || env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (req) {
    const protocol = req.get?.('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get?.('host');
    if (host) return `${protocol}://${host}`;
  }
  return DEFAULT_DOWNLOAD_BASE_URL;
}

function getStorageDir(env = process.env) {
  return String(env.EBOOK_STORAGE_DIR || DEFAULT_STORAGE_DIR).trim() || DEFAULT_STORAGE_DIR;
}

function getTokenSecret(env = process.env) {
  const secret = String(env.DOWNLOAD_TOKEN_SECRET || env.DOWNLOAD_SIGNING_SECRET || '').trim();
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('DOWNLOAD_TOKEN_SECRET obligatoire en production');
  }
  return 'dev-only-download-token-secret';
}

function getTokenTtlSeconds(env = process.env) {
  const configured = Number(env.DOWNLOAD_TOKEN_TTL_SECONDS);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return DEFAULT_TOKEN_TTL_SECONDS;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function signPayload(payloadPart, env = process.env) {
  return crypto
    .createHmac('sha256', getTokenSecret(env))
    .update(payloadPart)
    .digest('base64url');
}

function signDownloadToken({ slug, customerEmail, orderId, ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS, now = new Date() }, env = process.env) {
  const ebook = EBOOK_BY_SLUG.get(String(slug || ''));
  if (!ebook) throw new Error('Ebook inconnu');
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const payload = {
    v: 1,
    slug: ebook.slug,
    email: String(customerEmail || '').trim().toLowerCase() || undefined,
    orderId: String(orderId || '').trim() || undefined,
    iat: nowSeconds,
    exp: nowSeconds + Number(ttlSeconds || DEFAULT_TOKEN_TTL_SECONDS),
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  return `${payloadPart}.${signPayload(payloadPart, env)}`;
}

function verifyDownloadToken(token, expectedSlug, options = {}) {
  const env = options.env || process.env;
  const [payloadPart, suppliedSignature] = String(token || '').split('.');
  if (!payloadPart || !suppliedSignature) {
    return { ok: false, status: 403, code: 'missing_token' };
  }
  const expectedSignature = signPayload(payloadPart, env);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return { ok: false, status: 403, code: 'invalid_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch (error) {
    return { ok: false, status: 403, code: 'invalid_payload' };
  }

  const nowSeconds = Math.floor((options.now || new Date()).getTime() / 1000);
  if (payload.v !== 1 || payload.slug !== expectedSlug) {
    return { ok: false, status: 403, code: 'slug_mismatch' };
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds) {
    return { ok: false, status: 410, code: 'expired_token' };
  }
  return { ok: true, payload };
}

function buildSignedDownloadUrl(ebook, options = {}) {
  const baseUrl = options.baseUrl || getDownloadBaseUrl(options.req, options.env || process.env);
  const token = signDownloadToken({
    slug: ebook.slug,
    customerEmail: options.customerEmail,
    orderId: options.orderId,
    ttlSeconds: options.ttlSeconds || getTokenTtlSeconds(options.env || process.env),
    now: options.now,
  }, options.env || process.env);
  const url = new URL(`/download/${ebook.slug}`, baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function findEbookByName(productName) {
  const cleanName = normalizeEbookLabel(productName);
  if (!cleanName) return null;

  for (const ebook of EBOOKS) {
    if (normalizeEbookLabel(ebook.name) === cleanName) return ebook;
    const aliases = [...ebook.aliases].sort((a, b) => b.length - a.length);
    for (const alias of aliases) {
      const cleanAlias = normalizeEbookLabel(alias);
      const isGenericKey = GENERIC_EBOOK_KEYS.has(cleanAlias);
      const nameWords = cleanName.split(/\s+/).filter((word) => word.length > 2 && !GENERIC_MATCH_WORDS.has(word));
      const aliasWords = cleanAlias.split(/\s+/).filter((word) => word.length > 2 && !GENERIC_MATCH_WORDS.has(word));
      const fullMatch = cleanName.includes(cleanAlias) || cleanAlias.includes(cleanName);
      const sharedWordCount = nameWords.filter((nameWord) =>
        aliasWords.some((aliasWord) => nameWord.includes(aliasWord) || aliasWord.includes(nameWord))
      ).length;
      const wordMatch = sharedWordCount >= 2;
      const shredRelated = (
        cleanName.includes('shred') || cleanName.includes('perte') || cleanName.includes('gras') || cleanName.includes('muscles')
      ) && (
        cleanAlias.includes('shred') || cleanAlias.includes('perte') || cleanAlias.includes('gras') || cleanAlias.includes('muscles')
      );
      const ebookShred = cleanName.includes('ebook')
        && (cleanName.includes('shred') || cleanName.includes('4 semaines') || cleanName.includes('semaines'))
        && (cleanAlias.includes('shred') || cleanAlias.includes('4 semaines') || cleanAlias.includes('semaines'));

      if (isGenericKey && !ebookShred && !cleanName.includes('shred')) continue;
      if (fullMatch || (wordMatch && nameWords.length >= 2) || shredRelated || ebookShred) return ebook;
    }
  }
  return null;
}

function buildEbookLink(productName, options = {}) {
  const ebook = EBOOK_BY_NAME.get(String(productName || '').trim()) || findEbookByName(productName);
  if (!ebook) return null;
  return {
    name: ebook.name,
    slug: ebook.slug,
    link: buildSignedDownloadUrl(ebook, options),
  };
}

function getEbookFilePath(ebook, env = process.env) {
  const storageDir = path.resolve(getStorageDir(env));
  const filePath = path.resolve(storageDir, ebook.filename);
  if (!filePath.startsWith(`${storageDir}${path.sep}`)) {
    throw new Error('Chemin ebook invalide');
  }
  return filePath;
}

function createDownloadHandler(options = {}) {
  return function downloadEbook(req, res) {
    const env = options.env || process.env;
    const slug = String(req.params.slug || '').trim();
    const ebook = EBOOK_BY_SLUG.get(slug);
    if (!ebook) return res.status(404).type('text/plain').send('Ebook introuvable');

    let verification;
    try {
      verification = verifyDownloadToken(req.query.token, slug, {
        env,
        now: options.now ? options.now() : new Date(),
      });
    } catch (error) {
      return res.status(500).type('text/plain').send('Configuration téléchargement incomplète');
    }
    if (!verification.ok) {
      const message = verification.code === 'expired_token'
        ? 'Lien de téléchargement expiré. Réponds à ton email de commande pour le renouveler.'
        : 'Lien de téléchargement invalide.';
      return res.status(verification.status).type('text/plain').send(message);
    }

    const filePath = getEbookFilePath(ebook, env);
    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        return res.status(503).type('text/plain').send('Fichier ebook indisponible temporairement.');
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Content-Type', 'application/pdf');
      res.download(filePath, ebook.filename);
    });
  };
}

function getDownloadReadiness(env = process.env) {
  const storageDir = getStorageDir(env);
  const tokenSecret = Boolean(String(env.DOWNLOAD_TOKEN_SECRET || env.DOWNLOAD_SIGNING_SECRET || '').trim());
  const files = Object.fromEntries(EBOOKS.map((ebook) => {
    const filePath = getEbookFilePath(ebook, env);
    let available = false;
    try {
      available = fs.statSync(filePath).isFile();
    } catch (error) {
      available = false;
    }
    return [ebook.slug, { filename: ebook.filename, available }];
  }));
  return {
    storageDir,
    tokenSecret,
    ttlSeconds: getTokenTtlSeconds(env),
    baseUrl: getDownloadBaseUrl(null, env),
    files,
  };
}

module.exports = {
  DEFAULT_STORAGE_DIR,
  DEFAULT_TOKEN_TTL_SECONDS,
  EBOOKS,
  buildEbookLink,
  buildSignedDownloadUrl,
  createDownloadHandler,
  findEbookByName,
  getDownloadReadiness,
  getDownloadBaseUrl,
  getEbookFilePath,
  getStorageDir,
  getTokenTtlSeconds,
  normalizeEbookLabel,
  signDownloadToken,
  verifyDownloadToken,
};
