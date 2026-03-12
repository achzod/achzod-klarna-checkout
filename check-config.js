#!/usr/bin/env node
/**
 * Script de diagnostic - Vérifie la configuration pour les notifications Klarna
 * 
 * Usage: node check-config.js
 */

const https = require('https');

console.log('');
console.log('🔍 DIAGNOSTIC ACHZOD - Notifications Klarna');
console.log('═'.repeat(50));
console.log('');

// Vérification des variables d'environnement
const checks = {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_SECRET_KEY_FR: process.env.STRIPE_SECRET_KEY_FR,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_WEBHOOK_SECRET_FR: process.env.STRIPE_WEBHOOK_SECRET_FR,
};

let hasError = false;

console.log('📋 Variables d\'environnement:');
console.log('');

for (const [key, value] of Object.entries(checks)) {
  const isFR = key.includes('_FR');
  const isRequired = key === 'EMAIL_USER' || key === 'EMAIL_PASS' || key === 'STRIPE_SECRET_KEY_FR' || key === 'STRIPE_WEBHOOK_SECRET_FR';
  
  if (value) {
    const masked = key.includes('PASS') || key.includes('SECRET') || key.includes('KEY') 
      ? value.substring(0, 8) + '...' + value.substring(value.length - 4)
      : value;
    console.log(`   ✅ ${key}: ${masked}`);
  } else {
    if (isRequired) {
      console.log(`   ❌ ${key}: NON DÉFINI ${isFR ? '(requis pour Klarna)' : '(requis)'}`);
      hasError = true;
    } else {
      console.log(`   ⚠️  ${key}: non défini`);
    }
  }
}

console.log('');
console.log('═'.repeat(50));

// Test connexion API
console.log('');
console.log('🌐 Test API Render...');

const testAPI = () => {
  return new Promise((resolve) => {
    https.get('https://achzod-klarna-checkout.onrender.com/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'ok') {
            console.log('   ✅ API en ligne: https://achzod-klarna-checkout.onrender.com');
            resolve(true);
          } else {
            console.log('   ⚠️  API répond mais statut inattendu');
            resolve(false);
          }
        } catch (e) {
          console.log('   ❌ Réponse API invalide');
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log('   ❌ API inaccessible:', e.message);
      resolve(false);
    });
  });
};

// Test email si configuré
const testEmail = async () => {
  if (!checks.EMAIL_USER || !checks.EMAIL_PASS) {
    console.log('');
    console.log('📧 Test email: IGNORÉ (EMAIL_USER ou EMAIL_PASS manquant)');
    return false;
  }

  console.log('');
  console.log('📧 Test connexion email...');
  
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: checks.EMAIL_USER,
        pass: checks.EMAIL_PASS
      }
    });
    
    await transporter.verify();
    console.log('   ✅ Connexion Gmail OK');
    return true;
  } catch (error) {
    console.log('   ❌ Erreur Gmail:', error.message);
    if (error.message.includes('Invalid login')) {
      console.log('');
      console.log('   💡 Le mot de passe est invalide.');
      console.log('   Tu dois utiliser un "App Password" Gmail !');
      console.log('   → https://myaccount.google.com/apppasswords');
    }
    return false;
  }
};

// Test Stripe FR
const testStripeFR = async () => {
  if (!checks.STRIPE_SECRET_KEY_FR) {
    console.log('');
    console.log('💳 Test Stripe FR: IGNORÉ (STRIPE_SECRET_KEY_FR manquant)');
    return false;
  }

  console.log('');
  console.log('💳 Test Stripe FR...');
  
  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(checks.STRIPE_SECRET_KEY_FR);
    
    // Test simple: récupérer le compte
    const account = await stripe.accounts.retrieve();
    console.log('   ✅ Stripe FR connecté');
    console.log(`   📍 Pays: ${account.country || 'N/A'}`);
    return true;
  } catch (error) {
    console.log('   ❌ Erreur Stripe FR:', error.message);
    return false;
  }
};

// Exécuter tous les tests
(async () => {
  await testAPI();
  await testEmail();
  await testStripeFR();
  
  console.log('');
  console.log('═'.repeat(50));
  console.log('');
  
  if (hasError) {
    console.log('❌ PROBLÈMES DÉTECTÉS');
    console.log('');
    console.log('Pour recevoir les notifications Klarna, configure ces variables sur Render:');
    console.log('');
    console.log('   1. Va sur https://dashboard.render.com');
    console.log('   2. Sélectionne ton service achzod-klarna-checkout');
    console.log('   3. Va dans Environment → Environment Variables');
    console.log('   4. Ajoute les variables manquantes (voir ci-dessus)');
    console.log('   5. Clique "Save Changes" puis "Manual Deploy"');
    console.log('');
    console.log('📖 Guide complet: DIAGNOSTIC-NOTIFICATIONS.md');
  } else {
    console.log('✅ CONFIGURATION OK');
    console.log('');
    console.log('Si tu ne reçois toujours pas les notifications:');
    console.log('   1. Vérifie que le webhook Stripe FR existe');
    console.log('   2. URL webhook: https://achzod-klarna-checkout.onrender.com/webhook-klarna');
    console.log('   3. Événement: checkout.session.completed');
    console.log('');
    console.log('📖 Guide: DIAGNOSTIC-NOTIFICATIONS.md');
  }
  
  console.log('');
})();
