const assert = require('node:assert/strict');

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'dummy';

const { findEbookLink, isCoachingProduct, normalizeProductLabel } = require('./index');

assert.equal(normalizeProductLabel('Élite 8 semaines!'), 'elite 8 semaines');

assert.equal(isCoachingProduct('Elite 8 semaines'), true);
assert.equal(findEbookLink('Elite 8 semaines'), null);
assert.equal(findEbookLink('Private Lab 12 semaines'), null);
assert.equal(findEbookLink('Suivi 4 semaines'), null);

const anabolic = findEbookLink('Anabolic Code');
assert.ok(anabolic, 'Anabolic Code doit matcher un ebook');

const potentiel = findEbookLink('Libérer son potentiel génétique en 10 semaines');
assert.ok(potentiel, 'Libérer son potentiel doit matcher un ebook');

const shred = findEbookLink('4 semaines pour être SHRED');
assert.ok(shred, 'SHRED doit matcher un ebook');

console.log('test-order-matching: OK');
