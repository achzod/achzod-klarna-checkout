const assert = require('node:assert/strict');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'dummy';

const { PRODUCTS } = require('./checkout-security');
const { findEbookLink, isCoachingProduct } = require('./index');

function cleanProductName(value) {
  const original = String(value || '');
  const normalized = original
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const durationMatch = normalized.match(/(?:^|[^0-9])(4|8|12)\s+semaines?\b/);
  const duration = durationMatch ? durationMatch[1] : '';

  if (normalized.includes('private lab') && duration) return `Private Lab ${duration} semaines`;
  if (normalized.includes('essential') && duration) return `Essential ${duration} semaines`;
  if (normalized.includes('elite') && duration) return `Elite ${duration} semaines`;
  if (normalized.includes('coaching sans suivi')) return 'Coaching sans suivi';
  if (normalized.includes('anabolic code')) return 'Anabolic Code';
  if (normalized.includes('bioenergetique')) return 'Bioénergétique et timing de la nutrition';
  if (normalized.includes('liberer son potentiel')) return 'Libérer son potentiel génétique';
  if (normalized.includes('shred')) return '4 semaines pour être SHRED';
  return original.trim().slice(0, 120);
}

for (const product of PRODUCTS) {
  const sampleLabel = product.kind === 'coaching'
    ? `COACHING ${product.name.toUpperCase()} € ${(product.amount / 100).toFixed(2).replace('.', ',')} EUR Qté: 1`
    : `EBOOK ${product.name} € ${(product.amount / 100).toFixed(2).replace('.', ',')} EUR`;

  const frontendLabel = cleanProductName(sampleLabel);
  assert.equal(frontendLabel, product.name, `frontend mapping incorrect pour ${product.name}`);

  if (product.kind === 'coaching') {
    assert.equal(isCoachingProduct(product.name), true, `coaching non détecté: ${product.name}`);
    assert.equal(findEbookLink(product.name), null, `coaching routé comme ebook: ${product.name}`);
  } else {
    assert.equal(isCoachingProduct(product.name), false, `ebook détecté comme coaching: ${product.name}`);
    const ebook = findEbookLink(product.name);
    assert.ok(ebook, `ebook sans lien détecté: ${product.name}`);
    assert.ok(/^https?:\/\//.test(ebook.link), `lien ebook invalide: ${product.name}`);
  }
}

console.log(`test-product-routing: OK (${PRODUCTS.length} produits vérifiés)`);
