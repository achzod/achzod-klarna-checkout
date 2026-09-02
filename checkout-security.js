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

function resolveProduct(value) {
  const exact = PRODUCT_BY_ALIAS.get(normalizeProductName(value))
    || PRODUCT_BY_ALIAS.get(normalizeCheckoutLabel(value));
  if (exact) return exact;

  // Webflow peut concaténer le nom, le prix, la quantité et même du HTML
  // encodé dans descriptionwrapper. On identifie alors la formule à partir
  // des marqueurs stables (gamme + durée), sans utiliser le reste du texte.
  const rawLabel = normalizeProductName(value);
  const label = normalizeCheckoutLabel(value);
  const hasCheckoutNoise = /\b(?:ebook|coaching|qte|eur|usd|aed|\d+)\b/.test(rawLabel);
  // Webflow colle parfois la devise et la durée: "EUR8 semaines".
  const durationMatch = label.match(/(?:^|[^0-9])(4|8|12)\s+semaines?\b/);
  const duration = durationMatch ? Number(durationMatch[1]) : null;
  let canonicalName = null;

  if (label.includes('private lab') && duration) canonicalName = `Private Lab ${duration} semaines`;
  else if (label.includes('essential') && duration) canonicalName = `Essential ${duration} semaines`;
  else if (label.includes('elite') && duration) canonicalName = `Elite ${duration} semaines`;
  else if (label.includes('coaching sans suivi')) canonicalName = 'Coaching sans suivi';
  else if (label.includes('anabolic code') && hasCheckoutNoise) canonicalName = 'Anabolic Code';
  else if (label.includes('bioenergetique')) canonicalName = 'Bioénergétique et timing de la nutrition';
  else if (label.includes('liberer son potentiel')) canonicalName = 'Libérer son potentiel génétique';
  else if (label.includes('shred')) canonicalName = '4 semaines pour être SHRED';

  return canonicalName
    ? PRODUCTS.find((product) => product.name === canonicalName) || null
    : null;
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

function toCentsFromNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

const DEFAULT_PROMOTION_RULES = Object.freeze({
  BIOSCAN59: Object.freeze({ code: 'BIOSCAN59', amountOff: 5900 }),
  ULTIMATE79: Object.freeze({ code: 'ULTIMATE79', amountOff: 7900 }),
  BLOOD99: Object.freeze({ code: 'BLOOD99', amountOff: 9900 }),
  FAQ50: Object.freeze({ code: 'FAQ50', percentOff: 50, appliesTo: 'ebooks' }),
  ZOD20: Object.freeze({ code: 'ZOD20', percentOff: 20 }),
});

function getPromotionRules(overrides = {}) {
  const normalized = { ...DEFAULT_PROMOTION_RULES };
  for (const [key, rule] of Object.entries(overrides || {})) {
    const code = normalizePromotionCode(rule?.code || key);
    if (!code) continue;
    normalized[code] = { ...rule, code };
  }
  return normalized;
}

function promotionApplies(rule, items) {
  if (rule.appliesTo === 'ebooks') return items.every((item) => item.kind === 'ebook');
  if (rule.appliesTo === 'coaching') return items.every((item) => item.kind === 'coaching');
  return true;
}

function discountForRule(rule, items, subtotalCents) {
  if (!promotionApplies(rule, items)) {
    throw new CheckoutValidationError(`Le code promo ${rule.code} ne s’applique pas à ce panier`);
  }
  if (Number.isFinite(Number(rule.amountOff))) {
    const discount = Math.round(Number(rule.amountOff));
    if (discount <= 0 || discount >= subtotalCents) {
      throw new CheckoutValidationError(`Le code promo ${rule.code} ne s’applique pas à ce panier`);
    }
    return discount;
  }
  if (Number.isFinite(Number(rule.percentOff))) {
    const percent = Number(rule.percentOff);
    if (percent <= 0 || percent >= 100) throw new CheckoutValidationError(`Code promo ${rule.code} invalide`);
    return Math.round(subtotalCents * percent / 100);
  }
  throw new CheckoutValidationError(`Code promo ${rule.code} invalide`);
}

function subtotalForItems(items) {
  return items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
}

function parseClientTotalCents(body) {
  if (body.totalAmount === undefined || body.totalAmount === null || body.totalAmount === '') return null;
  const clientTotal = Number(body.totalAmount);
  if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
    throw new CheckoutValidationError('Total transmis invalide');
  }
  return Math.round(clientTotal * 100);
}

