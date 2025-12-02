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

    // Ajouter l'email du client (pour pré-remplir le formulaire, PAS pour le reçu Stripe)
    // On n'envoie PAS de receipt_email car on envoie notre propre email ACHZOD via webhook
    if (customerEmail && customerEmail.trim()) {
      sessionConfig.customer_email = customerEmail.trim();
      // PAS de receipt_email = pas de reçu Stripe automatique
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

// Générer le HTML de l'email au style ACHZOD
function generateEmailHTML(customerName, ebooks, totalAmount) {
  const ebookListHTML = ebooks.map(ebook => `
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
  `).join('');

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
                      Merci pour ta commande${customerName ? ', ' + customerName : ''} 🔥
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

// Fonction pour envoyer une notification à Achzod pour chaque commande Klarna
async function sendOrderNotification(customerEmail, customerName, products, totalAmount, paymentMethod) {
  const productList = products.map(p => `• ${p}`).join('\n');
  
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
        <td style="padding: 8px 0; color: #fff; font-weight: bold;">${customerName || 'Non renseigné'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Email</td>
        <td style="padding: 8px 0; color: #FFB3C7;">${customerEmail}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Produit(s)</td>
        <td style="padding: 8px 0; color: #fff;">${products.join('<br>')}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Montant</td>
        <td style="padding: 8px 0; color: #4CAF50; font-size: 20px; font-weight: bold;">${totalAmount}€</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #888;">Paiement</td>
        <td style="padding: 8px 0; color: #fff;">${paymentMethod || 'Klarna/Stripe'}</td>
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

  const mailOptions = {
    from: {
      name: 'ACHZOD Notifications',
      address: process.env.EMAIL_USER || 'achzodyt@gmail.com'
    },
    to: 'achzodyt@gmail.com',
    subject: `💰 Vente Klarna: ${totalAmount}€ - ${products[0] || 'Produit'}`,
    html: htmlNotification
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Notification envoyée à achzodyt@gmail.com');
    return true;
  } catch (error) {
    console.error('Erreur envoi notification:', error);
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
    const totalAmount = session.amount_total ? (session.amount_total / 100).toFixed(2) : '0';
    const paymentMethod = session.payment_method_types?.[0] || 'Stripe';
    
    if (customerEmail) {
      // Récupérer les line items
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const ebooks = [];
        const productNames = [];
        
        for (const item of lineItems.data) {
          const productName = item.description || item.price?.product?.name || 'Produit';
          productNames.push(productName);
          const ebookData = findEbookLink(productName);
          
          if (ebookData) {
            ebooks.push(ebookData);
          }
        }
        
        // Envoyer notification à Achzod pour TOUTES les commandes Klarna
        await sendOrderNotification(customerEmail, customerName, productNames, totalAmount, paymentMethod);
        
        // Si des ebooks ont été trouvés, envoyer l'email au client avec les liens
        if (ebooks.length > 0) {
          const firstName = customerName.split(' ')[0] || '';
          await sendEbookEmail(customerEmail, firstName, ebooks, totalAmount);
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
