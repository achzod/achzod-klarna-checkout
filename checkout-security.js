'use strict';

function normalizeProductName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const PRODUCTS = [
  { name: 'Coaching sans suivi', amount: 9900, priceId: 'price_1SdvMiBTm0rdlVFq1quX3O14', aliases: ['coaching sans suivi'] },
  { name: 'Starter', amount: 14900, priceId: 'price_1SdvMiBTm0rdlVFqqNzpgaPc', aliases: ['starter'] },
  { name: 'Essential 4 semaines', amount: 24900, priceId: 'price_1SdvMiBTm0rdlVFqLfsmZktn', aliases: ['essential 4 semaines', '4 semaines essential'] },
  { name: 'Essential 8 semaines', amount: 39900, priceId: 'price_1SdvMhBTm0rdlVFqH5DLanUx', aliases: ['essential 8 semaines', '8 semaines essential'] },
  { name: 'Essential 12 semaines', amount: 54900, priceId: 'price_1SdvMhBTm0rdlVFqwk0q6GSp', aliases: ['essential 12 semaines', '12 semaines essential'] },
  { name: 'Elite 4 semaines', amount: 39900, priceId: 'price_1SdvMgBTm0rdlVFqzHfzhM8K', aliases: ['elite 4 semaines', '4 semaines elite'] },
  { name: 'Elite 8 semaines', amount: 64900, priceId: 'price_1SdvMgBTm0rdlVFqN0ApjtgB', aliases: ['elite 8 semaines', '8 semaines elite'] },
  { name: 'Elite 12 semaines', amount: 89900, priceId: 'price_1SdvMgBTm0rdlVFqstDCjSEg', aliases: ['elite 12 semaines', '12 semaines elite'] },
  { name: 'Private Lab 4 semaines', amount: 49900, priceId: 'price_1SdvMfBTm0rdlVFq3DbslVyj', aliases: ['private lab 4 semaines', '4 semaines private lab', 'achzod private lab 4 semaines'] },
  { name: 'Private Lab 8 semaines', amount: 79900, priceId: 'price_1SdvMfBTm0rdlVFq1RDNoRrL', aliases: ['private lab 8 semaines', '8 semaines private lab', 'achzod private lab 8 semaines'] },
  { name: 'Private Lab 12 semaines', amount: 119900, priceId: 'price_1SdvMeBTm0rdlVFqtP697rjn', aliases: ['private lab 12 semaines', '12 semaines private lab', 'achzod private lab 12 semaines'] },
  { name: 'Anabolic Code', amount: 7900, priceId: 'price_1SdvMeBTm0rdlVFqZEmcaDNm', aliases: ['anabolic code'] },
  { name: 'Libérer son potentiel génétique', amount: 4900, priceId: 'price_1SdvMeBTm0rdlVFqTi8xNboT', aliases: ['liberer son potentiel', 'liberer son potentiel genetique', 'liberer son potentiel genetique en 10 semaines'] },
  { name: '4 semaines pour être SHRED', amount: 4900, priceId: 'price_1SdvMdBTm0rdlVFqHi638498', aliases: ['4 semaines pour etre shred', '4 semaines pour etre shred perte de gras et prise de muscles', '4 semaines shred'] },
  { name: 'Bioénergétique et timing de la nutrition', amount: 5900, priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', aliases: ['bioenergetique', 'bioenergetique et timing', 'bioenergetique et timing de la nutrition'] },
];

const PRODUCT_BY_ALIAS = new Map();
for (const product of PRODUCTS) {
  for (const alias of product.aliases) {
    const normalized = normalizeProductName(alias);
    if (PRODUCT_BY_ALIAS.has(normalized)) throw new Error(`Alias produit dupliqué: ${normalized}`);
    PRODUCT_BY_ALIAS.set(normalized, Object.freeze(product));
  }
}

class CheckoutValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CheckoutValidationError';
    this.statusCode = 400;
  }
}

function validateAndPriceCart(body) {
  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    throw new CheckoutValidationError('Panier vide');
  }
  if (body.items.length > 20) {
    throw new CheckoutValidationError('Panier invalide');
  }

  const pricedItems = body.items.map((item) => {
    if (!item || typeof item.name !== 'string') {
      throw new CheckoutValidationError('Produit invalide');
    }
    const product = PRODUCT_BY_ALIAS.get(normalizeProductName(item.name));
    if (!product) {
      throw new CheckoutValidationError(`Produit inconnu: ${String(item.name).slice(0, 80)}`);
    }
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new CheckoutValidationError(`Quantité invalide pour ${product.name}`);
    }
    return { ...product, quantity };
  });

  const totalCents = pricedItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new CheckoutValidationError('Total du panier invalide');
  }

  // Les montants et codes venant du navigateur ne sont jamais une source de prix.
  // Un total transmis est accepté seulement s'il correspond exactement au catalogue.
  if (body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== '') {
    const clientTotalCents = Math.round(Number(body.totalAmount) * 100);
    if (!Number.isFinite(Number(body.totalAmount)) || clientTotalCents !== totalCents) {
      throw new CheckoutValidationError('Le total transmis ne correspond pas au prix catalogue');
    }
  }
  if (body.discountCode) {
    throw new CheckoutValidationError('Ce code promo doit être validé côté serveur');
  }

  return { items: pricedItems, totalCents };
}

function buildLineItems(body, useStripePriceIds) {
  const cart = validateAndPriceCart(body);
  return {
    ...cart,
    lineItems: cart.items.map((item) => useStripePriceIds
      ? { price: item.priceId, quantity: item.quantity }
      : {
          price_data: {
            currency: 'eur',
            product_data: { name: item.name },
            unit_amount: item.amount,
          },
          quantity: item.quantity,
        }),
  };
}

module.exports = {
  CheckoutValidationError,
  PRODUCTS,
  buildLineItems,
  normalizeProductName,
  validateAndPriceCart,
};
