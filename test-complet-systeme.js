const Stripe = require('stripe');
const fetch = require('node-fetch');

// Configuration - utilise les variables d'environnement du système
// IMPORTANT: Ne jamais mettre les clés API en dur dans le code
const API_URL = process.env.API_URL || 'https://achzod-klarna-checkout.onrender.com';
const STRIPE_SECRET_UAE = process.env.STRIPE_SECRET_KEY;
const STRIPE_SECRET_FR = process.env.STRIPE_SECRET_KEY_FR;

const stripeUAE = new Stripe(STRIPE_SECRET_UAE);
const stripeFR = STRIPE_SECRET_FR ? new Stripe(STRIPE_SECRET_FR) : null;

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Produits à tester
const PRODUITS_TEST = [
  // Ebooks
  { name: 'EBOOK', price: 4.90, expectedEbook: 'liberer son potentiel' },
  { name: 'ANABOLIC CODE', price: 7.90, expectedEbook: 'anabolic code' },
  { name: '4 Semaines pour être SHRED', price: 5.90, expectedEbook: '4 semaines pour etre shred' },
  { name: 'Bioénergétique', price: 5.90, expectedEbook: 'bioenergetique' },
  { name: 'Libérer son potentiel génétique en 10 semaines', price: 4.90, expectedEbook: 'liberer son potentiel' },
  
  // Coaching (pas d'ebook)
  { name: 'Coaching sans suivi', price: 99.00, expectedEbook: null },
];

// Résultats des tests
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
};

async function testCheckoutUAE(product) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST: Checkout UAE - ${product.name}`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  
  results.total++;
  
  try {
    const payload = {
      items: [{ name: product.name, price: product.price, quantity: 1 }],
      customerEmail: 'test@achzodcoaching.com',
      successUrl: 'https://achzodcoaching.com/order-confirmation',
      cancelUrl: 'https://achzodcoaching.com/checkout',
    };

    log(`📤 Envoi requête POST /checkout...`, 'yellow');
    const response = await fetch(`${API_URL}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error || JSON.stringify(data)}`);
    }

    if (!data.url) {
      throw new Error('Pas d\'URL de checkout retournée');
    }

    log(`✅ URL checkout créée: ${data.url}`, 'green');
    
    // Extraire session_id de l'URL (format: /pay/cs_live_...)
    // Le session_id est avant le # (fragment)
    let sessionId = null;
    const urlWithoutFragment = data.url.split('#')[0];
    const sessionIdMatch = urlWithoutFragment.match(/\/pay\/(cs_[^/?]+)/) || urlWithoutFragment.match(/\/checkout\/sessions\/([^/?]+)/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[1];
      // Nettoyer le session_id (juste la partie avant le #)
      sessionId = sessionId.split('#')[0].split('?')[0];
    } else {
      log(`⚠️  Impossible d'extraire session_id de l'URL`, 'yellow');
      log(`   URL: ${data.url}`, 'yellow');
      return { success: true, sessionId: null, url: data.url };
    }
    log(`📋 Session ID: ${sessionId}`, 'cyan');

    // Vérifier la session dans Stripe
    log(`🔍 Vérification session Stripe UAE...`, 'yellow');
    const session = await stripeUAE.checkout.sessions.retrieve(sessionId);
    
    // Vérifications
    const checks = [];
    
    // 1. Devise EUR
    if (session.currency === 'eur') {
      log(`✅ Devise: EUR`, 'green');
      checks.push('devise');
    } else {
      log(`❌ Devise: ${session.currency} (attendu: EUR)`, 'red');
      checks.push('devise-fail');
    }

    // 2. Métadonnées
    if (session.metadata && session.metadata.merchant_name === 'achzodcoaching') {
      log(`✅ Métadonnées: merchant_name = achzodcoaching`, 'green');
      checks.push('metadata');
    } else {
      log(`❌ Métadonnées manquantes ou incorrectes`, 'red');
      checks.push('metadata-fail');
    }

    // 3. Email client
    if (session.customer_email === 'test@achzodcoaching.com') {
      log(`✅ Email client: ${session.customer_email}`, 'green');
      checks.push('email');
    } else {
      log(`❌ Email client incorrect: ${session.customer_email}`, 'red');
      checks.push('email-fail');
    }

    // 4. Test route download-links
    log(`🔍 Test route /download-links...`, 'yellow');
    const downloadResponse = await fetch(`${API_URL}/download-links?session_id=${sessionId}`);
    const downloadData = await downloadResponse.json();
    
    if (downloadData.success) {
      log(`✅ Route download-links fonctionne`, 'green');
      if (downloadData.ebooks && downloadData.ebooks.length > 0) {
        log(`   📖 ${downloadData.ebooks.length} ebook(s) trouvé(s):`, 'green');
        downloadData.ebooks.forEach(ebook => {
          log(`      - ${ebook.name} -> ${ebook.link}`, 'green');
        });
        
        if (product.expectedEbook) {
          const found = downloadData.ebooks.some(e => 
            e.name.toLowerCase().includes(product.expectedEbook.toLowerCase())
          );
          if (found) {
            log(`✅ Ebook attendu trouvé: ${product.expectedEbook}`, 'green');
            checks.push('ebook');
          } else {
            log(`❌ Ebook attendu non trouvé: ${product.expectedEbook}`, 'red');
            checks.push('ebook-fail');
          }
        }
      } else {
        if (product.expectedEbook) {
          log(`❌ Ebook attendu mais non trouvé: ${product.expectedEbook}`, 'red');
          checks.push('ebook-fail');
        } else {
          log(`✅ Pas d'ebook attendu (coaching)`, 'green');
          checks.push('ebook');
        }
      }
    } else {
      log(`❌ Route download-links échouée: ${downloadData.error}`, 'red');
      checks.push('download-fail');
    }

    const failed = checks.filter(c => c.includes('-fail')).length;
    if (failed === 0) {
      log(`\n✅ TEST RÉUSSI pour ${product.name}`, 'green');
      results.passed++;
      return { success: true, sessionId, checks };
    } else {
      log(`\n❌ TEST ÉCHOUÉ pour ${product.name} (${failed} erreur(s))`, 'red');
      results.failed++;
      results.errors.push({ product: product.name, type: 'UAE', checks });
      return { success: false, sessionId, checks };
    }

  } catch (error) {
    log(`\n❌ ERREUR: ${error.message}`, 'red');
    results.failed++;
    results.errors.push({ product: product.name, type: 'UAE', error: error.message });
    return { success: false, error: error.message };
  }
}

