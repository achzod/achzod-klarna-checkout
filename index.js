const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');

const app = express();

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
  'anabolic code': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'anabolic': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'liberer son potentiel': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel genetique': 'https://gofile.io/d/gWybQ6',
  'liberer': 'https://gofile.io/d/gWybQ6',
  'potentiel genetique': 'https://gofile.io/d/gWybQ6',
  'ebook': 'https://gofile.io/d/gWybQ6', // Fallback pour "EBOOK"
  '4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  '4 semaines shred': 'https://gofile.io/d/5SylgY',
  '4 semaines': 'https://gofile.io/d/5SylgY',
  'shred': 'https://gofile.io/d/5SylgY',
  'bioenergetique': 'https://gofile.io/d/Hn6GE1',
  'bioenergetique et timing': 'https://gofile.io/d/Hn6GE1',
};

app.use(cors());

// Webhook Stripe doit recevoir le body brut
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook-klarna', express.raw({ type: 'application/json' }));
app.use(express.json());

// Mapping des produits Webflow vers les Price IDs Stripe
const PRICE_MAPPING = {
  // Coaching
  'coaching sans suivi': 'price_1SdvMiBTm0rdlVFq1quX3O14',
  'starter': 'price_1SdvMiBTm0rdlVFqqNzpgaPc',

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
  14900: 'price_1SdvMiBTm0rdlVFqqNzpgaPc',
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
      payment_method_types: ['card', 'link'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || 'https://achzodcoaching.com/order-confirmation',
      cancel_url: cancelUrl || 'https://achzodcoaching.com/checkout',
      billing_address_collection: 'required',
      locale: 'fr',
      // Métadonnées pour que Stripe affiche "achzodcoaching" au lieu du nom personnel
      metadata: {
        merchant_name: 'achzodcoaching',
        business_name: 'AchzodCoaching'
      }
      // Note: Ne pas définir receipt_email = pas de reçu Stripe automatique
      // Les reçus Stripe doivent être désactivés dans le dashboard Stripe
    };

    // Ajouter l'email du client (pour pré-remplir le formulaire, PAS pour le reçu Stripe)
    // On n'envoie PAS de receipt_email car on envoie notre propre email ACHZOD via webhook
    if (customerEmail && customerEmail.trim()) {
      sessionConfig.customer_email = customerEmail.trim();
      // PAS de receipt_email = pas de reçu Stripe automatique
    }

    const session = await stripeUAE.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });

  } catch (error) {
    console.error('Erreur Stripe:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route Klarna - Utilise Stripe FR
app.post('/checkout-klarna', async (req, res) => {
  if (!stripeFR) {
    console.error('❌ STRIPE_SECRET_KEY_FR non configuré !');
    return res.status(500).json({ error: 'Configuration Stripe FR manquante. Contacte le support.' });
  }
  
  try {
    const { items, successUrl, cancelUrl, customerEmail, totalAmount, discountCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Panier vide' });
    }

    // Klarna minimum selon Stripe: 0,50€
    const computeItemsTotal = () =>
      items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    const effectiveTotal = Number(totalAmount) > 0 ? Number(totalAmount) : computeItemsTotal();
    const KLARNA_MIN_TOTAL_EUR = Number(process.env.KLARNA_MIN_TOTAL_EUR || 0.5);
    if (effectiveTotal > 0 && effectiveTotal < KLARNA_MIN_TOTAL_EUR) {
      return res.status(400).json({
        error: `Klarna indisponible en dessous de ${KLARNA_MIN_TOTAL_EUR}€ (total actuel: ${effectiveTotal.toFixed(2)}€). Utilise Carte/PayPal ou réduis la remise.`,
      });
    }

    let lineItems = [];

    // Si un total avec réduction est fourni, l'utiliser
    if (totalAmount && totalAmount > 0) {
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
      // Pour Klarna (Stripe FR), toujours utiliser price_data (pas de Price IDs)
      lineItems = items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.name },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity || 1,
      }));
    }

    const sessionConfig = {
      // Card en premier pour éviter les blocages Klarna
      // Si Klarna est disponible, Stripe l'affichera automatiquement
      payment_method_types: ['card', 'klarna'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl || 'https://achzodcoaching.com/order-confirmation',
      cancel_url: cancelUrl || 'https://achzodcoaching.com/checkout',
      billing_address_collection: 'required',
      locale: 'fr',
      // Expiration plus longue pour éviter les sessions expirées
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      // Forcer l'affichage de Klarna si disponible
      payment_method_options: {
        klarna: {
          enabled: true,
        },
      },
      // Métadonnées pour que Stripe affiche "achzodcoaching" au lieu du nom personnel
      metadata: {
        merchant_name: 'achzodcoaching',
        business_name: 'AchzodCoaching'
      }
      // Note: Ne pas définir receipt_email = pas de reçu Stripe automatique
      // Les reçus Stripe doivent être désactivés dans le dashboard Stripe
    };

    if (customerEmail && customerEmail.trim()) {
      sessionConfig.customer_email = customerEmail.trim();
    }

    const session = await stripeFR.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });

  } catch (error) {
    console.error('Erreur Stripe FR (Klarna):', error);
    res.status(500).json({ error: error.message });
  }
});

