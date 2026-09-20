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

console.log('✅ Webflow PayPal email selector tests passed');
