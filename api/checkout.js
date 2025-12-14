const Stripe = require('stripe');

// La clé API Stripe UAE
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Mapping des produits Webflow vers les Price IDs Stripe
const PRICE_MAPPING = {
  // Coaching
  'coaching sans suivi': { priceId: 'price_1SdvMiBTm0rdlVFq1quX3O14', amount: 9900 },
  'starter': { priceId: 'price_1SdvMiBTm0rdlVFqqNzpgaPc', amount: 14900 },

  // Essential
  'essential 4 semaines': { priceId: 'price_1SdvMiBTm0rdlVFqLfsmZktn', amount: 24900 },
  'essential 8 semaines': { priceId: 'price_1SdvMhBTm0rdlVFqH5DLanUx', amount: 39900 },
  'essential 12 semaines': { priceId: 'price_1SdvMhBTm0rdlVFqwk0q6GSp', amount: 54900 },
  '4 semaines - essential': { priceId: 'price_1SdvMiBTm0rdlVFqLfsmZktn', amount: 24900 },
  '8 semaines - essential': { priceId: 'price_1SdvMhBTm0rdlVFqH5DLanUx', amount: 39900 },
  '12 semaines - essential': { priceId: 'price_1SdvMhBTm0rdlVFqwk0q6GSp', amount: 54900 },

  // Elite
  'elite 4 semaines': { priceId: 'price_1SdvMgBTm0rdlVFqzHfzhM8K', amount: 39900 },
  'elite 8 semaines': { priceId: 'price_1SdvMgBTm0rdlVFqN0ApjtgB', amount: 64900 },
  'elite 12 semaines': { priceId: 'price_1SdvMgBTm0rdlVFqstDCjSEg', amount: 89900 },
  '4 semaines - elite': { priceId: 'price_1SdvMgBTm0rdlVFqzHfzhM8K', amount: 39900 },
  '8 semaines - elite': { priceId: 'price_1SdvMgBTm0rdlVFqN0ApjtgB', amount: 64900 },
  '12 semaines - elite': { priceId: 'price_1SdvMgBTm0rdlVFqstDCjSEg', amount: 89900 },

  // Private Lab
  'private lab 4 semaines': { priceId: 'price_1SdvMfBTm0rdlVFq3DbslVyj', amount: 49900 },
  'private lab 8 semaines': { priceId: 'price_1SdvMfBTm0rdlVFq1RDNoRrL', amount: 79900 },
  'private lab 12 semaines': { priceId: 'price_1SdvMeBTm0rdlVFqtP697rjn', amount: 119900 },
  '4 semaines - private lab': { priceId: 'price_1SdvMfBTm0rdlVFq3DbslVyj', amount: 49900 },
  '8 semaines - private lab': { priceId: 'price_1SdvMfBTm0rdlVFq1RDNoRrL', amount: 79900 },
  '12 semaines - private lab': { priceId: 'price_1SdvMeBTm0rdlVFqtP697rjn', amount: 119900 },
  'achzod private lab 4 semaines': { priceId: 'price_1SdvMfBTm0rdlVFq3DbslVyj', amount: 49900 },
  'achzod private lab 8 semaines': { priceId: 'price_1SdvMfBTm0rdlVFq1RDNoRrL', amount: 79900 },
  'achzod private lab 12 semaines': { priceId: 'price_1SdvMeBTm0rdlVFqtP697rjn', amount: 119900 },

  // Ebooks
  'anabolic code': { priceId: 'price_1SdvMeBTm0rdlVFqZEmcaDNm', amount: 7900 },
  'libérer son potentiel génétique': { priceId: 'price_1SdvMeBTm0rdlVFqTi8xNboT', amount: 4900 },
  'liberer son potentiel genetique': { priceId: 'price_1SdvMeBTm0rdlVFqTi8xNboT', amount: 4900 },
  '4 semaines pour être shred': { priceId: 'price_1SdvMdBTm0rdlVFqHi638498', amount: 4900 },
  '4 semaines pour etre shred': { priceId: 'price_1SdvMdBTm0rdlVFqHi638498', amount: 4900 },
  'bioénergétique': { priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', amount: 5900 },
  'bioenergetique': { priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', amount: 5900 },
  'bioénergétique et timing': { priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', amount: 5900 },
  'bioenergetique et timing de la nutrition': { priceId: 'price_1SdvMdBTm0rdlVFqboosk1lb', amount: 5900 },
};

// Mapping par prix (fallback)
const PRICE_BY_AMOUNT = {
  9900: 'price_1SdvMiBTm0rdlVFq1quX3O14',   // Sans Suivi 99€
  14900: 'price_1SdvMiBTm0rdlVFqqNzpgaPc',  // Starter 149€
  24900: 'price_1SdvMiBTm0rdlVFqLfsmZktn',  // Essential 4 sem 249€
  39900: 'price_1SdvMhBTm0rdlVFqH5DLanUx',  // Essential 8 sem 399€ (ou Elite 4 sem)
  54900: 'price_1SdvMhBTm0rdlVFqwk0q6GSp',  // Essential 12 sem 549€
  64900: 'price_1SdvMgBTm0rdlVFqN0ApjtgB',  // Elite 8 sem 649€
  89900: 'price_1SdvMgBTm0rdlVFqstDCjSEg',  // Elite 12 sem 899€
  49900: 'price_1SdvMfBTm0rdlVFq3DbslVyj',  // Private Lab 4 sem 499€
  79900: 'price_1SdvMfBTm0rdlVFq1RDNoRrL',  // Private Lab 8 sem 799€
  119900: 'price_1SdvMeBTm0rdlVFqtP697rjn', // Private Lab 12 sem 1199€
  7900: 'price_1SdvMeBTm0rdlVFqZEmcaDNm',   // Anabolic Code 79€
  4900: 'price_1SdvMeBTm0rdlVFqTi8xNboT',   // Ebooks 49€
  5900: 'price_1SdvMdBTm0rdlVFqboosk1lb',   // Bioénergétique 59€
};

function findPriceId(productName, amount) {
  // Nettoyer le nom du produit
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Enlever accents
    .replace(/[^a-z0-9\s]/g, '') // Enlever caractères spéciaux
    .trim();

  // Chercher par nom
  for (const [key, value] of Object.entries(PRICE_MAPPING)) {
    const cleanKey = key.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    if (cleanName.includes(cleanKey) || cleanKey.includes(cleanName)) {
      return value.priceId;
    }
  }

  // Fallback: chercher par montant
  const amountInCents = Math.round(amount * 100);
  if (PRICE_BY_AMOUNT[amountInCents]) {
    return PRICE_BY_AMOUNT[amountInCents];
  }

  return null;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, successUrl, cancelUrl, customerEmail } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Construire les line_items pour Stripe
    const lineItems = [];

    for (const item of items) {
      const priceId = findPriceId(item.name, item.price);

      if (priceId) {
        lineItems.push({
          price: priceId,
          quantity: item.quantity || 1,
        });
      } else {
        // Produit non trouvé dans le mapping - créer un prix à la volée
        lineItems.push({
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.name,
            },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: item.quantity || 1,
        });
      }
    }

    // Préparer les options de la session
    const sessionOptions = {
      payment_method_types: ['card', 'link'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || 'https://achzodcoaching.com/order-confirmation',
      cancel_url: cancelUrl || 'https://achzodcoaching.com/checkout',
      billing_address_collection: 'required',
      locale: 'fr',
      // Envoyer automatiquement un reçu par email après paiement
      payment_intent_data: {
        receipt_email: customerEmail || undefined,
      },
    };

    // Ajouter l'email du client si fourni (pré-remplit le formulaire Stripe)
    if (customerEmail && customerEmail.trim()) {
      sessionOptions.customer_email = customerEmail.trim();
    }

    // Créer la session Stripe Checkout
    const session = await stripe.checkout.sessions.create(sessionOptions);

    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
};
