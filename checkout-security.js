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

const PROMOTIONS = Object.freeze({
  BIOSCAN59: Object.freeze({ code: 'BIOSCAN59', amountOff: 5900, eligibleKind: 'coaching' }),
  ULTIMATE79: Object.freeze({ code: 'ULTIMATE79', amountOff: 7900, eligibleKind: 'coaching' }),
  BLOOD99: Object.freeze({ code: 'BLOOD99', amountOff: 9900, eligibleKind: 'coaching' }),
  FAQ50: Object.freeze({ code: 'FAQ50', percentOff: 50, eligibleKind: 'ebook', exclusiveKind: true }),
});

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

function promotionDiscountCents(promotion, items, subtotalCents) {
  if (!promotion) return 0;
  const eligible = promotion.eligibleKind
    ? items.filter((item) => item.kind === promotion.eligibleKind)
    : items;
  if (eligible.length === 0) return null;
  if (promotion.exclusiveKind && eligible.length !== items.length) return null;
  if (promotion.amountOff) return Math.min(promotion.amountOff, subtotalCents);
  if (promotion.percentOff) return Math.round(subtotalCents * promotion.percentOff / 100);
  return null;
}

function resolvePromotion(items, subtotalCents, clientTotalCents, requestedCode, promotions = PROMOTIONS) {
  if (requestedCode) {
    const promotion = promotions[requestedCode];
    if (!promotion) throw new CheckoutValidationError('Code promo inconnu');
    const discountCents = promotionDiscountCents(promotion, items, subtotalCents);
    if (!Number.isSafeInteger(discountCents) || discountCents <= 0) {
      throw new CheckoutValidationError('Ce code promo ne s’applique pas à ce panier');
    }
    if (clientTotalCents !== null && subtotalCents - discountCents !== clientTotalCents) {
      throw new CheckoutValidationError('Le total remisé ne correspond pas au code promo');
    }
    return { promotionCode: promotion.code, discountCents };
  }

  if (clientTotalCents === null || clientTotalCents === subtotalCents) {
    return { promotionCode: null, discountCents: 0 };
  }

  const matches = Object.values(promotions).flatMap((promotion) => {
    const discountCents = promotionDiscountCents(promotion, items, subtotalCents);
    return Number.isSafeInteger(discountCents) && subtotalCents - discountCents === clientTotalCents
      ? [{ promotionCode: promotion.code, discountCents }]
      : [];
  });
  if (matches.length !== 1) {
    throw new CheckoutValidationError('Le total remisé ne correspond ni au prix catalogue ni à un code promo autorisé');
  }
  return matches[0];
}

function quantityAssignmentsForSubtotal(items, targetSubtotalCents) {
  const matches = [];
  const suffixMinimum = new Array(items.length + 1).fill(0);
  const suffixMaximum = new Array(items.length + 1).fill(0);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    suffixMinimum[index] = suffixMinimum[index + 1] + items[index].amount;
    suffixMaximum[index] = suffixMaximum[index + 1] + items[index].amount * 10;
  }

  function visit(index, remainingCents, quantities) {
    if (matches.length > 1) return;
    if (index === items.length) {
      if (remainingCents === 0) matches.push(quantities.slice());
      return;
    }
    const item = items[index];
    for (let quantity = 1; quantity <= 10; quantity += 1) {
      const nextRemaining = remainingCents - item.amount * quantity;
      if (nextRemaining < suffixMinimum[index + 1]) break;
      if (nextRemaining > suffixMaximum[index + 1]) continue;
      quantities.push(quantity);
      visit(index + 1, nextRemaining, quantities);
      quantities.pop();
      if (matches.length > 1) return;
    }
  }
  if (targetSubtotalCents >= suffixMinimum[0] && targetSubtotalCents <= suffixMaximum[0]) {
    visit(0, targetSubtotalCents, []);
  }
  return matches;
}

function possibleSubtotalsForPromotion(clientTotalCents, promotion) {
  if (!promotion) return [clientTotalCents];
  if (promotion.amountOff) return [clientTotalCents + promotion.amountOff];
  if (promotion.percentOff === 50) return [clientTotalCents * 2 - 1, clientTotalCents * 2];
  return [];
}

