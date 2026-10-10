const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'webflow-klarna.js'), 'utf8');

assert.match(
  source,
  /\.w-commerce-commercecheckoutemailinput, input\[name="email"\], input\[type="email"\]/,
  'Le checkout PayPal doit lire le champ email Webflow même lorsqu’il est rendu en type="text"',
);

assert.match(
  source,
  /#achzod-chat-footer\{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important\}/,
  'Le widget WhatsApp historique ne doit jamais intercepter les boutons de paiement sur mobile',
);

assert.match(
  source,
  /\.apexlabs-sticky\{display:none!important/,
  'La bannière CTA flottante ne doit pas réduire la zone utile du checkout mobile',
);

assert.match(
  source,
  /@media\(max-width:420px\).*white-space:nowrap!important/,
  'Les libellés PayPal et Klarna doivent rester sur une ligne sur les petits téléphones',
);

assert.match(
  source,
  /if \(!isCheckoutPage\) return/,
  'La protection des overlays doit être liée explicitement à la page checkout',
);

assert.match(
  source,
  /catch \(_\) \{\s*return true;\s*\}/,
  'Une panne de préflight ne doit pas faire disparaître silencieusement PayPal',
);

assert.match(
  source,
  /aria-label="Payer avec PayPal en 4 fois sous réserve d’éligibilité"/,
  'Le bouton PayPal doit expliquer clairement le 4x et son éligibilité',
);

assert.match(
  source,
  /Paiement en EUR\. \*3x Klarna et 4x PayPal sous réserve d’éligibilité\./,
  'Les deux paiements fractionnés doivent annoncer la devise et leur condition d’éligibilité',
);

assert.match(
  source,
  /Pay with browser\\\.\?\/gi, 'Payer avec ce navigateur'/,
  'Le paiement natif Webflow doit être traduit en français sur le checkout',
);
assert.match(source, /Apply Discount\/gi, 'Appliquer la remise'/, 'Le bouton promo du checkout doit être traduit');
assert.match(
  source,
  /THIS DISCOUNT IS INVALID\\\.\?\/gi, 'Ce code promotionnel est invalide\.'/,
  'Le message de code promo invalide doit être traduit',
);

assert.match(
  source,
  /new window\.Intl\.DisplayNames\(\['fr'\], \{ type: 'region' \}\)/,
  'Les pays du checkout doivent utiliser leurs noms français',
);
assert.match(
  source,
  /select\[data-node-type\*="country" i\]/,
  'Le sélecteur pays natif Webflow doit être localisé même sans name/class explicite',
);

assert.match(
  source,
  /\(\?:discount\|remise\|r\[ée\]duction\)/,
  'Un code promo appliqué doit être détecté dans les libellés français et anglais',
);

assert.doesNotMatch(
  source,
  /applyWebflowContentCorrections|replacePlaceholderCopy|updateCertificationMetadata/,
  'Le service ne doit plus masquer les erreurs du HTML source Webflow par une réécriture globale',
);
assert.doesNotMatch(source, /setInterval\s*\(/, 'Le nettoyage du checkout ne doit plus sonder le DOM chaque seconde');
assert.match(
  source,
  /if \(!isCheckoutPage\) return;[\s\S]*new MutationObserver\(function \(mutations\)/,
  'L’observer de paiement doit être créé seulement après le garde de route checkout',
);
assert.match(
  source,
  /mutation\.addedNodes[\s\S]*applyCheckoutLocalizations\(node\)/,
  'L’observer checkout doit traiter seulement les nœuds ajoutés, sans rescanner toute la page',
);
assert.doesNotMatch(
  source,
  /commerceLocalizationObserver\.observe\(document\.documentElement/,
  'Aucun observer de localisation persistant ne doit parcourir le document global',
);
assert.match(source, /Parler à Achzod/, 'Le libellé WhatsApp fourni par le service doit être correctement accentué');
assert.match(
  source,
  /@media\(max-width:360px\).*ac-payment-grid\{grid-template-columns:1fr!important\}/,
  'Les boutons de paiement doivent s’empiler sur les écrans mobiles très étroits',
);
assert.match(
  source,
  /new window\.ResizeObserver\(reserveCheckoutBarSpace\)/,
  'Le contenu du checkout doit réserver la hauteur réelle de la barre mobile',
);
assert.match(
  source,
  /Une seule formule de coaching peut être achetée par commande|Quantité fixée à 1 pour les coachings/,
  'Le parcours doit limiter les coachings à une seule unité',
);
assert.match(
  source,
  /input\.max = '1'[\s\S]*dispatchEvent\(new Event\('change'/,
  'Le panier Webflow doit remettre à un la quantité d’un coaching et notifier son état interne',
);

console.log('✅ Webflow checkout integration tests passed');
