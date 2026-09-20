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
  /#achzod-chat-footer\{display:none!important;pointer-events:none!important\}/,
  'Le widget WhatsApp historique ne doit jamais intercepter les boutons de paiement sur mobile',
);

assert.match(
  source,
  /if \(!isCheckoutPage\) return/,
  'La protection des overlays doit être liée explicitement à la page checkout',
);

console.log('✅ Webflow PayPal email selector tests passed');