function recoverCartQuantities(items, clientTotalCents, requestedCode, promotions = PROMOTIONS) {
  const promotionCandidates = requestedCode
    ? [promotions[requestedCode]].filter(Boolean)
    : [null, ...Object.values(promotions)];
  const matches = [];
  const fingerprints = new Set();

  for (const promotionCandidate of promotionCandidates) {
    for (const targetSubtotalCents of possibleSubtotalsForPromotion(clientTotalCents, promotionCandidate)) {
      if (!Number.isSafeInteger(targetSubtotalCents) || targetSubtotalCents <= 0) continue;
      const assignments = quantityAssignmentsForSubtotal(items, targetSubtotalCents);
      for (const quantities of assignments) {
        const candidateItems = items.map((item, index) => ({ ...item, quantity: quantities[index] }));
        const subtotalCents = candidateItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
        try {
          const code = promotionCandidate ? promotionCandidate.code : '';
          const promotion = resolvePromotion(candidateItems, subtotalCents, clientTotalCents, code, promotions);
          const fingerprint = `${candidateItems.map((item) => item.quantity).join(',')}|${promotion.promotionCode || ''}`;
          if (!fingerprints.has(fingerprint)) {
            fingerprints.add(fingerprint);
            matches.push({ items: candidateItems, subtotalCents, ...promotion });
          }
        } catch (error) {
          if (!(error instanceof CheckoutValidationError)) throw error;
        }
        if (matches.length > 1) return null;
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function validateAndPriceCart(body, promotions = PROMOTIONS) {
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
    return { ...product, quantity };
  });

  let effectiveItems = pricedItems;
  let subtotalCents = effectiveItems.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) {
    throw new CheckoutValidationError('Total du panier invalide');
  }

  const requestedCode = normalizePromotionCode(body.discountCode || body.promoCode);
  let clientTotalCents = null;
  if (body.totalAmount !== undefined && body.totalAmount !== null && body.totalAmount !== '') {
    const clientTotal = Number(body.totalAmount);
    clientTotalCents = Math.round(clientTotal * 100);
    if (!Number.isFinite(clientTotal) || !Number.isSafeInteger(clientTotalCents) || clientTotalCents <= 0) {
      throw new CheckoutValidationError('Total transmis invalide');
    }
  }

  let promotion;
  let clientTotalIgnored = false;
  try {
    promotion = resolvePromotion(effectiveItems, subtotalCents, clientTotalCents, requestedCode, promotions);
  } catch (error) {
    // Les anciens boutons Webflow peuvent envoyer des quantités fausses depuis
    // leur cookie de secours. On reconstruit alors toutes les lignes à partir
    // du total affiché, des prix catalogue et des seules promotions autorisées.
    // La réparation n’est acceptée que si une seule combinaison est possible.
    const recovered = clientTotalCents !== null
      ? recoverCartQuantities(effectiveItems, clientTotalCents, requestedCode, promotions)
      : null;
    if (recovered) {
      effectiveItems = recovered.items;
      subtotalCents = recovered.subtotalCents;
      promotion = recovered;
    } else {
      // Les anciens scripts Webflow peuvent aussi lire le mauvais noeud de total
      // sur un panier composé de plusieurs coachings. Les lignes produit restent
      // recalculées avec le catalogue serveur. Ignorer ce total ne permet jamais
      // de réduire le prix: Stripe reçoit le prix catalogue complet.
      const safeLegacyMixedCoachingCart = !requestedCode
        && clientTotalCents !== null
        && effectiveItems.length > 1
        && effectiveItems.every((item) => item.kind === 'coaching' && item.quantity === 1);
      if (!safeLegacyMixedCoachingCart) throw error;
      promotion = { promotionCode: null, discountCents: 0 };
      clientTotalIgnored = true;
    }
  }

  const totalCents = subtotalCents - promotion.discountCents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new CheckoutValidationError('Total remisé invalide');
  }
  return {
    items: effectiveItems,
    subtotalCents,
    totalCents,
    discountCents: promotion.discountCents,
    promotionCode: promotion.promotionCode,
    clientTotalIgnored,
  };
}

function buildLineItems(body, useStripePriceIds, promotions = PROMOTIONS) {
  const cart = validateAndPriceCart(body, promotions);
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
  validateAndPriceCart,
};
