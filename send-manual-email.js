'use strict';

require('dotenv').config();

const nodemailer = require('nodemailer');
const { buildEbookLink, EBOOKS } = require('./ebook-downloads');

const [customerEmail, ebookSlugOrName, totalAmount = '0.00'] = process.argv.slice(2);

if (!customerEmail || !ebookSlugOrName) {
  console.error('Usage: node send-manual-email.js client@email.com ebook-slug-ou-nom montant');
  console.error(`Ebooks: ${EBOOKS.map((ebook) => ebook.slug).join(', ')}`);
  process.exit(1);
}

const ebook = EBOOKS.find((item) => item.slug === ebookSlugOrName) || EBOOKS.find((item) => item.name === ebookSlugOrName);
const ebookLink = buildEbookLink(ebook?.name || ebookSlugOrName, {
  customerEmail,
  orderId: `manual:${Date.now()}`,
});

if (!ebookLink) {
  console.error(`Ebook inconnu: ${ebookSlugOrName}`);
  process.exit(1);
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('EMAIL_USER et EMAIL_PASS doivent être configurés dans les variables d’environnement.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const htmlEmail = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre commande ACHZOD</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0B09;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0B09;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <h1 style="margin:0;font-size:32px;font-weight:800;letter-spacing:3px;color:#FFB3C7;">ACHZOD</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#151515;border-radius:16px;padding:36px;border:1px solid #2a2a2a;">
              <h2 style="margin:0 0 18px;color:#fff;font-size:24px;">Ton ebook est prêt</h2>
              <p style="margin:0 0 24px;color:#aaa;line-height:1.6;">Ton paiement est confirmé. Voici ton lien personnel de téléchargement.</p>
              <p style="margin:0 0 24px;color:#fff;font-weight:700;">${ebookLink.name}</p>
              <a href="${ebookLink.link}" style="display:inline-block;background:#FFB3C7;color:#0A0B09;text-decoration:none;padding:13px 24px;border-radius:6px;font-weight:800;">Télécharger</a>
              <p style="margin:24px 0 0;color:#777;font-size:13px;line-height:1.5;">Lien personnel. Ne le partage pas.</p>
              <p style="margin:18px 0 0;color:#FFB3C7;font-weight:700;">Total payé: ${totalAmount}€</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;color:#555;font-size:12px;">Une question ? Réponds directement à cet email.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

transporter.sendMail({
  from: {
    name: 'AchzodCoaching',
    address: process.env.EMAIL_USER,
  },
  to: customerEmail,
  subject: 'Ton ebook ACHZOD est prêt',
  html: htmlEmail,
}, (error, info) => {
  if (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
  console.log('Email envoyé avec succès à', customerEmail);
  console.log('Message-ID:', info.messageId || info.response);
  process.exit(0);
});