async function testCheckoutKlarna(product) {
  if (!stripeFR) {
    log(`\n⚠️  Stripe FR non configuré, test Klarna ignoré`, 'yellow');
    return { success: true, skipped: true };
  }

  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST: Checkout Klarna (FR) - ${product.name}`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  
  results.total++;
  
  try {
    const payload = {
      items: [{ name: product.name, price: product.price, quantity: 1 }],
      customerEmail: 'test@achzodcoaching.com',
      successUrl: 'https://achzodcoaching.com/order-confirmation',
      cancelUrl: 'https://achzodcoaching.com/checkout',
    };

    log(`📤 Envoi requête POST /checkout-klarna...`, 'yellow');
    const response = await fetch(`${API_URL}/checkout-klarna`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Si montant trop faible pour Klarna, c'est normal
      if (data.error && data.error.includes('indisponible en dessous')) {
        log(`⚠️  ${data.error} (normal pour petit montant)`, 'yellow');
        results.passed++;
        return { success: true, skipped: true, reason: 'montant trop faible' };
      }
      throw new Error(`HTTP ${response.status}: ${data.error || JSON.stringify(data)}`);
    }

    if (!data.url) {
      throw new Error('Pas d\'URL de checkout retournée');
    }

    log(`✅ URL checkout créée: ${data.url}`, 'green');
    
    // Extraire session_id (format: /pay/cs_live_...)
    // Le session_id est avant le # (fragment)
    let sessionId = null;
    const urlWithoutFragment = data.url.split('#')[0];
    const sessionIdMatch = urlWithoutFragment.match(/\/pay\/(cs_[^/?]+)/) || urlWithoutFragment.match(/\/checkout\/sessions\/([^/?]+)/);
    if (sessionIdMatch) {
      sessionId = sessionIdMatch[1];
      // Nettoyer le session_id (juste la partie avant le #)
      sessionId = sessionId.split('#')[0].split('?')[0];
    } else {
      log(`⚠️  Impossible d'extraire session_id`, 'yellow');
      log(`   URL: ${data.url}`, 'yellow');
      return { success: true, sessionId: null, url: data.url };
    }
    log(`📋 Session ID: ${sessionId}`, 'cyan');

    // Vérifier la session dans Stripe FR
    log(`🔍 Vérification session Stripe FR...`, 'yellow');
    const session = await stripeFR.checkout.sessions.retrieve(sessionId);
    
    const checks = [];
    
    // 1. Devise EUR
    if (session.currency === 'eur') {
      log(`✅ Devise: EUR`, 'green');
      checks.push('devise');
    } else {
      log(`❌ Devise: ${session.currency} (attendu: EUR)`, 'red');
      checks.push('devise-fail');
    }

    // 2. Métadonnées
    if (session.metadata && session.metadata.merchant_name === 'achzodcoaching') {
      log(`✅ Métadonnées: merchant_name = achzodcoaching`, 'green');
      checks.push('metadata');
    } else {
      log(`❌ Métadonnées manquantes ou incorrectes`, 'red');
      checks.push('metadata-fail');
    }

    // 3. Payment methods
    if (session.payment_method_types && session.payment_method_types.includes('klarna')) {
      log(`✅ Klarna dans payment_method_types`, 'green');
      checks.push('klarna');
    } else {
      log(`❌ Klarna non présent dans payment_method_types`, 'red');
      checks.push('klarna-fail');
    }

    // 4. Test route download-links
    log(`🔍 Test route /download-links...`, 'yellow');
    const downloadResponse = await fetch(`${API_URL}/download-links?session_id=${sessionId}`);
    const downloadData = await downloadResponse.json();
    
    if (downloadData.success) {
      log(`✅ Route download-links fonctionne`, 'green');
      if (downloadData.ebooks && downloadData.ebooks.length > 0) {
        log(`   📖 ${downloadData.ebooks.length} ebook(s) trouvé(s)`, 'green');
        if (product.expectedEbook) {
          const found = downloadData.ebooks.some(e => 
            e.name.toLowerCase().includes(product.expectedEbook.toLowerCase())
          );
          if (found) {
            log(`✅ Ebook attendu trouvé`, 'green');
            checks.push('ebook');
          } else {
            log(`❌ Ebook attendu non trouvé`, 'red');
            checks.push('ebook-fail');
          }
        }
      } else {
        if (!product.expectedEbook) {
          log(`✅ Pas d'ebook attendu`, 'green');
          checks.push('ebook');
        } else {
          log(`❌ Ebook attendu mais non trouvé`, 'red');
          checks.push('ebook-fail');
        }
      }
    }

    const failed = checks.filter(c => c.includes('-fail')).length;
    if (failed === 0) {
      log(`\n✅ TEST RÉUSSI pour ${product.name} (Klarna)`, 'green');
      results.passed++;
      return { success: true, sessionId, checks };
    } else {
      log(`\n❌ TEST ÉCHOUÉ pour ${product.name} (Klarna)`, 'red');
      results.failed++;
      results.errors.push({ product: product.name, type: 'Klarna', checks });
      return { success: false, sessionId, checks };
    }

  } catch (error) {
    log(`\n❌ ERREUR: ${error.message}`, 'red');
    results.failed++;
    results.errors.push({ product: product.name, type: 'Klarna', error: error.message });
    return { success: false, error: error.message };
  }
}