// Fonction pour trouver le lien ebook
function findEbookLink(productName) {
  if (!productName) return null;
  
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  
  console.log('🔍 Recherche ebook pour:', productName, '-> nettoyé:', cleanName);
  
  // Chercher une correspondance exacte ou partielle
  for (const [key, link] of Object.entries(EBOOK_LINKS)) {
    const cleanKey = key.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    
    // Correspondance si le nom contient la clé ou vice versa
    if (cleanName.includes(cleanKey) || cleanKey.includes(cleanName)) {
      console.log('✅ Ebook trouvé:', key, '->', link);
      return { name: productName, link: link };
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

// Webhook Stripe UAE (paiements normaux)
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripeUAE.webhooks.constructEvent(req.body, sig, webhookSecret);
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
        const lineItems = await stripeUAE.checkout.sessions.listLineItems(session.id);
        const ebooks = [];
        const productNames = [];
        
        for (const item of lineItems.data) {
          const productName = item.description || item.price?.product?.name || item.price?.product?.description || 'Produit';
          console.log('📦 Produit trouvé:', productName);
          productNames.push(productName);
          const ebookData = findEbookLink(productName);
          
          if (ebookData) {
            ebooks.push(ebookData);
          }
        }
        
        console.log(`📧 ${ebooks.length} ebook(s) trouvé(s) sur ${productNames.length} produit(s)`);
        console.log('📋 Produits:', productNames.join(', '));
        
        // Envoyer notification à Achzod pour TOUTES les commandes
        await sendOrderNotification(customerEmail, '', productNames, totalAmount, paymentMethod);
        
        // Toujours envoyer l'email au client (avec ou sans liens)
        // Ne pas utiliser le nom personnel, utiliser "achzodcoaching"
        await sendEbookEmail(customerEmail, '', ebooks, totalAmount);
        if (ebooks.length > 0) {
          console.log('✅ Email avec liens envoyé à:', customerEmail);
        } else {
          console.log('⚠️ Email envoyé SANS liens. Produits:', productNames.join(', '));
        }
      } catch (error) {
        console.error('Erreur récupération line items:', error);
      }
    }
  }

  res.json({ received: true });
});

// Webhook Stripe FR (Klarna uniquement)
app.post('/webhook-klarna', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_FR;

  let event;

  try {
    event = stripeFR.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed (FR):', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      const fullSession = await stripeFR.checkout.sessions.retrieve(session.id, {
        expand: ['line_items', 'customer_details'],
      });

      const customerEmail = fullSession.customer_details?.email || session.customer_email;
      const customerName = fullSession.customer_details?.name || '';
      const totalAmount = (fullSession.amount_total / 100).toFixed(2);

      if (!customerEmail) {
        console.log('No customer email found (FR)');
        return res.json({ received: true });
      }

      const lineItems = await stripeFR.checkout.sessions.listLineItems(session.id);
      const ebooks = [];
      const productNames = [];
      
      for (const item of lineItems.data) {
        const productName = item.description || item.price?.product?.name || item.price?.product?.description || 'Produit';
        console.log('📦 Produit trouvé (FR):', productName);
        productNames.push(productName);
        const ebookData = findEbookLink(productName);
        
        if (ebookData) {
          ebooks.push(ebookData);
        }
      }
      
      console.log(`📧 ${ebooks.length} ebook(s) trouvé(s) sur ${productNames.length} produit(s) (FR)`);
      console.log('📋 Produits:', productNames.join(', '));
      
      // Envoyer notification à Achzod
      const paymentMethod = 'Klarna (Stripe FR)';
      await sendOrderNotification(customerEmail, '', productNames, totalAmount, paymentMethod);
      
      // Toujours envoyer l'email au client (avec ou sans liens)
      // Ne pas utiliser le nom personnel, utiliser "achzodcoaching"
      await sendEbookEmail(customerEmail, '', ebooks, totalAmount);
      if (ebooks.length > 0) {
        console.log('✅ Email avec liens envoyé à:', customerEmail);
      } else {
        console.log('⚠️ Email envoyé SANS liens. Produits:', productNames.join(', '));
      }
    } catch (error) {
      console.error('Erreur webhook FR:', error);
    }
  }

  res.json({ received: true });
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

    const ebooks = [];
    const productNames = [];
    
    for (const item of lineItems.data) {
      const productName = item.description || item.price?.product?.name || item.price?.product?.description || 'Produit';
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

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Achzod Klarna Checkout API' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
