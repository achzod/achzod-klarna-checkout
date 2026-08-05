'use strict';

const assert = require('node:assert/strict');
const { PRODUCTS, buildLineItems, validateAndPriceCart } = require('./checkout-security');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function rejects(body, pattern) {
  assert.throws(() => validateAndPriceCart(body), pattern);
}

test('recalcule 236 € pour les quatre ebooks, sans croire les prix client', () => {
  const body = { items: [
    { name: 'ANABOLIC CODE', price: 0.5 },
    { name: 'Bioénergétique', price: 0.5 },
    { name: 'Libérer son potentiel génétique en 10 semaines', price: 0.5 },
    { name: '4 Semaines pour être SHRED', price: 0.5 },
  ] };
  const cart = validateAndPriceCart(body);
  assert.equal(cart.totalCents, 23600);
  assert.deepEqual(cart.items.map(item => item.amount), [7900, 5900, 4900, 4900]);
});

test('bloque le total Lucas manipulé à 2 €', () => {
  rejects({
    totalAmount: 2,
    items: [
      { name: 'Anabolic Code', price: 0.5 },
      { name: 'Bioénergétique', price: 0.5 },
      { name: 'Libérer son potentiel génétique', price: 0.5 },
      { name: '4 semaines pour être SHRED', price: 0.5 },
    ],
  }, /prix catalogue/);
});

test('ignore un prix unitaire client falsifié quand aucun total n’est envoyé', () => {
  const result = buildLineItems({ items: [{ name: 'Anabolic Code', price: 0.01 }] }, false);
  assert.equal(result.lineItems[0].price_data.unit_amount, 7900);
});

test('utilise le Price ID catalogue pour Stripe UAE', () => {
  const result = buildLineItems({ items: [{ name: 'Anabolic Code', quantity: 1 }] }, true);
  assert.deepEqual(result.lineItems, [{ price: 'price_1SdvMeBTm0rdlVFqZEmcaDNm', quantity: 1 }]);
});

test('accepte un total informatif exact', () => {
  assert.equal(validateAndPriceCart({
    totalAmount: 236,
    items: [
      { name: 'Anabolic Code' },
      { name: 'Bioénergétique' },
      { name: 'Libérer son potentiel génétique' },
      { name: '4 semaines shred' },
    ],
  }).totalCents, 23600);
});

test('bloque produit inconnu, quantité fractionnaire, nulle et excessive', () => {
  rejects({ items: [{ name: 'Ebook inventé', price: 1 }] }, /Produit inconnu/);
  rejects({ items: [{ name: 'Anabolic Code', quantity: 0 }] }, /Quantité invalide/);
  rejects({ items: [{ name: 'Anabolic Code', quantity: 1.5 }] }, /Quantité invalide/);
  rejects({ items: [{ name: 'Anabolic Code', quantity: 11 }] }, /Quantité invalide/);
});

test('bloque les faux noms contenant partiellement un vrai nom', () => {
  rejects({ items: [{ name: 'Anabolic Code piraté', price: 0.01 }] }, /Produit inconnu/);
});

test('accepte les libellés checkout Webflow enrichis pour Klarna', () => {
  const cart = validateAndPriceCart({
    items: [{ name: 'COACHING ELITE € 649,00 EUR 8 semaines - ELITE', price: 649 }],
  });
  assert.equal(cart.totalCents, 64900);
  assert.equal(cart.items[0].name, 'Elite 8 semaines');
});

test('récupère une quantité implicite mono-produit depuis le total checkout', () => {
  const cart = validateAndPriceCart({
    totalAmount: 1298,
    items: [{ name: 'COACHING ELITE € 649,00 EUR 8 semaines - ELITE', price: 649 }],
  });
  assert.equal(cart.totalCents, 129800);
  assert.equal(cart.items[0].name, 'Elite 8 semaines');
  assert.equal(cart.items[0].quantity, 2);
});

test('bloque un code promo non validé côté serveur', () => {
  rejects({ discountCode: 'FAUX99', items: [{ name: 'Starter' }] }, /validé côté serveur/);
});

test('protège chaque produit du catalogue contre prix et total falsifiés', () => {
  for (const product of PRODUCTS) {
    const name = product.aliases[0];
    const priced = validateAndPriceCart({ items: [{ name, price: 0.01 }] });
    assert.equal(priced.totalCents, product.amount, `${product.name}: prix client ignoré`);
    rejects({
      totalAmount: 0.01,
      items: [{ name, price: 0.01 }],
    }, /prix catalogue/);
  }
});

test('recalcule intégralement les paniers mixtes coaching et ebooks', () => {
  const cart = validateAndPriceCart({
    items: [
      { name: 'Essential 4 semaines', price: 0.01 },
      { name: 'Anabolic Code', price: 0.01 },
      { name: 'Bioénergétique', price: 0.01 },
    ],
  });
  assert.equal(cart.totalCents, 38700);
  rejects({
    totalAmount: 3,
    items: [
      { name: 'Essential 4 semaines', price: 1 },
      { name: 'Anabolic Code', price: 1 },
      { name: 'Bioénergétique', price: 1 },
    ],
  }, /prix catalogue/);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(error.stack);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} tests réussis`);
if (failed) process.exitCode = 1;
