const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
  'anabolic code': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'liberer son potentiel': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel genetique': 'https://gofile.io/d/gWybQ6',
  '4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  '4 semaines shred': 'https://gofile.io/d/5SylgY',
  'bioenergetique': 'https://gofile.io/d/Hn6GE1',
};

app.use(cors());

// Webhook Stripe doit recevoir le body brut
app.use('/webhook', express.raw({ type: 'application/json' }));
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

// Fonction pour trouver le lien ebook
function findEbookLink(productName) {
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  
  for (const [key, link] of Object.entries(EBOOK_LINKS)) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return { name: productName, link: link };
    }
  }
  return null;
}

// Fonction pour envoyer l'email avec l'ebook
async function sendEbookEmail(customerEmail, customerName, productName, ebookLink) {
  const mailOptions = {
    from: '"Achzod Coaching" <achzodyt@gmail.com>',
    to: customerEmail,
    subject: '📚 Votre ebook est prêt à être téléchargé !',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #0A0B09; font-size: 28px; margin: 0;">ACHZOD</h1>
        </div>
        
        <h2 style="color: #333; text-align: center;">Bonjour${customerName ? ' ' + customerName : ''}, votre e-book est prêt !</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Merci pour votre achat. Voici le lien de téléchargement de votre e-book, disponible à vie :
        </p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 15px 0; font-weight: bold; color: #333;">${productName}</p>
          <a href="${ebookLink}" 
             style="display: inline-block; background: #0A0B09; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Télécharger
          </a>
        </div>
        
        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          Si vous avez des questions, n'hésitez pas à nous contacter.
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
          <p>© 2025 Achzod Coaching. Tous droits réservés.</p>
        </div>
      </div>
    `
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

// Webhook Stripe pour les paiements réussis
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Sans webhook secret (pour les tests)
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Traiter l'événement checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('Paiement réussi:', session.id);
    
    // Récupérer les détails de la session
    const customerEmail = session.customer_email || session.customer_details?.email;
    const customerName = session.customer_details?.name || '';
    
    if (customerEmail) {
      // Récupérer les line items
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        
        for (const item of lineItems.data) {
          const productName = item.description || item.price?.product?.name || 'Produit';
          const ebookData = findEbookLink(productName);
          
          if (ebookData) {
            // C'est un ebook, envoyer l'email
            await sendEbookEmail(customerEmail, customerName, productName, ebookData.link);
          }
        }
      } catch (error) {
        console.error('Erreur récupération line items:', error);
      }
    }
  }

  res.json({ received: true });
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Achzod Klarna Checkout API' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
