# INTÉGRATION KLARNA - ACHZOD COACHING

## RÉSUMÉ

Klarna est intégré via Stripe Checkout. Quand le client clique sur le bouton Klarna, il est redirigé vers Stripe où il peut choisir de payer en 3x sans frais avec Klarna.

---

## LIENS IMPORTANTS

- **Site** : https://achzodcoaching.com
- **API Render** : https://achzod-klarna-checkout.onrender.com
- **GitHub** : https://github.com/achzod/achzod-klarna-checkout
- **Dashboard Render** : https://dashboard.render.com/web/srv-d4k90eadbo4c73cr2bp0
- **Dashboard Stripe** : https://dashboard.stripe.com

---

## CLÉS API (À GARDER SECRET - NE PAS COMMIT SUR GITHUB)

Les clés API sont stockées en sécurité dans les variables d'environnement Render.
Ne JAMAIS les mettre dans le code source !

- **STRIPE_SECRET_KEY** : Configurée dans Render Dashboard > Environment
- **Stripe Public** : pk_live_mGFs4nY334p3JbtyCnMI9RqM0090tE7dz6 (celle-ci peut être publique)

---

## CODE WEBFLOW - PAGE CHECKOUT (BOUTON KLARNA OFFICIEL)

Dans Webflow Designer :
1. Pages > Checkout > Settings (engrenage)
2. Custom Code > Before </body> tag
3. Coller ce code :

```html
<!-- SDK Klarna Express Checkout -->
<script src="https://x.klarnacdn.net/express-button/v1/lib.js"
  data-id="klarna-express-button"
  data-client-id="klarna_live_client_YmZ2eWlYJCFqTUI2Lzd5eTdIQTkpTFU3ZzV1VjZTREUsZmEyZDdlMWUtNTc3Yi00ZmQ1LWFlODktZTMwNmZhYmM3YTlkLDEsWDFQQU1WMVRXSStjczFyUzViT2J2TmdubG5YSVJzUHRDUDB5dUV1TTJYQT0"
  data-environment="production"
  async>
</script>

<!-- Container Klarna -->
<div id="klarna-btn-container" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:15px;background:linear-gradient(135deg,#FFB3C7,#FFA0B8);box-shadow:0 -4px 20px rgba(0,0,0,0.3);">
  <div style="max-width:500px;margin:0 auto;">
    <klarna-express-button
      data-locale="fr-FR"
      data-theme="default"
      style="width:100%;min-height:50px;">
    </klarna-express-button>
  </div>
</div>

<script>
// Écouter le clic sur le bouton Klarna
document.addEventListener('klarna-express-button-clicked', function() {
  klarnaGo();
});

function klarnaGo() {
  var items = [];
  var els = document.querySelectorAll('.w-commerce-commercecheckoutorderitem');

  for (var i = 0; i < els.length; i++) {
    var txt = els[i].innerText;
    var m = txt.match(/(\d+)[,.](\d{2})/);
    if (m) {
      items.push({
        name: txt.substring(0, 50),
        price: parseFloat(m[1] + '.' + m[2]),
        quantity: 1
      });
    }
  }

  if (items.length === 0) {
    alert('Panier vide!');
    location.reload();
    return;
  }

  var email = document.querySelector('input[type="email"]');

  fetch('https://achzod-klarna-checkout.onrender.com/checkout', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      items: items,
      customerEmail: email ? email.value : ''
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.url) {
      window.location.href = d.url;
    } else {
      alert('Erreur: ' + d.error);
      location.reload();
    }
  })
  .catch(function(e) {
    alert('Erreur: ' + e.message);
    location.reload();
  });
}
</script>
```

---

## CODE WEBFLOW - PAGE CHECKOUT (VERSION SIMPLE - BACKUP)

Si le bouton Klarna officiel ne marche pas, utiliser cette version simple :

```html
<div id="klarna-btn-container" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:15px;background:#FFB3C7;">
  <button onclick="klarnaGo()" style="width:100%;padding:18px;background:#0A0B09;color:white;font-weight:bold;font-size:17px;border:none;border-radius:8px;cursor:pointer;">
    Payer en 3x sans frais avec Klarna
  </button>
</div>

<script>
function klarnaGo() {
  var btn = document.querySelector('#klarna-btn-container button');
  btn.innerHTML = 'Chargement...';

  var items = [];
  var els = document.querySelectorAll('.w-commerce-commercecheckoutorderitem');

  for (var i = 0; i < els.length; i++) {
    var txt = els[i].innerText;
    var m = txt.match(/(\d+)[,.](\d{2})/);
    if (m) {
      items.push({
        name: txt.substring(0, 50),
        price: parseFloat(m[1] + '.' + m[2]),
        quantity: 1
      });
    }
  }

  if (items.length === 0) {
    alert('Panier vide!');
    location.reload();
    return;
  }

  var email = document.querySelector('input[type="email"]');

  fetch('https://achzod-klarna-checkout.onrender.com/checkout', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      items: items,
      customerEmail: email ? email.value : ''
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.url) {
      window.location.href = d.url;
    } else {
      alert('Erreur: ' + d.error);
      location.reload();
    }
  })
  .catch(function(e) {
    alert('Erreur: ' + e.message);
    location.reload();
  });
}
</script>
```

