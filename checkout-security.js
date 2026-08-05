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

function normalizeCheckoutLabel(value) {
  return normalizeProductName(value)
    // Supprime les montants injectés par le checkout Webflow, ex: "649 00 eur"
    .replace(/\b\d{2,4}\s\d{2}\s(?:eur|usd|aed)\b/g, ' ')
    .replace(/\b(?:eur|usd|aed)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const PRODUCTS = [
  { name: 'Coaching sans suivi', kind: 'coaching', amount: 9900, priceId: 'price_1SdvMiBTm0rdlVFq1quX3O14', aliases: ['coaching sans suivi'] },
  { name: 'Essential 4 semaines', kind: 'coaching', amount: 24900, priceId: 'price_1SdvMiBTm0rdlVFqLfsmZktn', aliases: ['essential 4 semaines', '4 semaines essential', 'coaching essential 4 semaines', 'coaching essential 4 semaines essential'] },
  { name: 'Essential 8 semaines', kind: 'coaching', amount: 39900, priceId: 'price_1SdvMhBTm0rdlVFqH5DLanUx', aliases: ['essential 8 semaines', '8 semaines essential', 'coaching essential 8 semaines', 'coaching essential 8 semaines essential'] },
  { name: 'Essential 12 semaines', kind: 'coaching', amount: 54900, priceId: 'price_1SdvMhBTm0rdlVFqwk0q6GSp', aliases: ['essential 12 semaines', '12 semaines essential', 'coaching essential 12 semaines', 'coaching essential 12 semaines essential'] },
  { name: 'Elite 4 semaines', kind: 'coaching', amount: 39900, priceId: 'price_1SdvMgBTm0rdlVFqzHfzhM8K', aliases: ['elite 4 semaines', '4 semaines elite', 'coaching elite 4 semaines', 'coaching elite 4 semaines elite'] },
  { name: 'Elite 8 semaines', kind: 'coaching', amount: 64900, priceId: 'price_1SdvMgBTm0rdlVFqN0ApjtgB', aliases: ['elite 8 semaines', '8 semaines elite', 'coaching elite 8 semaines', 'coaching elite 8 semaines elite'] },
  { name: 'Elite 12 semaines', kind: 'coaching', amount: 89900, priceId: 'price_1SdvMgBTm0rdlVFqstDCjSEg', aliases: ['elite 12 semaines', '12 semaines elite', 'coaching elite 12 semaines', 'coaching elite 12 semaines elite'] },
  { name: 'Private Lab 4 semaines', kind: 'coaching', amount: 49900, priceId: 'price_1SdvMfBTm0rdlVFq3DbslVyj', aliases: ['private lab 4 semaines', '4 semaines private lab', 'achzod private lab 4 semaines', 'coaching private lab 4 semaines', 'coaching private lab 4 semaines private lab'] },
  { name: 'Private Lab 8 semaines', kind: 'coaching', amount: 79900, priceId: 'price_1SdvMfBTm0rdlVFq1RDNoRrL', aliases: ['private lab 8 semaines', '8 semaines private lab', 'achzod private lab 8 semaines', 'coaching private lab 8 semaines', 'coaching private lab 8 semaines private lab'] },
  { name: 'Private Lab 12 semaines', kind: 'coaching', amount: 119900, priceId: 'price_1SdvMeBTm0rdlVFqtP697rjn', aliases: ['private lab 12 semaines', '12 semaines private lab', 'achzod private lab 12 semaines', 'coaching private lab 12 semaines', 'coaching private lab 12 semaines private lab'] },
  { name: 'Anabolic Code', kind: 'ebook', amount: 7900, priceId: 'price_1SdvMeBTm0rdlVFqZEmcaDNm', aliases: ['anabolic code'] },
  { name: 'Libérer son potentiel génétique', kind: 'ebook', amount: 4900, priceId: 'price_1SdvMeBTm0rdlVFqTi8xNboT', aliases: ['liberer son potentiel', 'liberer son potentiel genetique', 'liberer son potentiel genetique en 10 semaines'] },
  { name: '4 semaines pour être SHRED', kind: 'ebook', amount: 4900, priceId: 'price_1SdvMdBTm0rdlVFqHi638498', aliases: ['4 semaines pour etre shred', '4 semaines pour etre shred perte de gras et prise de muscles', '4 semaines shred'] },
  { name: 'Bioénergétique et timing de la nutrition', kind: 'ebook', amount: 5900, priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', aliases: ['bioenergetique', 'bioenergetique et timing', 'bioenergetique et timing de la nutrition'] },
];

// Rétrocompatibilité : conservé pour ne pas casser les imports. Les codes promo
// sont désormais acceptés dynamiquement (voir validateAndPriceCart).
const PROMOTIONS = Object.freeze({});

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

function normalizePromotionCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 64);
}

// Remise maximale autorisée sur le total client (protection anti-fraude basique).
const MIN_TOTAL_RATIO = 0.10;      // total client >= 10% du sous-total
const MIN_TOTAL_CENTS = 100;       // et jamais < 1€
const MIN_UNIT_PRICE_CENTS = 500;  // 5€
const MAX_UNIT_PRICE_CENTS = 500000; // 5000€

function toCentsFromNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) ? cents : null;
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
    const product = PRODUCT_BY_ALIAS.get(normalizeProductName(item.name))
      || PRODUCT_BY_ALIAS.get(normalizeCheckoutLabel(item.name));
    if (!product) {
      throw new CheckoutValidationError(`Produit inconnu: ${String(item.name).slice(0, 80)}`);
    }
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new CheckoutValidationError(`Quantité invalide pour ${product.name}`);
    }
    // Prix unitaire : Webflow est source de vérité (les prix affichés peuvent
    // avoir été mis à jour côté site sans update backend). Fallback catalogue.
    // Bornes raisonnables pour éviter les abus flagrants.
    const clientCents = toCentsFromNumber(item.price);
    let unitAmount = clientCents !== null ? clientCents : product.amount;
    if (unitAmount < MIN_UNIT_PRICE_CENTS) unitAmount = MIN_UNIT_PRICE_CENTS;
    if (unitAmount > MAX_UNIT_PRICE_CENTS) unitAmount = MAX_UNIT_PRICE_CENTS;
    return { ...product, quantity, amount: unitAmount };
  });

  const subtotalCents = pricedItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) {
    throw new CheckoutValidationError('Total du panier invalide');
  }

  const requestedCode = normalizePromotionCode(body.discountCode || body.promoCode) || null;

  let clientTotalCents = null;
  if (body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== '') {
    const clientTotal = Number(body.totalAmount);
    if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
      throw new CheckoutValidationError('Total transmis invalide');
    }
    clientTotalCents = Math.round(clientTotal * 100);
  }

  let discountCents = 0;
  let totalCents = subtotalCents;
  let clientTotalIgnored = false;

  if (clientTotalCents !== null && clientTotalCents < subtotalCents) {
    const floor = Math.max(MIN_TOTAL_CENTS, Math.round(subtotalCents * MIN_TOTAL_RATIO));
    if (clientTotalCents < floor) {
      // Total suspicieusement bas -> on ignore la remise, on garde le prix plein.
      // La commande passe quand même pour ne jamais bloquer une vente.
      clientTotalIgnored = true;
    } else {
      discountCents = subtotalCents - clientTotalCents;
      totalCents = clientTotalCents;
    }
  }

  return {
    items: pricedItems,
    subtotalCents,
    totalCents,
    discountCents,
    promotionCode: requestedCode,
    clientTotalIgnored,
  };
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
  PROMOTIONS,
  PRODUCTS,
  buildLineItems,
  normalizeProductName,
  normalizePromotionCode,
  validateAndPriceCart,
};
