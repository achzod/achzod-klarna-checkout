const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const { CheckoutValidationError, PRODUCTS, PROMOTIONS, buildLineItems } = require('./checkout-security');
const {
  CheckoutRequestError,
  buildCheckoutMetadata,
  buildCheckoutUrls,
  buildIdempotencyKey,
  validateCustomerEmail,
} = require('./checkout-runtime');

// Crée un coupon Stripe à usage unique pour la remise client (n'importe quel
// code promo/total remisé) puis retourne l'id du coupon prêt à être attaché à
// la session Checkout via `discounts: [{ coupon }]`.
async function createDynamicDiscountCoupon(stripe, cart) {
  if (!cart.discountCents || cart.discountCents <= 0) return null;
  const name = (cart.promotionCode || 'REMISE').slice(0, 40);
  const coupon = await stripe.coupons.create({
    amount_off: cart.discountCents,
    currency: 'eur',
    duration: 'once',
    name: `Code ${name}`,
    max_redemptions: 1,
    metadata: {
      applied_via: 'webflow_client',
      promo_code: cart.promotionCode || 'inconnu',
    },
  });
  return coupon.id;
}

const app = express();
app.set('trust proxy', 1);

// Stripe UAE (paiements normaux : cartes, Apple Pay, etc.)
const stripeUAE = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe FR (uniquement pour Klarna)
const stripeFR = process.env.STRIPE_SECRET_KEY_FR ? new Stripe(process.env.STRIPE_SECRET_KEY_FR) : null;

// Configuration email (Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'achzodyt@gmail.com',
    pass: process.env.EMAIL_PASS // App password Gmail
  }
});

// Liens de téléchargement des ebooks
const EBOOK_LINKS = {
  // Anabolic Code
  'anabolic code': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'anabolic': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'code anabolic': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  
  // Libérer son potentiel génétique
  'liberer son potentiel genetique': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel génétique': 'https://gofile.io/d/gWybQ6',
  'libérer son potentiel génétique': 'https://gofile.io/d/gWybQ6',
  'libérer son potentiel génétique en 10 semaines': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel genetique en 10 semaines': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel': 'https://gofile.io/d/gWybQ6',
  'libérer son potentiel': 'https://gofile.io/d/gWybQ6',
  'potentiel genetique': 'https://gofile.io/d/gWybQ6',
  'potentiel génétique': 'https://gofile.io/d/gWybQ6',
  '10 semaines': 'https://gofile.io/d/gWybQ6',
  
  // 4 Semaines Shred - TOUTES LES VARIANTES POSSIBLES
  '4 semaines pour etre shred perte de gras et prise de muscles': 'https://gofile.io/d/5SylgY',
  '4 semaines pour être shred perte de gras et prise de muscles': 'https://gofile.io/d/5SylgY',
  'ebook 49 00 eur 4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  'ebook 49 00 eur 4 semaines pour être shred': 'https://gofile.io/d/5SylgY',
  'ebook 4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  'ebook 4 semaines pour être shred': 'https://gofile.io/d/5SylgY',
  '4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  '4 semaines pour être shred': 'https://gofile.io/d/5SylgY',
  'perte de gras et prise de muscles': 'https://gofile.io/d/5SylgY',
  '4 semaines shred': 'https://gofile.io/d/5SylgY',
  'semaines shred': 'https://gofile.io/d/5SylgY',
  'pour etre shred': 'https://gofile.io/d/5SylgY',
  'pour être shred': 'https://gofile.io/d/5SylgY',
  'perte de gras': 'https://gofile.io/d/5SylgY',
  'prise de muscles': 'https://gofile.io/d/5SylgY',
  '4 semaines': 'https://gofile.io/d/5SylgY',
  'shred': 'https://gofile.io/d/5SylgY',
  
  // Bioénergétique
  'bioenergetique': 'https://gofile.io/d/Hn6GE1',
  'bioénergétique': 'https://gofile.io/d/Hn6GE1',
  'bioenergetique et timing': 'https://gofile.io/d/Hn6GE1',
  'bioénergétique et timing': 'https://gofile.io/d/Hn6GE1',
  'bioenergetique timing': 'https://gofile.io/d/Hn6GE1',
  'bioénergétique timing': 'https://gofile.io/d/Hn6GE1',
};

const ALLOWED_ORIGINS = new Set([
  'https://achzodcoaching.com',
  'https://www.achzodcoaching.com',
]);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin non autorisée' });
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    return callback(null, !origin || ALLOWED_ORIGINS.has(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Stripe-Signature', 'Authorization', 'X-Checkout-Attempt'],
}));

// Webhook Stripe doit recevoir le body brut
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook-klarna', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '64kb' }));

// Sert le script Klarna à embarquer dans Webflow (source de vérité unique).
// Update le fichier ici puis push, tout le site prend la nouvelle version.
app.get('/webflow-klarna.js', (req, res) => {
  const path = require('node:path');
  res.set('Cache-Control', 'public, max-age=60');
  res.type('application/javascript; charset=utf-8');
  res.sendFile(path.join(__dirname, 'webflow-klarna.js'));
});

const checkoutRateBuckets = new Map();
function checkoutRateLimit(req, res, next) {
  const now = Date.now();
  const key = String(req.ip || 'unknown');
  const bucket = checkoutRateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 2 * 60 * 1000) {
    checkoutRateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 20) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans deux minutes.' });
  }
  next();
}

function requireDiagnosticAuth(req, res, next) {
  const expected = process.env.DIAGNOSTIC_TOKEN;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || supplied.length !== expected.length) {
    return res.status(404).json({ error: 'Not found' });
  }
  const crypto = require('node:crypto');
  if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