---

## CODE WEBFLOW - FOOTER GLOBAL

Dans Project Settings > Custom Code > Footer Code :

```html
<script type="text/javascript">
  window.$crisp=[];
  window.CRISP_WEBSITE_ID="5978a10d-caf5-4195-bf31-ea0223759bf7";
  (function(){
    d=document;s=d.createElement("script");
    s.src="https://client.crisp.chat/l.js";
    s.async=1;
    d.getElementsByTagName("head")[0].appendChild(s);
  })();
</script>
```

---

## PAYMENT LINKS STRIPE (ALTERNATIVE - SANS PANIER)

Si le panier ne marche pas, utiliser ces liens directs :

### COACHING
| Produit | Prix | Lien |
|---------|------|------|
| Sans Suivi | 99€ | https://buy.stripe.com/14A4gA04geK7fe8ceI4ko00 |
| Starter | 149€ | https://buy.stripe.com/dRmdRaaIU45tc1WguY4ko01 |

### ESSENTIAL
| Durée | Prix | Lien |
|-------|------|------|
| 4 semaines | 249€ | https://buy.stripe.com/9B628s8AM45tfe8a6A4ko02 |
| 8 semaines | 399€ | https://buy.stripe.com/14A14o6sE59xaXSguY4ko03 |
| 12 semaines | 549€ | https://buy.stripe.com/00waEY3gs1XlaXS2E84ko04 |

### ELITE
| Durée | Prix | Lien |
|-------|------|------|
| 4 semaines | 399€ | https://buy.stripe.com/fZufZiaIUbxVfe8guY4ko05 |
| 8 semaines | 649€ | https://buy.stripe.com/cNifZidV6atR6HC0w04ko06 |
| 12 semaines | 899€ | https://buy.stripe.com/3cI3cw7wI6dB9TO3Ic4ko07 |

### PRIVATE LAB
| Durée | Prix | Lien |
|-------|------|------|
| 4 semaines | 499€ | https://buy.stripe.com/14A14o3gs9pNd60ceI4ko08 |
| 8 semaines | 799€ | https://buy.stripe.com/dRm9AU3gs8lJc1WdiM4ko09 |
| 12 semaines | 1199€ | https://buy.stripe.com/9B64gA3gs0Th2rm0w04ko0a |

### EBOOKS
| Produit | Prix | Lien |
|---------|------|------|
| Anabolic Code | 79€ | https://buy.stripe.com/5kQ7sM8AM45t0jeceI4ko0b |
| Libérer son potentiel | 49€ | https://buy.stripe.com/dRmeVe18kcBZfe85Qk4ko0c |
| 4 Semaines SHRED | 49€ | https://buy.stripe.com/aFaeVe3gsfOb4zuemQ4ko0d |
| Bioénergétique | 59€ | https://buy.stripe.com/4gMdRa8AM59x4zuemQ4ko0e |

---

## FICHIERS LOCAUX

- Code backend : `C:\Users\achzod\achzod-klarna-checkout\index.js`
- Package.json : `C:\Users\achzod\achzod-klarna-checkout\package.json`
- Ce fichier : `C:\Users\achzod\achzod-klarna-checkout\INSTRUCTIONS-KLARNA.md`

---

## EN CAS DE PROBLÈME

1. **Le bouton ne s'affiche pas** : Vérifier que le code est bien dans la page Checkout (pas le footer global)

2. **Erreur "Panier vide"** : Le sélecteur `.w-commerce-commercecheckoutorderitem` ne trouve pas les produits. Vérifier la structure HTML du checkout.

3. **Erreur serveur** : Vérifier que le service Render est en ligne : https://achzod-klarna-checkout.onrender.com

4. **Page 404 après paiement** : Créer une page `/order-confirmed` dans Webflow (voir section ci-dessous)

5. **Pas d'email de confirmation** : Vérifier que les reçus sont activés dans Stripe Dashboard > Settings > Emails

6. **Redéployer Render** :
   ```
   curl -X POST "https://api.render.com/v1/services/srv-d4k90eadbo4c73cr2bp0/deploys" -H "Authorization: Bearer rnd_Fgbg4oNgUkwfMBtVz1YveyIH2BDq"
   ```

---

## CONTACT SUPPORT

- Stripe : https://support.stripe.com
- Klarna : https://www.klarna.com/fr/service-client/
- Render : https://render.com/docs

---

Dernière mise à jour : 27 novembre 2025
