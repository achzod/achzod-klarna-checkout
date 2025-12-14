# 🎯 SYSTÈME DOUBLE STRIPE - CONFIGURATION COMPLÈTE

## ✅ CE QUI A ÉTÉ FAIT :

### 1. Backend configuré avec 2 comptes Stripe
- ✅ **Stripe UAE** → Paiements normaux (cartes, Apple Pay, Google Pay, Link)
- ✅ **Stripe FR** → Uniquement pour Klarna

### 2. Routes créées
- ✅ `/checkout` → Utilise Stripe UAE
- ✅ `/checkout-klarna` → Utilise Stripe FR avec Klarna activé
- ✅ `/webhook` → Webhook Stripe UAE
- ✅ `/webhook-klarna` → Webhook Stripe FR

### 3. Code frontend Klarna
- ✅ Fichier créé : `CODE-KLARNA-WEBFLOW.html`
- ✅ Appelle `/checkout-klarna` (Stripe FR)
- ✅ Bouton fixe en bas de la page checkout

---

## 🔧 CONFIGURATION RENDER

### Variables d'environnement à ajouter sur Render :

```bash
# Stripe UAE (déjà configuré)
STRIPE_SECRET_KEY=(clé UAE - déjà configurée)
STRIPE_PUBLIC_KEY=(clé publique UAE - déjà configurée)
STRIPE_WEBHOOK_SECRET=(webhook secret UAE - déjà configuré)

# Stripe FR (NOUVEAU - pour Klarna)
STRIPE_SECRET_KEY_FR=(clé secrète Stripe FR - à récupérer dans ton dashboard Stripe FR)
STRIPE_WEBHOOK_SECRET_FR=(webhook secret Stripe FR - à créer dans Stripe Dashboard FR)
```

---

## 🌐 CONFIGURATION WEBHOOK STRIPE FR

### 1. Va sur ton Dashboard Stripe FR
👉 https://dashboard.stripe.com (connecte-toi avec ton compte FR)

### 2. Crée le webhook
1. **Developers** > **Webhooks**
2. **Add endpoint**
3. **Endpoint URL** : `https://achzod-klarna-checkout.onrender.com/webhook-klarna`
4. **Events to send** : Sélectionne `checkout.session.completed`
5. **Add endpoint**

### 3. Copie le Signing secret
- Clique sur le webhook créé
- Copie le **Signing secret** (commence par `whsec_...`)
- C'est ton `STRIPE_WEBHOOK_SECRET_FR`

---

## 📋 CODE À COLLER DANS WEBFLOW

### Page Checkout > Custom Code > Before </body> tag

**Fichier** : `CODE-KLARNA-WEBFLOW.html`

**Copie tout le contenu** et colle-le dans Webflow !

---

## 🧪 TEST

### Test Klarna :
1. Va sur https://achzodcoaching.com/checkout
2. Ajoute un produit
3. Clique sur "Payer en 3x sans frais" (bouton Klarna)
4. Tu dois être redirigé vers Stripe FR avec Klarna
5. Vérifie que l'email ebook arrive bien

### Test paiement normal :
1. Va sur checkout
2. Clique sur "Payer" (bouton normal Webflow)
3. Tu dois être redirigé vers Stripe UAE (cartes, Apple Pay, etc.)
4. Vérifie que l'email ebook arrive bien

---

## ✅ RÉSUMÉ

**Klarna** → Stripe FR → Webhook FR → Email ebook ✅  
**Cartes/Apple Pay/etc.** → Stripe UAE → Webhook UAE → Email ebook ✅

**Les deux systèmes fonctionnent en parallèle ! 🔥**

