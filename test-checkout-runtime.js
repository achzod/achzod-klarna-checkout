'use strict';

const assert = require('node:assert/strict');
const {
  buildCheckoutMetadata,
  buildCheckoutUrls,
  buildIdempotencyKey,
  getStripePromotionId,
  validateCustomerEmail,
} = require('./checkout-runtime');

const cart = {
  items: [{ name: 'Essential 12 semaines', quantity: 2 }],
  subtotalCents: 109800,
  totalCents: 99900,
  discountCents: 9900,
  promotionCode: 'BLOOD99',
};

assert.deepEqual(buildCheckoutUrls(), {
  successUrl: 'https://achzodcoaching.com/order-confirmation?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://achzodcoaching.com/checkout',
});
assert.throws(() => buildCheckoutUrls('https://evil.example/steal'), /non autorisée/);
assert.throws(() => buildCheckoutUrls('https://achzodcoaching.com/checkout'), /non autorisée/);
assert.equal(validateCustomerEmail(' Test@Example.com '), 'test@example.com');
assert.equal(validateCustomerEmail(''), undefined);
assert.throws(() => validateCustomerEmail('invalide'), /email invalide/);

const req = {
  ip: '127.0.0.1',
  get(name) {
    if (name === 'x-checkout-attempt') return 'attempt_123456789';
    if (name === 'user-agent') return 'test-agent';
    return '';
  },
};
assert.equal(buildIdempotencyKey(req, cart, 'test@example.com'), buildIdempotencyKey(req, cart, 'test@example.com'));
assert.notEqual(buildIdempotencyKey(req, cart, 'a@example.com'), buildIdempotencyKey(req, cart, 'b@example.com'));
assert.equal(getStripePromotionId('BLOOD99', { STRIPE_FR_PROMO_BLOOD99: 'promo_valid123' }), 'promo_valid123');
assert.equal(getStripePromotionId('BLOOD99', { STRIPE_UAE_PROMO_BLOOD99: 'promo_uae123' }, 'UAE'), 'promo_uae123');
assert.throws(() => getStripePromotionId('BLOOD99', {}), /non configurée/);
assert.deepEqual(buildCheckoutMetadata(cart), {
  merchant_name: 'achzodcoaching',
  business_name: 'AchzodCoaching',
  cart_total_cents: '99900',
  cart_subtotal_cents: '109800',
  discount_cents: '9900',
  promotion_code: 'BLOOD99',
  client_total_ignored: 'false',
  cart_items: 'Essential 12 semaines x2',
});

console.log('✓ sécurité runtime checkout validée');
