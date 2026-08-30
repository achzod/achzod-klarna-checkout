'use strict';

const fetch = require('node-fetch');

function getPayPalMode(env = process.env) {
  return String(env.PAYPAL_MODE || 'live').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'live';
}

function getPayPalBaseUrl(env = process.env) {
  return getPayPalMode(env) === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function isPayPalConfigured(env = process.env) {
  return Boolean(String(env.PAYPAL_CLIENT_ID || '').trim() && String(env.PAYPAL_CLIENT_SECRET || '').trim());
}

function isPayPalCheckoutEnabled(env = process.env) {
  return String(env.PAYPAL_CHECKOUT_ENABLED || '').trim().toLowerCase() === 'true'
    && isPayPalConfigured(env);
}

function getPayPalCredentials(env = process.env) {
  const clientId = String(env.PAYPAL_CLIENT_ID || '').trim();
  const secret = String(env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !secret) throw new Error('Configuration PayPal manquante');
  return { clientId, secret };
}

async function getPayPalAccessToken(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const { clientId, secret } = getPayPalCredentials(env);
  const response = await fetchImpl(`${getPayPalBaseUrl(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.message || 'OAuth PayPal impossible');
  }
  return data.access_token;
}

async function paypalRequest(path, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || fetch;
  const accessToken = options.accessToken || await getPayPalAccessToken({ env, fetch: fetchImpl });
  const response = await fetchImpl(`${getPayPalBaseUrl(env)}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.name || `Erreur PayPal ${response.status}`);
  }
  return data;
}

function centsToPaypalValue(cents) {
  const amount = Number(cents);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Montant PayPal invalide');
  return (amount / 100).toFixed(2);
}

function buildPayPalOrderPayload(cart, options = {}) {
  const items = cart.items.map((item) => ({
    name: String(item.name).slice(0, 127),
    quantity: String(item.quantity),
    unit_amount: {
      currency_code: 'EUR',
      value: centsToPaypalValue(item.amount),
    },
  }));
  const itemTotalCents = cart.items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  const discountCents = Math.max(0, itemTotalCents - cart.totalCents);

  return {
    intent: 'CAPTURE',
    purchase_units: [{
      custom_id: String(options.orderReference || '').slice(0, 127) || undefined,
      description: 'Commande AchzodCoaching',
      amount: {
        currency_code: 'EUR',
        value: centsToPaypalValue(cart.totalCents),
        breakdown: {
          item_total: {
            currency_code: 'EUR',
            value: centsToPaypalValue(itemTotalCents),
          },
          ...(discountCents > 0 ? {
            discount: {
              currency_code: 'EUR',
              value: centsToPaypalValue(discountCents),
            },
          } : {}),
        },
      },
      items,
    }],
    application_context: {
      brand_name: 'AchzodCoaching',
      locale: 'fr-FR',
      landing_page: 'LOGIN',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
      return_url: options.returnUrl,
      cancel_url: options.cancelUrl,
    },
  };
}

function extractApprovalUrl(order) {
  return (order.links || []).find((link) => link.rel === 'approve')?.href || null;
}

async function createPayPalOrder(cart, options = {}) {
  const order = await paypalRequest('/v2/checkout/orders', {
    ...options,
    method: 'POST',
    body: buildPayPalOrderPayload(cart, options),
  });
  const approvalUrl = extractApprovalUrl(order);
  if (!approvalUrl) throw new Error('Lien PayPal introuvable');
  return { order, approvalUrl };
}

async function capturePayPalOrder(orderId, options = {}) {
  const cleanOrderId = String(orderId || '').trim();
  if (!/^[A-Z0-9_-]{6,40}$/i.test(cleanOrderId)) throw new Error('Order ID PayPal invalide');
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(cleanOrderId)}/capture`, {
    ...options,
    method: 'POST',
    body: {},
  });
}

function normalizeFallbackProductNames(fallback) {
  return Array.isArray(fallback?.productNames)
    ? fallback.productNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
}

function summarizePayPalOrder(order, fallback = {}) {
  const purchaseUnit = order.purchase_units?.[0] || {};
  const shippingName = purchaseUnit.shipping?.name?.full_name || '';
  const payer = order.payer || {};
  const customerEmail = payer.email_address || fallback.customerEmail || '';
  const customerName = payer.name
    ? [payer.name.given_name, payer.name.surname].filter(Boolean).join(' ')
    : shippingName || fallback.customerName || '';
  const items = (purchaseUnit.items || []).map((item) => ({
    name: item.name || 'Produit',
    quantity: Number(item.quantity || 1),
  }));
  const productNames = items.length
    ? items.map((item) => item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name)
    : normalizeFallbackProductNames(fallback);
  const totalAmount = purchaseUnit.amount?.value || fallback.totalAmount || '0.00';
  return {
    identity: `paypal:${order.id}`,
    customerEmail,
    customerName,
    productNames,
    totalAmount,
    status: order.status,
  };
}

module.exports = {
  buildPayPalOrderPayload,
  capturePayPalOrder,
  centsToPaypalValue,
  createPayPalOrder,
  getPayPalBaseUrl,
  isPayPalCheckoutEnabled,
  summarizePayPalOrder,
};