// Mapping des produits Webflow vers les Price IDs Stripe
const PRICE_MAPPING = {
  // Coaching
  'coaching sans suivi': 'price_1SdvMiBTm0rdlVFq1quX3O14',

  // Essential
  'essential 4 semaines': 'price_1SdvMiBTm0rdlVFqLfsmZktn',
  'essential 8 semaines': 'price_1SdvMhBTm0rdlVFqH5DLanUx',
  'essential 12 semaines': 'price_1SdvMhBTm0rdlVFqwk0q6GSp',
  '4 semaines - essential': 'price_1SdvMiBTm0rdlVFqLfsmZktn',
  '8 semaines - essential': 'price_1SdvMhBTm0rdlVFqH5DLanUx',
  '12 semaines - essential': 'price_1SdvMhBTm0rdlVFqwk0q6GSp',

  // Elite
  'elite 4 semaines': 'price_1SdvMgBTm0rdlVFqzHfzhM8K',
  'elite 8 semaines': 'price_1SdvMgBTm0rdlVFqN0ApjtgB',
  'elite 12 semaines': 'price_1SdvMgBTm0rdlVFqstDCjSEg',
  '4 semaines - elite': 'price_1SdvMgBTm0rdlVFqzHfzhM8K',
  '8 semaines - elite': 'price_1SdvMgBTm0rdlVFqN0ApjtgB',
  '12 semaines - elite': 'price_1SdvMgBTm0rdlVFqstDCjSEg',

  // Private Lab
  'private lab 4 semaines': 'price_1SdvMfBTm0rdlVFq3DbslVyj',
  'private lab 8 semaines': 'price_1SdvMfBTm0rdlVFq1RDNoRrL',
  'private lab 12 semaines': 'price_1SdvMeBTm0rdlVFqtP697rjn',
  '4 semaines - private lab': 'price_1SdvMfBTm0rdlVFq3DbslVyj',
  '8 semaines - private lab': 'price_1SdvMfBTm0rdlVFq1RDNoRrL',
  '12 semaines - private lab': 'price_1SdvMeBTm0rdlVFqtP697rjn',
  'achzod private lab': 'price_1SdvMfBTm0rdlVFq3DbslVyj',

  // Ebooks
  'anabolic code': 'price_1SdvMeBTm0rdlVFqZEmcaDNm',
  'liberer son potentiel': 'price_1SdvMeBTm0rdlVFqTi8xNboT',
  '4 semaines pour etre shred': 'price_1SdvMdBTm0rdlVFqHi638498',
  '4 semaines shred': 'price_1SdvMdBTm0rdlVFqHi638498',
  'bioenergetique': 'price_1SdvMdBTm0rdlVFqboosk1lb',
};

// Mapping par montant en centimes (fallback)
const PRICE_BY_AMOUNT = {
  9900: 'price_1SdvMiBTm0rdlVFq1quX3O14',
  24900: 'price_1SdvMiBTm0rdlVFqLfsmZktn',
  39900: 'price_1SdvMhBTm0rdlVFqH5DLanUx',
  54900: 'price_1SdvMhBTm0rdlVFqwk0q6GSp',
  64900: 'price_1SdvMgBTm0rdlVFqN0ApjtgB',
  89900: 'price_1SdvMgBTm0rdlVFqstDCjSEg',
  49900: 'price_1SdvMfBTm0rdlVFq3DbslVyj',
  79900: 'price_1SdvMfBTm0rdlVFq1RDNoRrL',
  119900: 'price_1SdvMeBTm0rdlVFqtP697rjn',
  7900: 'price_1SdvMeBTm0rdlVFqZEmcaDNm',
  4900: 'price_1SdvMeBTm0rdlVFqTi8xNboT',
  5900: 'price_1SdvMdBTm0rdlVFqboosk1lb',
};

function findPriceId(productName, amount) {
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  for (const [key, priceId] of Object.entries(PRICE_MAPPING)) {
    const cleanKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (cleanName.includes(cleanKey) || cleanKey.includes(cleanName)) {
      return priceId;
    }
  }

  const amountInCents = Math.round(amount * 100);
  return PRICE_BY_AMOUNT[amountInCents] || null;
}

