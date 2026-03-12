// Test d'envoi d'email local
// Usage: EMAIL_USER=xxx EMAIL_PASS=xxx node test-email-local.js

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER || 'achzodyt@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_PASS) {
  console.log('❌ EMAIL_PASS non défini !');
  console.log('');
  console.log('Pour tester, lance avec:');
  console.log('EMAIL_PASS="ton_app_password_gmail" node test-email-local.js');
  console.log('');
  console.log('⚠️  IMPORTANT: Tu dois utiliser un "App Password" Gmail, pas ton mot de passe normal !');
  console.log('');
  console.log('Pour créer un App Password:');
  console.log('1. Va sur https://myaccount.google.com/security');
  console.log('2. Active la validation en 2 étapes si pas fait');
  console.log('3. Cherche "Mots de passe des applications"');
  console.log('4. Crée un mot de passe pour "Mail"');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

async function testEmail() {
  console.log('📧 Test d\'envoi d\'email...');
  console.log('   From:', EMAIL_USER);
  console.log('   To:', EMAIL_USER);
  
  try {
    // Vérifier la connexion
    await transporter.verify();
    console.log('✅ Connexion SMTP OK');
    
    // Envoyer un email de test
    const info = await transporter.sendMail({
      from: {
        name: 'ACHZOD Test',
        address: EMAIL_USER
      },
      to: EMAIL_USER,
      subject: '🧪 Test notification Klarna - ' + new Date().toLocaleString('fr-FR'),
      html: `
        <div style="font-family: Arial; padding: 20px; background: #0A0B09; color: #fff;">
          <h1 style="color: #FFB3C7;">Test Email ACHZOD</h1>
          <p>Si tu reçois cet email, les notifications fonctionnent !</p>
          <p>Date: ${new Date().toLocaleString('fr-FR')}</p>
        </div>
      `
    });
    
    console.log('✅ Email envoyé !');
    console.log('   Message ID:', info.messageId);
    console.log('');
    console.log('👉 Vérifie ta boîte mail (et les spams) !');
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
    
    if (error.message.includes('Invalid login') || error.message.includes('auth')) {
      console.log('');
      console.log('💡 Le mot de passe est invalide.');
      console.log('   Assure-toi d\'utiliser un "App Password" Gmail !');
    }
  }
}

testEmail();
