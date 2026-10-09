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
  /new MutationObserver\(removeCheckoutOverlays\)/,
  'Les widgets injectés tardivement doivent être retirés pendant l’initialisation du checkout',
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
  /aria-label="Payer avec PayPal en 4 fois si éligible"/,
  'Le bouton PayPal doit expliquer clairement le 4x et son éligibilité',
);

assert.match(
  source,
  /Pay with browser\\\.\?\/gi, 'Payer avec ce navigateur'/,
  'Le paiement natif Webflow doit être traduit en français',
);

assert.match(
  source,
  /new window\.Intl\.DisplayNames\(\['fr'\], \{ type: 'region' \}\)/,
  'Les pays du checkout doivent utiliser leurs noms français',
);

assert.match(
  source,
  /replacePlaceholderCopy\(\)/,
  'Les textes Lorem ipsum des offres doivent être remplacés',
);

assert.match(
  source,
  /©\\s\*2025\\s\*AchzodCoaching\/gi, '© ' \+ new Date\(\)\.getFullYear\(\) \+ ' AchzodCoaching'/,
  'Le copyright Webflow doit rester aligné sur l’année courante',
);

assert.match(
  source,
  /12 certifications internationales\/gi, '11 certifications internationales'/,
  'Le nombre de certifications doit être cohérent dans le site',
);

assert.match(
  source,
  /contentCorrectionObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/,
  'Les corrections doivent aussi couvrir le panier injecté après le chargement',
);

console.log('✅ Webflow checkout and content correction tests passed');
