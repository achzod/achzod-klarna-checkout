const Stripe = require('stripe');
const nodemailer = require('nodemailer');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Mapping des ebooks vers leurs liens de téléchargement
const EBOOK_DOWNLOADS = {
  'anabolic code': 'https://store-eu-par-2.gofile.io/download/direct/731fdd33-9c47-4385-9fd5-4b8b1ed230a0/ANABOLIC%20CODE.pdf',
  'libérer son potentiel génétique': 'https://gofile.io/d/gWybQ6',
  'liberer son potentiel genetique': 'https://gofile.io/d/gWybQ6',
  '4 semaines pour être shred': 'https://gofile.io/d/5SylgY',
  '4 semaines pour etre shred': 'https://gofile.io/d/5SylgY',
  'bioénergétique': 'https://gofile.io/d/Hn6GE1',
  'bioenergetique': 'https://gofile.io/d/Hn6GE1',
  'bioénergétique et timing': 'https://gofile.io/d/Hn6GE1',
};

// Configuration email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function findEbookLink(productName) {
  const cleanName = productName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();

  for (const [key, link] of Object.entries(EBOOK_DOWNLOADS)) {
    const cleanKey = key.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    if (cleanName.includes(cleanKey) || cleanKey.includes(cleanName)) {
      return { name: productName, link };
    }
  }
  return null;
}

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
                  <td style="background: linear-gradient(135deg, #FFB3C7, #FF8DA8); -webkit-background-clip: text; background-clip: text;">
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
              <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #FFB3C7, #FF8DA8); border-radius: 50%; display: inline-block; line-height: 70px; font-size: 32px;">
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

async function sendEbookEmail(customerEmail, customerName, ebooks, totalAmount) {
  const mailOptions = {
    from: {
      name: 'AchzodCoaching',
      address: process.env.EMAIL_USER,
    },
    to: customerEmail,
    subject: '📖 Tes ebooks ACHZOD sont prêts !',
    html: generateEmailHTML(customerName, ebooks, totalAmount),
  };

  await transporter.sendMail(mailOptions);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Vérifier la signature du webhook
    const rawBody = req.body;
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Traiter l'événement checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      // Récupérer les détails de la session
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items', 'customer_details'],
      });

      const customerEmail = fullSession.customer_details?.email || session.customer_email;
      const customerName = fullSession.customer_details?.name?.split(' ')[0] || '';
      const totalAmount = (fullSession.amount_total / 100).toFixed(2);

      if (!customerEmail) {
        console.log('No customer email found');
        return res.status(200).json({ received: true });
      }

      // Chercher les ebooks dans la commande
      const ebooks = [];
      
      if (fullSession.line_items?.data) {
        for (const item of fullSession.line_items.data) {
          const productName = item.description || item.price?.product?.name || '';
          const ebookInfo = findEbookLink(productName);
          
          if (ebookInfo) {
            ebooks.push(ebookInfo);
          }
        }
      }

      // Si des ebooks ont été trouvés, envoyer l'email
      if (ebooks.length > 0) {
        await sendEbookEmail(customerEmail, customerName, ebooks, totalAmount);
        console.log(`Email sent to ${customerEmail} with ${ebooks.length} ebook(s)`);
      }

    } catch (error) {
      console.error('Error processing webhook:', error);
    }
  }

  return res.status(200).json({ received: true });
};





