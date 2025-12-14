# Instructions pour configurer Stripe - Emails et Reçus

## Problèmes résolus dans le code

✅ Le code a été modifié pour :
- Utiliser "achzodcoaching" au lieu du nom personnel dans les métadonnées Stripe
- Ne plus utiliser le nom personnel dans les emails envoyés aux clients
- Envoyer toutes les notifications à achzodyt@gmail.com
- Forcer la devise EUR dans les sessions Stripe

## Configuration requise dans Stripe Dashboard

### 1. Désactiver les reçus Stripe automatiques

**Stripe UAE (compte principal) :**
1. Va sur https://dashboard.stripe.com/settings/billing/automatic
2. Désactive "Send email receipts to customers"
3. Sauvegarde

**Stripe FR (compte Klarna) :**
1. Va sur https://dashboard.stripe.com/settings/billing/automatic (avec le compte FR)
2. Désactive "Send email receipts to customers"
3. Sauvegarde

### 2. Configurer le nom du marchand

**Stripe UAE :**
1. Va sur https://dashboard.stripe.com/settings/business
2. Change "Business name" en "AchzodCoaching" ou "achzodcoaching"
3. Sauvegarde

**Stripe FR :**
1. Même chose avec le compte FR
2. Change "Business name" en "AchzodCoaching" ou "achzodcoaching"
3. Sauvegarde

### 3. Configurer les notifications par email

**Stripe UAE :**
1. Va sur https://dashboard.stripe.com/settings/notifications
2. Ajoute achzodyt@gmail.com comme email de notification
3. Active les notifications pour :
   - Payment succeeded
   - Payment failed
   - Charge succeeded
   - Charge failed

**Stripe FR :**
1. Même chose avec le compte FR
2. Ajoute achzodyt@gmail.com comme email de notification

### 4. Vérifier la devise par défaut

**Stripe UAE :**
1. Va sur https://dashboard.stripe.com/settings/business
2. Vérifie que "Default currency" est "EUR" (pas AED)
3. Si c'est AED, change-le en EUR

**Stripe FR :**
1. Vérifie que la devise par défaut est EUR (devrait déjà être le cas)

## Notes importantes

- Les reçus Stripe automatiques doivent être désactivés car nous envoyons nos propres emails personnalisés
- Les métadonnées dans le code ajoutent "achzodcoaching" mais le nom du business dans Stripe doit aussi être changé
- Tous les emails de notification Stripe iront à achzodyt@gmail.com
- Les emails envoyés aux clients n'utilisent plus le nom personnel, seulement "achzodcoaching"

