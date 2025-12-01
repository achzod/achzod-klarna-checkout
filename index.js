const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// Mapping des produits Webflow vers les Price IDs Stripe
const PRICE_MAPPING = {
  // Coaching
  'coaching sans suivi': 'price_1SY91kINPqlywHW9TSOl2y0g',
  'starter': 'price_1SY91lINPqlywHW9WSRtSqRk',

  // Essential
  'essential 4 semaines': 'price_1SY91mINPqlywHW9gEaZhZb2',
  'essential 8 semaines': 'price_1SY91nINPqlywHW96BXxKqcS',
  'essential 12 semaines': 'price_1SY91oINPqlywHW9bhipMEWg',
  '4 semaines - essential': 'price_1SY91mINPqlywHW9gEaZhZb2',
  '8 semaines - essential': 'price_1SY91nINPqlywHW96BXxKqcS',
  '12 semaines - essential': 'price_1SY91oINPqlywHW9bhipMEWg',

  // Elite
  'elite 4 semaines': 'price_1SY91pINPqlywHW97WqPrzev',
  'elite 8 semaines': 'price_1SY91rINPqlywHW9WvouAXbj',
  'elite 12 semaines': 'price_1SY91sINPqlywHW9tSyv1mIS',
  '4 semaines - elite': 'price_1SY91pINPqlywHW97WqPrzev',
  '8 semaines - elite': 'price_1SY91rINPqlywHW9WvouAXbj',
  '12 semaines - elite': 'price_1SY91sINPqlywHW9tSyv1mIS',

  // Private Lab
  'private lab 4 semaines': 'price_1SY91tINPqlywHW93PI9jF4C',
  'private lab 8 semaines': 'price_1SY91vINPqlywHW9iHAGvybY',
  'private lab 12 semaines': 'price_1SY91wINPqlywHW9BtxvHp3S',
  '4 semaines - private lab': 'price_1SY91tINPqlywHW93PI9jF4C',
  '8 semaines - private lab': 'price_1SY91vINPqlywHW9iHAGvybY',
  '12 semaines - private lab': 'price_1SY91wINPqlywHW9BtxvHp3S',
  'achzod private lab': 'price_1SY91tINPqlywHW93PI9jF4C',

  // Ebooks
  'anabolic code': 'price_1SY91xINPqlywHW9qTdCvEVP',
  'liberer son potentiel': 'price_1SY91zINPqlywHW9kXzV1o59',
  '4 semaines pour etre shred': 'price_1SY920INPqlywHW9Z5Teyljl',
  '4 semaines shred': 'price_1SY920INPqlywHW9Z5Teyljl',
  'bioenergetique': 'price_1SY921INPqlywHW99DvCbajf',
};

// Mapping par montant en centimes (fallback)
const PRICE_BY_AMOUNT = {
  9900: 'price_1SY91kINPqlywHW9TSOl2y0g',
  14900: 'price_1SY91lINPqlywHW9WSRtSqRk',
  24900: 'price_1SY91mINPqlywHW9gEaZhZb2',
  39900: 'price_1SY91nINPqlywHW96BXxKqcS',
  54900: 'price_1SY91oINPqlywHW9bhipMEWg',
  64900: 'price_1SY91rINPqlywHW9WvouAXbj',
  89900: 'price_1SY91sINPqlywHW9tSyv1mIS',
  49900: 'price_1SY91tINPqlywHW93PI9jF4C',
  79900: 'price_1SY91vINPqlywHW9iHAGvybY',
  119900: 'price_1SY91wINPqlywHW9BtxvHp3S',
  7900: 'price_1SY91xINPqlywHW9qTdCvEVP',
  4900: 'price_1SY91zINPqlywHW9kXzV1o59',
  5900: 'price_1SY921INPqlywHW99DvCbajf',
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
app.post('/checkout', async (req, res) => {
  try {
    const { items, successUrl, cancelUrl, customerEmail, totalAmount, discountCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Panier vide' });
    }

    let lineItems = [];

    // Si un total avec réduction est fourni, l'utiliser
    if (totalAmount && totalAmount > 0) {
      // Créer un seul line item avec le total réel
      const itemNames = items.map(i => i.name).join(' + ');
      lineItems = [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: itemNames.substring(0, 100),
            description: discountCode ? `Code promo: ${discountCode}` : undefined
          },
          unit_amount: Math.round(totalAmount * 100),
        },
        quantity: 1,
      }];
    } else {
      // Pas de réduction, utiliser les prix individuels
      lineItems = items.map(item => {
        const priceId = findPriceId(item.name, item.price);

        if (priceId) {
          return { price: priceId, quantity: item.quantity || 1 };
        } else {
          return {
            price_data: {
              currency: 'eur',
              product_data: { name: item.name },
              unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity || 1,
          };
        }
      });
    }

    const sessionConfig = {
      payment_method_types: ['card', 'klarna'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || 'https://achzodcoaching.com/order-confirmation',
      cancel_url: cancelUrl || 'https://achzodcoaching.com/checkout',
      billing_address_collection: 'required',
      locale: 'fr',
    };

    // Ajouter l'email du client pour le reçu Stripe
    if (customerEmail && customerEmail.trim()) {
      sessionConfig.customer_email = customerEmail.trim();
      sessionConfig.payment_intent_data = {
        receipt_email: customerEmail.trim(),
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });

  } catch (error) {
    console.error('Erreur Stripe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Achzod Klarna Checkout API' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
