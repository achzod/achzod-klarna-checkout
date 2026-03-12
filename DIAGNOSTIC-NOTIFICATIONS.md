# 🔧 DIAGNOSTIC - Notifications Klarna non reçues

## ❌ Problème identifié

Tu ne reçois pas de notifications/emails quand un client achète via Klarna.

## ✅ SOLUTION - 3 étapes obligatoires

---

## ÉTAPE 1 : Configurer Gmail App Password

1. **Va sur** : https://myaccount.google.com/security
2. **Active la validation en 2 étapes** (si pas fait)
3. **Cherche** "Mots de passe des applications" (ou va sur https://myaccount.google.com/apppasswords)
4. **Crée un mot de passe** :
   - Sélectionne "Autre (nom personnalisé)"
   - Nomme-le "ACHZOD Render"
   - **Copie le mot de passe** (16 caractères sans espaces)

---

## ÉTAPE 2 : Configurer Render

1. **Va sur** : https://dashboard.render.com
2. **Clique sur ton service** : `achzod-klarna-checkout`
3. **Va dans** : Environment → Environment Variables
4. **Vérifie/Ajoute ces variables** :

| Variable | Valeur |
|----------|--------|
| `EMAIL_USER` | `achzodyt@gmail.com` |
| `EMAIL_PASS` | `[le mot de passe App Gmail de l'étape 1]` |
| `STRIPE_SECRET_KEY_FR` | `sk_live_...` (clé Stripe FR) |
| `STRIPE_WEBHOOK_SECRET_FR` | `whsec_...` (créé à l'étape 3) |

5. **Clique** "Save Changes" puis **Redeploy**

---

## ÉTAPE 3 : Créer le Webhook Stripe FR

1. **Va sur** : https://dashboard.stripe.com/webhooks
   - ⚠️ Assure-toi d'être sur ton **compte Stripe FRANCE**
   
2. **Clique** "Ajouter un endpoint"

3. **Remplis** :
   - **URL de l'endpoint** : `https://achzod-klarna-checkout.onrender.com/webhook-klarna`
   - **Description** : Notifications Klarna ACHZOD
   - **Événements à écouter** : `checkout.session.completed`

4. **Clique** "Ajouter l'endpoint"

5. **Copie le Signing secret** :
   - Clique sur le webhook créé
   - Révèle le "Signing secret" (`whsec_...`)
   - **C'est ta variable `STRIPE_WEBHOOK_SECRET_FR`**

---

## 🧪 TEST

Après avoir fait les 3 étapes :

1. Fais un achat test via Klarna
2. Vérifie :
   - Ta boîte mail `achzodyt@gmail.com` (notification vendeur)
   - La boîte du client (email avec liens ebook)
   - Les logs Render : Dashboard → Logs

---

## 📊 Vérifier les logs Render

Pour voir si les webhooks arrivent :
1. Va sur https://dashboard.render.com
2. Clique sur `achzod-klarna-checkout`
3. Va dans "Logs"
4. Cherche :
   - `checkout.session.completed` → Webhook reçu
   - `Email envoyé à:` → Email parti
   - `Erreur` → Problème à corriger

---

## ❓ Problèmes courants

### "Webhook signature verification failed"
→ Le `STRIPE_WEBHOOK_SECRET_FR` est incorrect. Recréer le webhook et copier le nouveau secret.

### "Invalid login" ou erreur email
→ L'App Password Gmail est incorrect. En recréer un nouveau.

### Rien dans les logs
→ Le webhook n'est pas appelé. Vérifier l'URL et les événements sur Stripe.

---

## 🔗 Liens utiles

- **Render Dashboard** : https://dashboard.render.com
- **Stripe Dashboard FR** : https://dashboard.stripe.com
- **Gmail App Passwords** : https://myaccount.google.com/apppasswords
