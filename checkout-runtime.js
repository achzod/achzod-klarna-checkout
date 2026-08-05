'use strict';

const crypto = require('node:crypto');

const ALLOWED_RETURN_ORIGINS = new Set([
  'https://achzodcoaching.com',
  'https://www.achzodcoaching.com',
]);

const PROMOTION_CODES = new Set(['BIOSCAN59', 'ULTIMATE79', 'BLOOD99', 'FAQ50']);

class CheckoutRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CheckoutRequestError';
    this.statusCode = 400;
  }
}

function validateCustomerEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return undefined;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CheckoutRequestError('Adresse email invalide');
  }
  return email;
}

function validateReturnUrl(value, fallback, allowedPath) {
  const raw = String(value || fallback);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new CheckoutRequestError('URL de retour invalide');
  }
  if (!ALLOWED_RETURN_ORIGINS.has(url.origin) || url.pathname !== allowedPath) {
    throw new CheckoutRequestError('URL de retour non autorisée');
  }
  url.hash = '';
  return url;
}

function buildCheckoutUrls(successUrl, cancelUrl) {
  const success = validateReturnUrl(
    successUrl,
    'https://achzodcoaching.com/order-confirmation',
    '/order-confirmation',
  );
  success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  const cancel = validateReturnUrl(
    cancelUrl,
    'https://achzodcoaching.com/checkout',
    '/checkout',
  );
  return {
    successUrl: success.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'),
    cancelUrl: cancel.toString(),
  };
}

function buildIdempotencyKey(req, cart, customerEmail) {
  const getHeader = (name) => typeof req.get === 'function'
    ? req.get(name)
    : req.headers?.[String(name).toLowerCase()];
  const supplied = String(getHeader('x-checkout-attempt') || '').trim();
  const attempt = /^[a-zA-Z0-9_-]{12,80}$/.test(supplied)
    ? supplied
    : [
        req.ip || '',
        String(getHeader('user-agent') || '').slice(0, 160),
        Math.floor(Date.now() / (5 * 60 * 1000)),
      ].join('|');
  const fingerprint = JSON.stringify({
    attempt,
    customerEmail: customerEmail || '',
    items: cart.items.map((item) => [item.name, item.quantity]),
    totalCents: cart.totalCents,
    promotionCode: cart.promotionCode || '',
  });
  return `achzod_checkout_${crypto.createHash('sha256').update(fingerprint).digest('hex')}`;
}

function getStripePromotionId(promotionCode, env = process.env, account = 'FR') {
  if (!promotionCode) return null;
  const normalizedAccount = String(account || '').toUpperCase();
  const envKey = PROMOTION_CODES.has(promotionCode)
    ? `STRIPE_${normalizedAccount}_PROMO_${promotionCode}`
    : '';
  const promotionId = envKey ? String(env[envKey] || '').trim() : '';
  if (!promotionId || !/^promo_[a-zA-Z0-9]+$/.test(promotionId)) {
    throw new Error(`Promotion Stripe ${normalizedAccount} non configurée pour ${promotionCode}`);
  }
  return promotionId;
}

function buildCheckoutMetadata(cart) {
  return {
    merchant_name: 'achzodcoaching',
    business_name: 'AchzodCoaching',
    cart_total_cents: String(cart.totalCents),
    cart_subtotal_cents: String(cart.subtotalCents),
    discount_cents: String(cart.discountCents || 0),
    promotion_code: cart.promotionCode || 'none',
    cart_items: cart.items.map((item) => `${item.name} x${item.quantity}`).join(' | ').slice(0, 500),
  };
}

module.exports = {
  CheckoutRequestError,
  buildCheckoutMetadata,
  buildCheckoutUrls,
  buildIdempotencyKey,
  getStripePromotionId,
  validateCustomerEmail,
};
