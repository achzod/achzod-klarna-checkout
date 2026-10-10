'use strict';

const assert = require('node:assert/strict');
const { PRODUCTS, buildLineItems, validateAndPriceCart } = require('./checkout-security');

const LEGACY_EXPOSED_PROMOTIONS = {
  BIOSCAN59: { code: 'BIOSCAN59', amountOff: 5900 },
  ULTIMATE79: { code: 'ULTIMATE79', amountOff: 7900 },
  BLOOD99: { code: 'BLOOD99', amountOff: 9900 },
  DISCOVERY30: { code: 'DISCOVERY30', percentOff: 30, appliesTo: 'coaching' },
};

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function rejects(body, pattern) {
  assert.throws(() => validateAndPriceCart(body), pattern);
}

test('recalcule 216 € pour les quatre ebooks, sans croire les prix client', () => {
  const body = { items: [
    { name: 'ANABOLIC CODE', price: 0.5 },
    { name: 'Bioénergétique', price: 0.5 },
    { name: 'Libérer son potentiel génétique en 10 semaines', price: 0.5 },
    { name: '4 Semaines pour être SHRED', price: 0.5 },
  ] };
  const cart = validateAndPriceCart(body);
  assert.equal(cart.totalCents, 21600);
  assert.deepEqual(cart.items.map(item => item.amount), [5900, 5900, 4900, 4900]);
});

test('construit tous les paiements Stripe en EUR', () => {
  const cart = buildLineItems({ items: [{ name: 'Essential 8 semaines', quantity: 1 }] }, false);
  assert.equal(cart.lineItems[0].price_data.currency, 'eur');
  assert.equal(cart.totalCents, 39900);
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
  assert.equal(result.lineItems[0].price_data.unit_amount, 5900);
});

test('utilise le Price ID catalogue pour Stripe UAE', () => {
  const result = buildLineItems({ items: [{ name: 'Anabolic Code', quantity: 1 }] }, true);
  assert.deepEqual(result.lineItems, [{ price: 'price_1SdvMeBTm0rdlVFqZEmcaDNm', quantity: 1 }]);
});

test('accepte un total informatif exact', () => {
  assert.equal(validateAndPriceCart({
    totalAmount: 216,
    items: [
      { name: 'Anabolic Code' },
      { name: 'Bioénergétique' },
      { name: 'Libérer son potentiel génétique' },
      { name: '4 semaines shred' },
    ],
  }).totalCents, 21600);
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

test('accepte les libellés Webflow pollués par prix, quantité et HTML encodé', () => {
  const cart = validateAndPriceCart({
    items: [
      {
        name: 'Coaching ESSENTIAL€ 399,00 EUR8 semaines EssentialQté: 1%3Cli%3E%3Cspan%20data-w',
        price: 399,
      },
    ],
    totalAmount: 319.20,
    discountCode: 'ZOD20',
  });
  assert.deepEqual(cart.items.map((item) => item.name), ['Essential 8 semaines']);
  assert.equal(cart.subtotalCents, 39900);
  assert.equal(cart.totalCents, 31920);
});

test('refuse une quantité de coaching supérieure à un, explicite ou implicite', () => {
  rejects({
    totalAmount: 1298,
    items: [{ name: 'COACHING ELITE € 649,00 EUR 8 semaines - ELITE', price: 649, quantity: 1 }],
  }, /sans code promo autorisé/);
  rejects({
    items: [{ name: 'Elite 8 semaines', quantity: 2 }],
  }, /Une seule formule de coaching/);
});

test('refuse tous les codes d’avis exposés lors de l’incident du 9 octobre', () => {
  for (const discountCode of ['DISCOVERY30', 'BIOSCAN59', 'ULTIMATE79', 'BLOOD99', 'PEPTIDES20']) {
    rejects(
      { discountCode, items: [{ name: 'Essential 12 semaines', quantity: 1 }] },
      /Code promo inconnu/,
    );
  }
});

test('accepte un coaching unique accompagné d’ebooks', () => {
  const cart = validateAndPriceCart({
    items: [
      { name: 'Essential 12 semaines', quantity: 1 },
      { name: 'Anabolic Code', quantity: 1 },
    ],
  });
  assert.equal(cart.subtotalCents, 60800);
  assert.equal(cart.totalCents, 60800);
});

test('refuse plusieurs formules de coaching dans une même commande', () => {
  rejects({
    items: [
      { name: 'COACHING ELITE € 399,00 EUR 4 semaines - ELITE', quantity: 1 },
      { name: 'COACHING ESSENTIAL € 399,00 EUR 8 semaines Essential', quantity: 1 },
    ],
  }, /Une seule formule de coaching/);
});

test('ne répare jamais un faux total avec code, ebook ou quantité explicite', () => {
  rejects({
    discountCode: 'BLOOD99',
    totalAmount: 399,
    items: [{ name: 'Elite 4 semaines' }, { name: 'Essential 8 semaines' }],
  }, /Une seule formule de coaching/);
  rejects({
    totalAmount: 398,
    items: [{ name: 'Elite 4 semaines' }, { name: 'Anabolic Code' }],
  }, /prix catalogue/);
  rejects({
    totalAmount: 399,
    items: [{ name: 'Elite 4 semaines', quantity: 2 }, { name: 'Essential 8 semaines' }],
  }, /Une seule formule de coaching/);
});

test('applique FAQ50 uniquement aux ebooks', () => {
  const cart = validateAndPriceCart({
    discountCode: 'FAQ50',
    items: [{ name: 'Anabolic Code' }, { name: 'Bioénergétique' }],
  });
  assert.equal(cart.subtotalCents, 11800);
  assert.equal(cart.discountCents, 5900);
  assert.equal(cart.totalCents, 5900);
  rejects({ discountCode: 'FAQ50', items: [{ name: 'Essential 4 semaines' }] }, /ne s’applique pas/);
});

test('applique un code Stripe dynamique dans les limites de quantité autorisées', () => {
  const promotions = {
    VIP17: { code: 'VIP17', percentOff: 17 },
    CLIENT123: { code: 'CLIENT123', amountOff: 12300 },
  };
  for (const product of PRODUCTS) {
    const maxQuantity = product.kind === 'coaching' ? 1 : 10;
    for (let quantity = 1; quantity <= maxQuantity; quantity += 1) {
      const subtotalCents = product.amount * quantity;
      const percentDiscount = Math.round(subtotalCents * 17 / 100);
      const percentCart = validateAndPriceCart({
        discountCode: 'vip17',
        totalAmount: (subtotalCents - percentDiscount) / 100,
        items: [{ name: product.aliases[0], quantity }],
      }, promotions);
      assert.equal(percentCart.totalCents, subtotalCents - percentDiscount);
      assert.equal(percentCart.promotionCode, 'VIP17');

      const amountDiscount = Math.min(12300, subtotalCents);
      if (amountDiscount < subtotalCents) {
        const amountCart = validateAndPriceCart({
          discountCode: 'client123',
          totalAmount: (subtotalCents - amountDiscount) / 100,
          items: [{ name: product.aliases[0], quantity }],
        }, promotions);
        assert.equal(amountCart.totalCents, subtotalCents - amountDiscount);
        assert.equal(amountCart.promotionCode, 'CLIENT123');
      }
    }
  }
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
  assert.equal(cart.totalCents, 36700);
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