// Route principale
async function createCheckoutSession(req, res) {
  try {
    const { successUrl, cancelUrl, customerEmail } = req.body;
    // On utilise price_data (pas les Price IDs catalogue) pour que Stripe
    // reçoive les prix affichés côté Webflow, même s'ils diffèrent du catalogue.
    const cart = buildLineItems(req.body, false);
    const email = validateCustomerEmail(customerEmail);
    const urls = buildCheckoutUrls(successUrl, cancelUrl);
    
    const sessionConfig = {
      payment_method_types: ['card', 'link'],
      line_items: cart.lineItems,
      mode: 'payment',
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      billing_address_collection: 'required',
      locale: 'fr',
      // Métadonnées pour que Stripe affiche "achzodcoaching" au lieu du nom personnel
      metadata: buildCheckoutMetadata(cart),
      // Note: Ne pas définir receipt_email = pas de reçu Stripe automatique
      // Les reçus Stripe doivent être désactivés dans le dashboard Stripe
    };

    // Ajouter l'email du client (pour pré-remplir le formulaire, PAS pour le reçu Stripe)
    // On n'envoie PAS de receipt_email car on envoie notre propre email ACHZOD via webhook
    if (email) {
      sessionConfig.customer_email = email;
      // PAS de receipt_email = pas de reçu Stripe automatique
    }

    // Si erreur "No such price", recréer avec price_data uniquement
    try {
      const couponIdUAE = await createDynamicDiscountCoupon(stripeUAE, cart);
      if (couponIdUAE) sessionConfig.discounts = [{ coupon: couponIdUAE }];
      const session = await stripeUAE.checkout.sessions.create(
        sessionConfig,
        { idempotencyKey: buildIdempotencyKey(req, cart, email) },
      );
      res.json({ url: session.url });
    } catch (error) {
      if (error.message && error.message.includes('No such price')) {
        console.log('⚠️  Price ID invalide, utilisation de price_data pour tous les items');
        const fallbackCart = buildLineItems(req.body, false);
        sessionConfig.line_items = fallbackCart.lineItems;
        const session = await stripeUAE.checkout.sessions.create(
          sessionConfig,
          { idempotencyKey: `${buildIdempotencyKey(req, fallbackCart, email)}_inline` },
        );
        res.json({ url: session.url });
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('Erreur Stripe:', error);
    const clientError = error instanceof CheckoutValidationError || error instanceof CheckoutRequestError;
    res.status(clientError ? 400 : 500).json({
      error: clientError ? error.message : 'Impossible de lancer le paiement. Réessaie dans un instant.',
    });
  }
}
app.post(['/checkout', '/create-checkout-session'], checkoutRateLimit, createCheckoutSession);

// Route Klarna - Utilise Stripe FR
async function createKlarnaSession(req, res) {
  if (!stripeFR) {
    console.error('❌ STRIPE_SECRET_KEY_FR non configuré !');
    return res.status(500).json({ error: 'Configuration Stripe FR manquante. Contacte le support.' });
  }
  
  try {
    const { successUrl, cancelUrl, customerEmail } = req.body;
    const cart = buildLineItems(req.body, false);
    const email = validateCustomerEmail(customerEmail);
    const urls = buildCheckoutUrls(successUrl, cancelUrl);
    const effectiveTotal = cart.totalCents / 100;
    const KLARNA_MIN_TOTAL_EUR = Number(process.env.KLARNA_MIN_TOTAL_EUR || 0.5);
    if (effectiveTotal > 0 && effectiveTotal < KLARNA_MIN_TOTAL_EUR) {
      return res.status(400).json({
        error: `Klarna indisponible en dessous de ${KLARNA_MIN_TOTAL_EUR}€ (total actuel: ${effectiveTotal.toFixed(2)}€). Utilise Carte/PayPal ou réduis la remise.`,
      });
    }

    const sessionConfig = {
      // Card en premier pour éviter les blocages Klarna
      // Si Klarna est disponible, Stripe l'affichera automatiquement
      payment_method_types: ['card', 'klarna'],
      line_items: cart.lineItems,
      mode: 'payment',
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      billing_address_collection: 'required',
      locale: 'fr',
      // Métadonnées pour que Stripe affiche "achzodcoaching" au lieu du nom personnel
      metadata: buildCheckoutMetadata(cart),
      // Note: Ne pas définir receipt_email = pas de reçu Stripe automatique
      // Les reçus Stripe doivent être désactivés dans le dashboard Stripe
    };

    if (email) {
      sessionConfig.customer_email = email;
    }

    const klarnaCouponId = await createDynamicDiscountCoupon(stripeFR, cart);
    if (klarnaCouponId) sessionConfig.discounts = [{ coupon: klarnaCouponId }];

    // Vérifier que stripeFR est bien initialisé
    if (!stripeFR || typeof stripeFR.checkout === 'undefined') {
      console.error('❌ stripeFR non initialisé correctement !');
      return res.status(500).json({ error: 'Configuration Stripe FR invalide. Contacte le support.' });
    }
    
    // Créer la session - Stripe remplacera automatiquement {CHECKOUT_SESSION_ID} dans l'URL de success
    const session = await stripeFR.checkout.sessions.create(
      sessionConfig,
      { idempotencyKey: buildIdempotencyKey(req, cart, email) },
    );
    
    res.json({ url: session.url });

  } catch (error) {
    console.error('Erreur Stripe FR (Klarna):', error);
    const clientError = error instanceof CheckoutValidationError || error instanceof CheckoutRequestError;
    res.status(clientError ? 400 : 500).json({
      error: clientError ? error.message : 'Impossible de lancer Klarna. Réessaie dans un instant.',
    });
  }
}
app.post(['/checkout-klarna', '/create-klarna-session'], checkoutRateLimit, createKlarnaSession);

// Fonction pour trouver le lien ebook
function findEbookLink(productName) {
  if (!productName) return null;
  
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  
  console.log('🔍 Recherche ebook pour:', productName, '-> nettoyé:', cleanName);
  
  // Chercher une correspondance exacte ou partielle
  // On teste d'abord les correspondances les plus longues pour éviter les faux positifs
  const sortedKeys = Object.keys(EBOOK_LINKS).sort((a, b) => b.length - a.length);
  
  for (const key of sortedKeys) {
    const cleanKey = key.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    
    // Correspondance si le nom contient la clé ou vice versa
    // On vérifie aussi les mots-clés individuels pour plus de flexibilité
    const nameWords = cleanName.split(/\s+/).filter(w => w.length > 2);
    const keyWords = cleanKey.split(/\s+/).filter(w => w.length > 2);
    
    const hasFullMatch = cleanName.includes(cleanKey) || cleanKey.includes(cleanName);
    const hasWordMatch = nameWords.length > 0 && keyWords.length > 0 && 
      nameWords.some(nw => keyWords.some(kw => nw.includes(kw) || kw.includes(nw)));
    
    // Pour "shred", "perte de gras", "prise de muscles" - correspondance plus flexible
    const isShredRelated = (cleanName.includes('shred') || cleanName.includes('perte') || cleanName.includes('gras') || cleanName.includes('muscles')) &&
                          (cleanKey.includes('shred') || cleanKey.includes('perte') || cleanKey.includes('gras') || cleanKey.includes('muscles'));
    
    // Si le nom contient "ebook" ET "shred" ou "4 semaines", c'est probablement le bon ebook
    const isEbookShred = cleanName.includes('ebook') && (cleanName.includes('shred') || cleanName.includes('4 semaines') || cleanName.includes('semaines')) &&
                        (cleanKey.includes('shred') || cleanKey.includes('4 semaines') || cleanKey.includes('semaines'));
    
    if (hasFullMatch || (hasWordMatch && nameWords.length >= 2) || isShredRelated || isEbookShred) {
      console.log('✅ Ebook trouvé:', key, '->', EBOOK_LINKS[key]);
      return { name: productName, link: EBOOK_LINKS[key] };
    }
  }
  
  console.log('❌ Aucun ebook trouvé pour:', productName);
  return null;
}

// Générer le HTML de l'email au style ACHZOD
function generateEmailHTML(customerName, ebooks, totalAmount) {
  const ebookListHTML = ebooks.length > 0 ? ebooks.map(ebook => `
    <tr>
      <td style="padding: 20px 0; border-bottom: 1px solid #2a2a2a;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color: #ffffff; font-size: 16px; font-weight: 600;">
              📖 ${ebook.name}
            </td>
          </tr>
          <tr>
            <td style="padding-top: 12px;">
              <a href="${ebook.link}" style="display: inline-block; background: linear-gradient(135deg, #FFB3C7, #FF8DA8); color: #0A0B09; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                Télécharger
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td style="padding: 20px 0; text-align: center;">
        <p style="color: #888; font-size: 14px; margin: 0;">
          ⚠️ Les liens de téléchargement seront envoyés sous peu. Si tu ne les reçois pas, contacte-nous à achzodyt@gmail.com
        </p>
      </td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre commande ACHZOD</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0B09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0A0B09; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header avec logo -->
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 3px; color: #FFB3C7;">
                      ACHZOD
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <span style="color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">COACHING</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Confirmation badge -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #FFB3C7, #FF8DA8); border-radius: 50%; line-height: 70px; font-size: 32px; text-align: center;">
                ✓
              </div>
            </td>
          </tr>

          <!-- Main content card -->
          <tr>
            <td style="background: linear-gradient(180deg, #1a1a1a 0%, #141414 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a2a;">
              
              <!-- Titre -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 25px;">
                    <h2 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                      Merci pour ta commande 🔥
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 35px;">
                    <p style="margin: 0; color: #888; font-size: 15px; line-height: 1.6;">
                      Ton paiement a été confirmé. Voici tes téléchargements :
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Ebooks list -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #0A0B09; border-radius: 12px; padding: 20px;">
                ${ebookListHTML}
              </table>

              <!-- Total -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #2a2a2a;">
                <tr>
                  <td style="color: #888; font-size: 14px;">Total payé</td>
                  <td align="right" style="color: #FFB3C7; font-size: 20px; font-weight: 700;">${totalAmount}€</td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Message motivation -->
          <tr>
            <td style="padding: 40px 20px; text-align: center;">
              <p style="margin: 0 0 15px 0; color: #ffffff; font-size: 18px; font-weight: 600;">
                C'est le moment de passer à l'action 💪
              </p>
              <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.6;">
                Applique ce que tu vas apprendre avec discipline et régularité.<br>
                Les résultats suivront.
              </p>
            </td>
          </tr>

          <!-- CTA Coaching -->
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <a href="https://achzodcoaching.com/formules-coaching" style="display: inline-block; background: transparent; color: #FFB3C7; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border: 2px solid #FFB3C7;">
                Découvrir mes coachings
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #1a1a1a; padding-top: 30px; text-align: center;">
              <p style="margin: 0 0 15px 0; color: #444; font-size: 12px;">
                Une question ? Réponds directement à cet email.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="https://www.instagram.com/achzod/" style="color: #666; text-decoration: none; font-size: 20px;">📸</a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.youtube.com/channel/UCEsLHqeUffGZRXCH1gQw9rA" style="color: #666; text-decoration: none; font-size: 20px;">🎬</a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://twitter.com/achzod" style="color: #666; text-decoration: none; font-size: 20px;">🐦</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; color: #333; font-size: 11px;">
                © 2025 AchzodCoaching. Tous droits réservés.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Fonction pour envoyer l'email avec les ebooks
async function sendEbookEmail(customerEmail, customerName, ebooks, totalAmount) {
  const mailOptions = {
    from: {
      name: 'AchzodCoaching',
      address: process.env.EMAIL_USER || 'achzodyt@gmail.com'
    },
    to: customerEmail,
    subject: '📖 Tes ebooks ACHZOD sont prêts !',
    html: generateEmailHTML(customerName, ebooks, totalAmount)
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email envoyé à:', customerEmail);
    return true;
  } catch (error) {
    console.error('Erreur envoi email:', error);
    return false;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isCoachingProduct(productName) {
  const normalized = String(productName || '').toLowerCase();
  return PRODUCTS.some((product) => product.kind === 'coaching' &&
    product.aliases.some((alias) => normalized.includes(alias)));
}

function generateCoachingEmailHTML(customerName, products, ebooks, totalAmount) {
  const safeName = escapeHtml(customerName);
  const items = products.map((product) => `<li style="margin:8px 0;color:#fff">${escapeHtml(product)}</li>`).join('');
  const downloads = ebooks.length
    ? `<p style="color:#aaa;margin:24px 0 10px">Tes téléchargements:</p>${ebooks.map((ebook) =>
        `<p style="margin:8px 0"><a href="${escapeHtml(ebook.link)}" style="color:#FFB3C7">${escapeHtml(ebook.name)}</a></p>`
      ).join('')}`
    : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#0A0B09;color:#fff;font-family:Arial,sans-serif;padding:24px">
    <div style="max-width:620px;margin:auto;background:#151515;border:1px solid #2a2a2a;border-radius:16px;padding:32px">
      <h1 style="color:#FFB3C7;margin:0 0 20px">Ton coaching est confirmé</h1>
      <p style="line-height:1.7;color:#ddd">Merci${safeName ? ` ${safeName}` : ''}. Ton paiement est bien validé et ta place est réservée.</p>
      <ul style="padding-left:22px">${items}</ul>
      <p style="font-size:18px;color:#FFB3C7;font-weight:700">Total payé: ${escapeHtml(totalAmount)}€</p>
      <p style="line-height:1.7;color:#ddd">Je te contacte rapidement pour lancer ton accompagnement et récupérer les informations nécessaires.</p>
      ${downloads}
      <p style="margin-top:28px"><a href="https://wa.me/971585210514?text=${encodeURIComponent('Salut Achzod, je viens de commander mon coaching.')}" style="display:inline-block;background:#25D366;color:#08130c;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700">Me contacter sur WhatsApp</a></p>
      <p style="margin-top:28px;color:#777;font-size:13px">Une question? Réponds directement à cet email.</p>
    </div>
  </body></html>`;
}

async function sendCustomerOrderEmail(customerEmail, customerName, products, ebooks, totalAmount) {
  if (!products.some(isCoachingProduct)) {
    return sendEbookEmail(customerEmail, customerName, ebooks, totalAmount);
  }
  try {
    await transporter.sendMail({
      from: {
        name: 'AchzodCoaching',
        address: process.env.EMAIL_USER || 'achzodyt@gmail.com',
      },
      to: customerEmail,
      subject: 'Ton coaching ACHZOD est confirmé',
      html: generateCoachingEmailHTML(customerName, products, ebooks, totalAmount),
    });
    console.log('Confirmation coaching envoyée à:', customerEmail);
    return true;
  } catch (error) {
    console.error('Erreur confirmation coaching:', error);
    return false;
  }
}

// Fonction pour envoyer une notification à Achzod pour chaque commande Klarna
async function sendOrderNotification(customerEmail, customerName, products, totalAmount, paymentMethod) {
  const safeCustomerEmail = escapeHtml(customerEmail);
  const safeCustomerName = escapeHtml(customerName || 'Non renseigné');
  const safeProducts = products.map(escapeHtml);
  const safeTotalAmount = escapeHtml(totalAmount);
  const safePaymentMethod = escapeHtml(paymentMethod || 'Klarna/Stripe');
  
  const htmlNotification = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #0A0B09; padding: 20px;">
  <div style="max-width: 500px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 30px; border: 1px solid #2a2a2a;">
    <h1 style="color: #FFB3C7; margin: 0 0 20px 0; font-size: 24px;">💰 Nouvelle vente Klarna !</h1>
    
    <table style="width: 100%; color: #fff; font-size: 14px;">
      <tr>
        <td style="padding: 8px 0; color: #888;">Client</td>
        <td style="padding: 8px 0; color: #fff; font-weight: bold;">${safeCustomerName}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Email</td>
        <td style="padding: 8px 0; color: #FFB3C7;">${safeCustomerEmail}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Produit(s)</td>
        <td style="padding: 8px 0; color: #fff;">${safeProducts.join('<br>')}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Montant</td>
        <td style="padding: 8px 0; color: #4CAF50; font-size: 20px; font-weight: bold;">${safeTotalAmount}€</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Paiement</td>
        <td style="padding: 8px 0; color: #fff;">${safePaymentMethod}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Date</td>
        <td style="padding: 8px 0; color: #fff;">${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</td>
      </tr>
    </table>
    
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #2a2a2a; text-align: center;">
      <a href="https://dashboard.stripe.com/payments" style="color: #FFB3C7; text-decoration: none;">Voir dans Stripe →</a>
    </div>
  </div>
</body>
</html>
  `;

  const adminEmail = process.env.ADMIN_EMAIL || 'achkou@gmail.com';
  
  const mailOptions = {
    from: {
      name: 'ACHZOD Notifications',
      address: process.env.EMAIL_USER || 'achzodyt@gmail.com'
    },
    to: adminEmail,
    subject: `💰 Vente Klarna: ${totalAmount}€ - ${products[0] || 'Produit'}`,
    html: htmlNotification
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Notification envoyée à', adminEmail);
    return true;
  } catch (error) {
    console.error('Erreur envoi notification:', error);
    return false;
  }
}

const fulfillmentInFlight = new Set();

function getFulfillmentMetadata(session) {
  const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  return {
    ...(paymentIntent?.metadata || {}),
    ...(session.metadata || {}),
  };
}

async function persistFulfillmentMetadata(stripe, session, patch) {
  const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  const mergedSessionMetadata = { ...(session.metadata || {}), ...patch };

  if (typeof stripe.checkout.sessions.update === 'function') {
    try {
      const refreshed = await stripe.checkout.sessions.update(session.id, {
        metadata: mergedSessionMetadata,
      });
      return { ...session, ...refreshed, metadata: refreshed.metadata || mergedSessionMetadata };
    } catch (error) {
      console.warn('Mise à jour metadata checkout.session impossible, fallback payment_intent:', error.message);
    }
  }

  if (paymentIntent?.id) {
    const refreshedIntent = await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: { ...(paymentIntent.metadata || {}), ...patch },
    });
    return { ...session, payment_intent: refreshedIntent, metadata: mergedSessionMetadata };
  }

  throw new Error('Aucun support de persistence metadata pour cette session');
}

async function fulfillPaidCheckout(stripe, sessionId, paymentMethod) {
  if (fulfillmentInFlight.has(sessionId)) return { duplicate: true };
  fulfillmentInFlight.add(sessionId);
  try {
    let session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
    if (session.payment_status !== 'paid') return { pending: true };
    let fulfillmentMetadata = getFulfillmentMetadata(session);

    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || '';
    const totalAmount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0.00';
    if (!customerEmail) throw new Error('Email client absent sur une commande payée');

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    const ebooks = [];
    const productNames = [];
    for (const item of lineItems.data) {
      const rawName = item.description || item.price?.nickname || 'Produit';
      const displayName = item.quantity > 1 ? `${rawName} x${item.quantity}` : rawName;
      productNames.push(displayName);
      const ebookData = findEbookLink(rawName);
      if (ebookData) ebooks.push(ebookData);
    }

    if (!fulfillmentMetadata.admin_notification_sent_at) {
      const sent = await sendOrderNotification(customerEmail, customerName, productNames, totalAmount, paymentMethod);
      if (!sent) throw new Error('Notification vendeur non envoyée');
      session = await persistFulfillmentMetadata(stripe, session, {
        admin_notification_sent_at: new Date().toISOString(),
      });
      fulfillmentMetadata = getFulfillmentMetadata(session);
    }

    if (!fulfillmentMetadata.customer_email_sent_at) {
      const sent = await sendCustomerOrderEmail(customerEmail, customerName, productNames, ebooks, totalAmount);
      if (!sent) throw new Error('Confirmation client non envoyée');
      session = await persistFulfillmentMetadata(stripe, session, {
        customer_email_sent_at: new Date().toISOString(),
        fulfillment_status: 'sent',
      });
      fulfillmentMetadata = getFulfillmentMetadata(session);
    }
    return { delivered: true };
  } finally {
    fulfillmentInFlight.delete(sessionId);
  }
}

function paymentMethodLabelForReplay(account) {
  return account === 'fr' ? 'Klarna (replay)' : 'Stripe (replay)';
}

async function resolveCheckoutSessionForReplay(sessionId, preferredAccount = 'auto') {
  const candidates = preferredAccount === 'fr'
    ? [{ key: 'fr', stripe: stripeFR }]
    : preferredAccount === 'uae'
      ? [{ key: 'uae', stripe: stripeUAE }]
      : [{ key: 'uae', stripe: stripeUAE }, { key: 'fr', stripe: stripeFR }];

  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate.stripe) continue;
    try {
      const session = await candidate.stripe.checkout.sessions.retrieve(sessionId);
      return { account: candidate.key, stripe: candidate.stripe, session };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Session Stripe introuvable');
}

function registerStripeWebhook(path, stripe, secretName, paymentMethod) {
  app.post(path, async (req, res) => {
    const secret = process.env[secretName];
    const signature = req.headers['stripe-signature'];
    let event;
    try {
      if (!stripe || !secret || !signature) throw new Error('Configuration ou signature webhook absente');
      event = stripe.webhooks.constructEvent(req.body, signature, secret);
    } catch (error) {
      console.error(`Webhook invalide ${path}:`, error.message);
      return res.status(400).send('Webhook Error');
    }

    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      return res.json({ received: true, ignored: true });
    }
    try {
      const result = await fulfillPaidCheckout(stripe, event.data.object.id, paymentMethod);
      return res.json({ received: true, ...result });
    } catch (error) {
      console.error(`Échec livraison ${path}:`, error);
      return res.status(500).json({ received: true, delivered: false });
    }
  });
}

registerStripeWebhook('/webhook', stripeUAE, 'STRIPE_WEBHOOK_SECRET', 'Stripe');
registerStripeWebhook('/webhook-klarna', stripeFR, 'STRIPE_WEBHOOK_SECRET_FR', 'Klarna');

// Route pour récupérer les données complètes de la commande depuis la page de confirmation
app.get('/order-data', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id requis' });
    }

    // Essayer d'abord avec Stripe UAE
    let session, lineItems, stripe;
    try {
      session = await stripeUAE.checkout.sessions.retrieve(session_id, {
        expand: ['customer_details', 'payment_intent']
      });
      lineItems = await stripeUAE.checkout.sessions.listLineItems(session_id, {
        expand: ['data.price.product']
      });
      stripe = stripeUAE;
    } catch (err) {
      // Si ça échoue, essayer avec Stripe FR
      if (stripeFR) {
        try {
          session = await stripeFR.checkout.sessions.retrieve(session_id, {
            expand: ['customer_details', 'payment_intent']
          });
          lineItems = await stripeFR.checkout.sessions.listLineItems(session_id, {
            expand: ['data.price.product']
          });
          stripe = stripeFR;
        } catch (err2) {
          console.error('❌ Session non trouvée dans UAE ni FR:', err2.message);
          return res.status(404).json({ error: 'Session non trouvée' });
        }
      } else {
        return res.status(404).json({ error: 'Session non trouvée' });
      }
    }

    // Vérifier que la session est complétée
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Paiement non complété' });
    }

    const ebooks = [];
    const productNames = [];
    const items = [];
    
    for (const item of lineItems.data) {
      // Essayer plusieurs champs pour trouver le nom du produit
      const productName = item.description || 
                          item.price?.product?.name || 
                          item.price?.product?.description ||
                          item.price?.nickname ||
                          'Produit';
      const price = (item.amount_total / 100).toFixed(2);
      const quantity = item.quantity;
      
      productNames.push(productName);
      items.push({
        name: productName,
        price: parseFloat(price),
        quantity: quantity
      });
      
      const ebookData = findEbookLink(productName);
      if (ebookData) {
        ebooks.push(ebookData);
      }
    }

    const totalAmount = (session.amount_total / 100).toFixed(2);
    const currency = session.currency.toUpperCase();
    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || '';

    res.json({
      success: true,
      order: {
        id: session.id,
        total: totalAmount,
        currency: currency,
        customerEmail: customerEmail,
        customerName: customerName,
        items: items,
        paymentStatus: session.payment_status,
        paymentMethod: session.payment_method_types?.[0] || 'unknown'
      },
      ebooks: ebooks,
      products: productNames,
      found: ebooks.length > 0
    });
  } catch (error) {
    console.error('Erreur récupération données commande:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour récupérer les liens de téléchargement depuis la page de confirmation
app.get('/download-links', async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      return res.status(400).json({ error: 'session_id requis' });
    }

    // Essayer d'abord avec Stripe UAE
    let session, lineItems, stripe;
    try {
      session = await stripeUAE.checkout.sessions.retrieve(session_id);
      lineItems = await stripeUAE.checkout.sessions.listLineItems(session_id);
      stripe = stripeUAE;
    } catch (err) {
      // Si ça échoue, essayer avec Stripe FR
      if (stripeFR) {
        try {
          session = await stripeFR.checkout.sessions.retrieve(session_id);
          lineItems = await stripeFR.checkout.sessions.listLineItems(session_id);
          stripe = stripeFR;
        } catch (err2) {
          return res.status(404).json({ error: 'Session non trouvée' });
        }
      } else {
        return res.status(404).json({ error: 'Session non trouvée' });
      }
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Paiement non complété' });
    }

    const ebooks = [];
    const productNames = [];
    
    for (const item of lineItems.data) {
      // Essayer plusieurs champs pour trouver le nom du produit
      const productName = item.description || 
                          item.price?.product?.name || 
                          item.price?.product?.description ||
                          item.price?.nickname ||
                          'Produit';
      console.log('📦 Produit trouvé (download-links):', productName);
      productNames.push(productName);
      const ebookData = findEbookLink(productName);
      
      if (ebookData) {
        ebooks.push(ebookData);
      }
    }

    res.json({
      success: true,
      ebooks: ebooks,
      products: productNames,
      found: ebooks.length > 0
    });
  } catch (error) {
    console.error('Erreur récupération liens:', error);
    res.status(500).json({ error: error.message });
  }
});

function healthCheck(req, res) {
  const requiredPromotions = ['BIOSCAN59', 'ULTIMATE79', 'BLOOD99', 'FAQ50'];
  const promotionConfig = Object.fromEntries(requiredPromotions.map((code) => [
    code,
    {
      fr: Boolean(process.env[`STRIPE_FR_PROMO_${code}`]),
      uae: Boolean(process.env[`STRIPE_UAE_PROMO_${code}`]),
    },
  ]));
  const checks = {
    stripeUAE: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeFR: Boolean(process.env.STRIPE_SECRET_KEY_FR),
    webhookUAE: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    webhookFR: Boolean(process.env.STRIPE_WEBHOOK_SECRET_FR),
    email: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    promotionsFR: Object.values(promotionConfig).every((entry) => entry.fr),
    promotionsUAE: Object.values(promotionConfig).every((entry) => entry.uae),
  };
  const green = Object.values(checks).every(Boolean);
  res.status(green ? 200 : 503).json({
    status: green ? 'ok' : 'configuration_incomplete',
    green,
    checks,
    promotionConfig,
    catalogProducts: PRODUCTS.length,
    starterRemoved: !PRODUCTS.some((product) => product.name.toLowerCase() === 'starter'),
    timestamp: new Date().toISOString(),
  });
}
app.get('/', healthCheck);
app.get('/health', healthCheck);
app.get('/webflow-klarna.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.type('application/javascript').sendFile('webflow-klarna.js', { root: __dirname });
});

// Route pour créer/récupérer le webhook Stripe FR automatiquement
app.get('/setup-webhook-fr', requireDiagnosticAuth, async (req, res) => {
  if (!stripeFR) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY_FR non configuré' });
  }
  
  try {
    const existingWebhooks = await stripeFR.webhookEndpoints.list({ limit: 100 });
    const webhookUrl = 'https://achzod-klarna-checkout.onrender.com/webhook-klarna';
    
    const existing = existingWebhooks.data.find(w => w.url === webhookUrl);
    
    if (existing) {
      // Le webhook existe, on le supprime et on en crée un nouveau pour avoir le secret
      if (req.query.recreate === 'true') {
        await stripeFR.webhookEndpoints.del(existing.id);
        console.log('Ancien webhook supprimé:', existing.id);
      } else {
        return res.json({
          status: 'EXISTS',
          message: 'Le webhook existe déjà',
          webhook_id: existing.id,
          url: existing.url,
          events: existing.enabled_events,
          action: 'Ajoute ?recreate=true à l\'URL pour le recréer et obtenir le secret',
          note: 'Ou va dans Stripe Dashboard > Developers > Webhooks pour révéler le Signing secret'
        });
      }
    }
    
    // Créer le webhook
    const webhook = await stripeFR.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'],
      description: 'Webhook Klarna ACHZOD - Notifications commandes'
    });
    
    res.json({
      status: 'CREATED',
      message: 'Webhook créé avec succès !',
      webhook_id: webhook.id,
      url: webhook.url,
      events: webhook.enabled_events,
      secret: webhook.secret,
      IMPORTANT: '⬆️ COPIE CE SECRET ET AJOUTE-LE SUR RENDER',
      instructions: [
        '1. Copie le secret ci-dessus: ' + webhook.secret,
        '2. Va sur https://dashboard.render.com',
        '3. Clique sur achzod-klarna-checkout',
        '4. Va dans Environment > Environment Variables',
        '5. Ajoute: STRIPE_WEBHOOK_SECRET_FR = ' + webhook.secret,
        '6. Clique Save Changes puis Manual Deploy',
        '7. C\'est fait ! Les notifications Klarna fonctionneront !'
      ]
    });
    
  } catch (error) {
    console.error('Erreur webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Diagnostic endpoint (pour vérifier la config sans exposer les secrets)
app.get('/diagnostic', requireDiagnosticAuth, (req, res) => {
  const config = {
    email: {
      EMAIL_USER: process.env.EMAIL_USER ? '✅ ' + process.env.EMAIL_USER : '❌ NON DÉFINI',
      EMAIL_PASS: process.env.EMAIL_PASS ? '✅ configuré (' + process.env.EMAIL_PASS.length + ' chars)' : '❌ NON DÉFINI',
    },
    stripe_uae: {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? '✅ configuré' : '❌ NON DÉFINI',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? '✅ configuré' : '❌ NON DÉFINI',
    },
    stripe_fr: {
      STRIPE_SECRET_KEY_FR: process.env.STRIPE_SECRET_KEY_FR ? '✅ configuré' : '❌ NON DÉFINI',
      STRIPE_WEBHOOK_SECRET_FR: process.env.STRIPE_WEBHOOK_SECRET_FR ? '✅ configuré' : '❌ NON DÉFINI',
    },
    status: {
      stripeFR_initialized: stripeFR ? '✅ oui' : '❌ non (STRIPE_SECRET_KEY_FR manquant)',
      transporter_ready: transporter ? '✅ oui' : '❌ non',
    }
  };
  
  const allOK = process.env.EMAIL_USER && process.env.EMAIL_PASS && 
                process.env.STRIPE_SECRET_KEY_FR && process.env.STRIPE_WEBHOOK_SECRET_FR;
  
  res.json({
    status: allOK ? 'OK' : 'CONFIGURATION_INCOMPLETE',
    message: allOK ? 'Toutes les variables Klarna sont configurées' : 'Variables manquantes pour Klarna',
    config,
    help: allOK ? null : 'Voir DIAGNOSTIC-NOTIFICATIONS.md pour les instructions'
  });
});

// Diag: tester l'envoi d'email (Gmail App Password)
app.get('/test-email', requireDiagnosticAuth, async (req, res) => {
  try {
    const to = req.query.to || process.env.EMAIL_USER || 'achzodyt@gmail.com';
    const info = await transporter.sendMail({
      from: `"ACHZOD DIAG" <${process.env.EMAIL_USER || 'achzodyt@gmail.com'}>`,
      to,
      subject: '✅ Test email ACHZOD - ' + new Date().toISOString(),
      text: 'Si tu lis ça, Gmail App Password fonctionne. Donc le problème vient de Stripe (webhook).',
    });
    res.json({ status: 'OK', messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (error) {
    res.status(500).json({ status: 'ERREUR', error: error.message, code: error.code, command: error.command });
  }
});

// Diag: lister les webhooks Stripe FR (état, URL, dernier échec)
app.get('/list-webhook-fr', requireDiagnosticAuth, async (req, res) => {
  try {
    if (!stripeFR) return res.status(400).json({ error: 'stripeFR non initialisé' });
    const webhooks = await stripeFR.webhookEndpoints.list({ limit: 100 });
    res.json({
      count: webhooks.data.length,
      webhooks: webhooks.data.map(w => ({
        id: w.id,
        url: w.url,
        status: w.status,
        enabled_events: w.enabled_events,
        created: new Date(w.created * 1000).toISOString(),
        description: w.description,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diag: rejouer manuellement un event Stripe FR (commande non délivrée)
app.get('/replay-event', requireDiagnosticAuth, async (req, res) => {
  try {
    if (!stripeFR) return res.status(400).json({ error: 'stripeFR non initialisé' });
    const eventId = req.query.id;
    if (!eventId) return res.status(400).json({ error: 'Paramètre ?id=evt_xxx requis' });

    const event = await stripeFR.events.retrieve(eventId);
    if (event.type !== 'checkout.session.completed') {
      return res.status(400).json({ error: 'Event non supporté: ' + event.type });
    }

    const session = event.data.object;
    const replay = await fulfillPaidCheckout(stripeFR, session.id, paymentMethodLabelForReplay('fr'));
    const refreshed = await stripeFR.checkout.sessions.retrieve(session.id);

    res.json({
      status: 'REPLAYED',
      event_id: eventId,
      session_id: session.id,
      replay,
      metadata: refreshed.metadata,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diag: rejouer proprement le fulfillment complet d'une session Stripe par session_id
app.get('/replay-session', requireDiagnosticAuth, async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || '').trim();
    const account = String(req.query.account || 'auto').trim().toLowerCase();
    if (!sessionId) return res.status(400).json({ error: 'Paramètre ?session_id=cs_xxx requis' });
    if (!['auto', 'uae', 'fr'].includes(account)) {
      return res.status(400).json({ error: 'Paramètre ?account=auto|uae|fr invalide' });
    }

    const resolved = await resolveCheckoutSessionForReplay(sessionId, account);
    const replay = await fulfillPaidCheckout(
      resolved.stripe,
      sessionId,
      paymentMethodLabelForReplay(resolved.account),
    );
    const refreshed = await resolved.stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      status: 'REPLAYED',
      session_id: sessionId,
      account: resolved.account,
      replay,
      payment_status: refreshed.payment_status,
      metadata: refreshed.metadata,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diag: derniers events checkout.session.completed sur Stripe FR
app.get('/recent-events-fr', requireDiagnosticAuth, async (req, res) => {
  try {
    if (!stripeFR) return res.status(400).json({ error: 'stripeFR non initialisé' });
    const events = await stripeFR.events.list({
      type: 'checkout.session.completed',
      limit: 10,
    });
    res.json({
      count: events.data.length,
      events: events.data.map(e => ({
        id: e.id,
        created: new Date(e.created * 1000).toISOString(),
        pending_webhooks: e.pending_webhooks,
        customer_email: e.data.object?.customer_details?.email,
        amount_total: e.data.object?.amount_total,
        payment_status: e.data.object?.payment_status,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
