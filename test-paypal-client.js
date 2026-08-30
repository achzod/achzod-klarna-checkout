'use strict';

const assert = require('node:assert/strict');
const {
  buildPayPalOrderPayload,
  centsToPaypalValue,
  isPayPalCheckoutEnabled,
  summarizePayPalOrder,
} = require('./paypal-client');

assert.equal(isPayPalCheckoutEnabled({
  PAYPAL_CHECKOUT_ENABLED: 'true',
  PAYPAL_CLIENT_ID: 'client',
  PAYPAL_CLIENT_SECRET: 'secret',
}), true);
assert.equal(isPayPalCheckoutEnabled({
  PAYPAL_CHECKOUT_ENABLED: 'false',
  PAYPAL_CLIENT_ID: 'client',
  PAYPAL_CLIENT_SECRET: 'secret',
}), false);
assert.equal(isPayPalCheckoutEnabled({
  PAYPAL_CHECKOUT_ENABLED: 'true',
  PAYPAL_CLIENT_ID: '',
  PAYPAL_CLIENT_SECRET: 'secret',
}), false);

assert.equal(centsToPaypalValue(9900), '99.00');
assert.throws(() => centsToPaypalValue(0), /Montant PayPal invalide/);

const payload = buildPayPalOrderPayload({
  items: [
    { name: 'Essential 8 semaines', quantity: 1, amount: 39900 },
    { name: 'Anabolic Code', quantity: 2, amount: 7900 },
  ],
  totalCents: 49700,
}, {
  returnUrl: 'https://achzod-klarna-checkout.onrender.com/paypal/return',
  cancelUrl: 'https://achzodcoaching.com/checkout',
  orderReference: 'achzod_test',
});

assert.equal(payload.intent, 'CAPTURE');
assert.equal(payload.purchase_units[0].amount.value, '497.00');
assert.equal(payload.purchase_units[0].amount.breakdown.item_total.value, '557.00');
assert.equal(payload.purchase_units[0].amount.breakdown.discount.value, '60.00');
assert.equal(payload.purchase_units[0].items[1].quantity, '2');
assert.equal(payload.application_context.shipping_preference, 'NO_SHIPPING');

const summary = summarizePayPalOrder({
  id: 'PAYPAL123',
  status: 'COMPLETED',
  payer: {
    email_address: 'client@example.com',
    name: { given_name: 'Ach', surname: 'Client' },
  },
  purchase_units: [{
    amount: { value: '497.00' },
    items: [
      { name: 'Essential 8 semaines', quantity: '1' },
      { name: 'Anabolic Code', quantity: '2' },
    ],
  }],
});

assert.equal(summary.identity, 'paypal:PAYPAL123');
assert.equal(summary.customerEmail, 'client@example.com');
assert.equal(summary.customerName, 'Ach Client');
assert.deepEqual(summary.productNames, ['Essential 8 semaines', 'Anabolic Code x2']);
assert.equal(summary.totalAmount, '497.00');

const fallbackSummary = summarizePayPalOrder({
  id: 'PAYPAL456',
  status: 'COMPLETED',
  payer: {
    email_address: 'fallback-client@example.com',
    name: { given_name: 'Fallback', surname: 'Client' },
  },
  purchase_units: [{
    amount: { value: '399.00' },
  }],
}, {
  customerEmail: 'stored-client@example.com',
  productNames: ['Essential 8 semaines'],
  totalAmount: '399.00',
});

assert.equal(fallbackSummary.customerEmail, 'fallback-client@example.com');
assert.deepEqual(fallbackSummary.productNames, ['Essential 8 semaines']);
assert.equal(fallbackSummary.totalAmount, '399.00');

console.log('✓ client PayPal validé');
