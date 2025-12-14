const Stripe = require('stripe');
require('dotenv').config();

// IMPORTANT: Ne jamais mettre les clés API en dur dans le code
const stripeFR = new Stripe(process.env.STRIPE_SECRET_KEY_FR);

async function updateBusinessName() {
  try {
    console.log('🔄 Mise à jour du nom du business dans Stripe FR...');
    
    // Récupérer les informations du compte
    const account = await stripeFR.accounts.retrieve();
    console.log('📋 Nom actuel:', account.business_profile?.name || account.display_name || 'Non défini');
    
    // Mettre à jour le business profile
    const updated = await stripeFR.accounts.update(account.id, {
      business_profile: {
        name: 'AchzodCoaching',
        support_email: 'achzodyt@gmail.com',
        support_phone: null,
        url: 'https://achzodcoaching.com',
      },
      business_type: 'individual', // ou 'company' selon ton cas
    });
    
    console.log('✅ Nom du business mis à jour:', updated.business_profile?.name);
    console.log('✅ Email support:', updated.business_profile?.support_email);
    console.log('✅ URL:', updated.business_profile?.url);
    
  } catch (error) {
    if (error.message.includes('cannot use this method on your own account')) {
      console.log('❌ Erreur: Tu ne peux pas modifier le nom via API sur un compte standard.');
      console.log('📝 Solution: Va sur https://dashboard.stripe.com/settings/business et change manuellement le nom en "AchzodCoaching"');
    } else {
      console.error('❌ Erreur:', error.message);
    }
  }
}

updateBusinessName();

