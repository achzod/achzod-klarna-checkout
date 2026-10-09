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
  'Le paiement natif Webflow doit être traduit en français',
);

assert.ok(
  source.includes("[/\\$\\s*0[.,]00/g, '0,00 €']"),
  'Le panier vide ne doit jamais afficher un zéro en dollars',
);

assert.ok(source.includes("[/\\b(\\d+)\\s+Reviews\\b/gi, '$1 avis']"), 'Le compteur d’avis doit être traduit');
assert.ok(source.includes("[/\\bNewest First\\b/gi, 'Plus récents']"), 'Le tri des avis doit être traduit');

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
assert.match(
  source,
  /commerceLocalizationObserver\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/,
  'La localisation commerce doit rester active pour les paniers ouverts tardivement',
);
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

console.log('✅ Webflow checkout and content correction tests passed');
