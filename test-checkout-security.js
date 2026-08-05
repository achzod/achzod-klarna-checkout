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

test('applique les trois codes ApexLabs aux coachings', () => {
  for (const [discountCode, discountCents] of [['BIOSCAN59', 5900], ['ULTIMATE79', 7900], ['BLOOD99', 9900]]) {
    const cart = validateAndPriceCart({ discountCode, items: [{ name: 'Essential 12 semaines', quantity: 2 }] });
    assert.equal(cart.subtotalCents, 109800);
    assert.equal(cart.discountCents, discountCents);
    assert.equal(cart.totalCents, 109800 - discountCents);
    assert.equal(cart.promotionCode, discountCode);
  }
});

test('récupère quantité 2 et BLOOD99 depuis l’ancien bouton Webflow', () => {
  const cart = validateAndPriceCart({
    totalAmount: 999,
    items: [{ name: 'Essential 12 semaines', quantity: 1 }],
  });
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.subtotalCents, 109800);
  assert.equal(cart.discountCents, 9900);
  assert.equal(cart.promotionCode, 'BLOOD99');
  assert.equal(cart.totalCents, 99900);
});

test('accepte une remise ApexLabs sur panier mixte avec quantités exactes', () => {
  const cart = validateAndPriceCart({
    totalAmount: 1078,
    items: [
      { name: 'Essential 12 semaines', quantity: 2 },
      { name: 'Anabolic Code', quantity: 1 },
    ],
  });
  assert.equal(cart.subtotalCents, 117700);
  assert.equal(cart.promotionCode, 'BLOOD99');
  assert.equal(cart.totalCents, 107800);
});

test('répare le panier exact Elite 4 + Essential 8 malgré le mauvais total Webflow', () => {
  const cart = validateAndPriceCart({
    totalAmount: 399,
    items: [
      { name: 'COACHING ELITE € 399,00 EUR 4 semaines - ELITE', quantity: 1 },
      { name: 'COACHING ESSENTIAL € 399,00 EUR 8 semaines Essential', quantity: 1 },
    ],
  });
  assert.equal(cart.subtotalCents, 79800);
  assert.equal(cart.discountCents, 0);
  assert.equal(cart.totalCents, 79800);
  assert.equal(cart.promotionCode, null);
  assert.equal(cart.clientTotalIgnored, true);
  assert.deepEqual(cart.items.map((item) => item.name), ['Elite 4 semaines', 'Essential 8 semaines']);
});

test('ne répare jamais un faux total avec code, ebook ou quantité explicite', () => {
  rejects({
    discountCode: 'BLOOD99',
    totalAmount: 399,
    items: [{ name: 'Elite 4 semaines' }, { name: 'Essential 8 semaines' }],
  }, /code promo/);
  rejects({
    totalAmount: 398,
    items: [{ name: 'Elite 4 semaines' }, { name: 'Anabolic Code' }],
  }, /prix catalogue/);
  rejects({
    totalAmount: 399,
    items: [{ name: 'Elite 4 semaines', quantity: 2 }, { name: 'Essential 8 semaines' }],
  }, /prix catalogue/);
});

test('applique FAQ50 uniquement aux ebooks', () => {
  const cart = validateAndPriceCart({
    discountCode: 'FAQ50',
    items: [{ name: 'Anabolic Code' }, { name: 'Bioénergétique' }],
  });
  assert.equal(cart.subtotalCents, 13800);
  assert.equal(cart.discountCents, 6900);
  assert.equal(cart.totalCents, 6900);
  rejects({ discountCode: 'FAQ50', items: [{ name: 'Essential 4 semaines' }] }, /ne s’applique pas/);
});

test('bloque les remises manipulées, les codes inconnus et Starter supprimé', () => {
  rejects({ totalAmount: 998, items: [{ name: 'Essential 12 semaines', quantity: 1 }] }, /code promo autorisé/);
  rejects({ discountCode: 'FAUX99', items: [{ name: 'Essential 12 semaines' }] }, /Code promo inconnu/);
  rejects({ items: [{ name: 'Starter' }] }, /Produit inconnu/);
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
