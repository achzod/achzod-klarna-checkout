'use strict';

const Stripe = require('stripe');
const { CheckoutValidationError, buildLineItems } = require('../checkout-security');
const {
  CheckoutRequestError,
  buildCheckoutMetadata,
  buildCheckoutUrls,
  buildIdempotencyKey,
  getStripePromotionId,
  validateCustomerEmail,
} = require('../checkout-runtime');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ALLOWED_ORIGINS = new Set([
  'https://achzodcoaching.com',
  'https://www.achzodcoaching.com',
]);

module.exports = async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Checkout-Attempt');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'Origin non autorisée' });

  try {
    const cart = buildLineItems(req.body, true);
    const email = validateCustomerEmail(req.body?.customerEmail);
    const urls = buildCheckoutUrls(req.body?.successUrl, req.body?.cancelUrl);
    const sessionOptions = {
      payment_method_types: ['card', 'link'],
      line_items: cart.lineItems,
      mode: 'payment',
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      billing_address_collection: 'required',
      locale: 'fr',
      metadata: buildCheckoutMetadata(cart),
    };
    if (email) sessionOptions.customer_email = email;
    if (cart.promotionCode) {
      sessionOptions.discounts = [{ promotion_code: getStripePromotionId(cart.promotionCode, process.env, 'UAE') }];
    }
    const session = await stripe.checkout.sessions.create(
      sessionOptions,
      { idempotencyKey: buildIdempotencyKey(req, cart, email) },
    );
    return res.status(200).json({ url: session.url });
  } catch (error) {
    const clientError = error instanceof CheckoutValidationError || error instanceof CheckoutRequestError;
    console.error('Stripe checkout error:', clientError ? error.message : error);
    return res.status(clientError ? 400 : 500).json({
      error: clientError ? error.message : 'Impossible de lancer le paiement. Réessaie dans un instant.',
    });
  }
};