async function testHealthCheck() {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`TEST: Health Check`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  
  results.total++;
  
  try {
    const response = await fetch(`${API_URL}/`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      log(`✅ Health check OK`, 'green');
      results.passed++;
      return true;
    } else {
      throw new Error('Health check échoué');
    }
  } catch (error) {
    log(`❌ Health check échoué: ${error.message}`, 'red');
    results.failed++;
    return false;
  }
}

async function runAllTests() {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`🚀 DÉMARRAGE DES TESTS COMPLETS`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  log(`API URL: ${API_URL}`, 'yellow');
  log(`Stripe UAE: ${STRIPE_SECRET_UAE ? '✅ Configuré' : '❌ Non configuré'}`, STRIPE_SECRET_UAE ? 'green' : 'red');
  log(`Stripe FR: ${STRIPE_SECRET_FR ? '✅ Configuré' : '❌ Non configuré'}`, STRIPE_SECRET_FR ? 'green' : 'red');
  log(`${'='.repeat(60)}\n`, 'cyan');

  // Health check
  await testHealthCheck();

  // Tests pour chaque produit
  for (const product of PRODUITS_TEST) {
    // Test UAE
    await testCheckoutUAE(product);
    
    // Test Klarna (seulement si montant >= 0.50€)
    if (product.price >= 0.50) {
      await testCheckoutKlarna(product);
    } else {
      log(`\n⚠️  Test Klarna ignoré (montant < 0.50€)`, 'yellow');
    }
    
    // Pause entre les tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Résumé
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`📊 RÉSUMÉ DES TESTS`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
  log(`Total: ${results.total}`, 'cyan');
  log(`✅ Réussis: ${results.passed}`, 'green');
  log(`❌ Échoués: ${results.failed}`, 'red');
  log(`Taux de réussite: ${((results.passed / results.total) * 100).toFixed(1)}%`, 
      results.failed === 0 ? 'green' : 'yellow');
  
  if (results.errors.length > 0) {
    log(`\n❌ ERREURS DÉTAILLÉES:`, 'red');
    results.errors.forEach((err, i) => {
      log(`\n${i + 1}. ${err.product} (${err.type})`, 'red');
      if (err.error) {
        log(`   Erreur: ${err.error}`, 'red');
      }
      if (err.checks) {
        log(`   Checks échoués: ${err.checks.filter(c => c.includes('-fail')).join(', ')}`, 'red');
      }
    });
  }

  log(`\n${'='.repeat(60)}\n`, 'cyan');
  
  process.exit(results.failed === 0 ? 0 : 1);
}

// Lancer les tests
runAllTests().catch(error => {
  log(`\n❌ ERREUR FATALE: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