function shouldSearchQuantityRepair(originalItems) {
  if (!originalItems.length || originalItems.some((item) => item.kind !== 'coaching')) return false;
  const quantities = originalItems.map((item) => item.quantity);
  if (quantities.every((quantity) => quantity === 1)) return true;
  return quantities.every((quantity) => quantity === quantities[0] && quantity > 1);
}

function enumerateQuantitySolutions(items, clientTotalCents, promotionRules, requestedCode) {
  if (!shouldSearchQuantityRepair(items)) return [];
  const rules = requestedCode
    ? [promotionRules[requestedCode]].filter(Boolean)
    : [null, ...Object.values(promotionRules)];
  const solutions = [];
  const working = items.map((item) => ({ ...item }));

  function visit(index) {
    if (index === working.length) {
      const subtotalCents = subtotalForItems(working);
      for (const rule of rules) {
        let discountCents = 0;
        let promotionCode = null;
        if (rule) {
          try {
            discountCents = discountForRule(rule, working, subtotalCents);
          } catch (error) {
            continue;
          }
          promotionCode = rule.code;
        }
        if (subtotalCents - discountCents === clientTotalCents) {
          solutions.push({
            items: working.map((item) => ({ ...item })),
            subtotalCents,
            discountCents,
            totalCents: clientTotalCents,
            promotionCode,
          });
        }
      }
      return;
    }

    for (let quantity = 1; quantity <= 10; quantity += 1) {
      working[index].quantity = quantity;
      visit(index + 1);
      if (solutions.length > 1) return;
    }
  }

  visit(0);
  return solutions;
}

function validateAndPriceCart(body, promotionOverrides = {}) {
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
    const product = resolveProduct(item.name);
    if (!product) {
      throw new CheckoutValidationError(`Produit inconnu: ${String(item.name).slice(0, 80)}`);
    }
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new CheckoutValidationError(`Quantité invalide pour ${product.name}`);
    }
    return { ...product, quantity, amount: product.amount };
  });

  let subtotalCents = subtotalForItems(pricedItems);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) {
    throw new CheckoutValidationError('Total du panier invalide');
  }

  const requestedCode = normalizePromotionCode(body.discountCode || body.promoCode) || null;
  const promotionRules = getPromotionRules(promotionOverrides);
  if (requestedCode && !promotionRules[requestedCode]) {
    throw new CheckoutValidationError(`Code promo inconnu: ${requestedCode}`);
  }
  const clientTotalCents = parseClientTotalCents(body);

  let discountCents = 0;
  let totalCents = subtotalCents;
  let clientTotalIgnored = false;
  let promotionCode = requestedCode;

  if (clientTotalCents !== null) {
    const quantitySolutions = enumerateQuantitySolutions(pricedItems, clientTotalCents, promotionRules, requestedCode);
    if (quantitySolutions.length === 1) {
      const solution = quantitySolutions[0];
      pricedItems.splice(0, pricedItems.length, ...solution.items);
      subtotalCents = solution.subtotalCents;
      discountCents = solution.discountCents;
      totalCents = solution.totalCents;
      promotionCode = solution.promotionCode;
    }
  }

  if (totalCents === subtotalCents && requestedCode) {
    const rule = promotionRules[requestedCode];
    discountCents = discountForRule(rule, pricedItems, subtotalCents);
    totalCents = subtotalCents - discountCents;
    if (clientTotalCents !== null && clientTotalCents !== totalCents) {
      throw new CheckoutValidationError('Total incohérent avec le code promo autorisé');
    }
  }

  if (clientTotalCents !== null && totalCents === subtotalCents) {
    if (clientTotalCents === subtotalCents) {
      totalCents = clientTotalCents;
    } else if (clientTotalCents < subtotalCents) {
      const inferredRule = Object.values(promotionRules).find((rule) => {
        try {
          return subtotalCents - discountForRule(rule, pricedItems, subtotalCents) === clientTotalCents;
        } catch (error) {
          return false;
        }
      });
      if (inferredRule) {
        discountCents = discountForRule(inferredRule, pricedItems, subtotalCents);
        totalCents = clientTotalCents;
        promotionCode = inferredRule.code;
      } else if (pricedItems.length > 1 && pricedItems.every((item) => item.kind === 'coaching') && !pricedItems.some((item) => item.quantity > 1)) {
        clientTotalIgnored = true;
      } else {
        throw new CheckoutValidationError('Total transmis inférieur au prix catalogue');
      }
    } else {
      throw new CheckoutValidationError('Total transmis sans code promo autorisé');
    }
  }

  return {
    items: pricedItems,
    subtotalCents,
    totalCents,
    discountCents,
    promotionCode,
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
  resolveProduct,
  validateAndPriceCart,
};
