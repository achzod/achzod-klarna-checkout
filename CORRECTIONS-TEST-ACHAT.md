# Corrections suite au test d'achat

## Problèmes identifiés

### 1. ✅ Page de confirmation affiche $0.00
**Cause** : Problème Webflow - la page de confirmation récupère les données depuis Webflow Commerce, pas directement depuis Stripe.

**Solution** : 
- Vérifier dans Webflow > Settings > Commerce que la devise par défaut est **EUR**
- Vérifier que les commandes sont bien synchronisées entre Stripe et Webflow
- Si le problème persiste, c'est un bug Webflow - contacter leur support

### 2. ✅ Email Klarna affiche "achkan hosseini maneche"
**Cause** : Le nom dans les emails Klarna vient du **nom du business** configuré dans Stripe FR, pas des métadonnées.

**Solution** :
1. Va sur https://dashboard.stripe.com/settings/business (avec le compte Stripe FR)
2. Change "Business name" en : **AchzodCoaching**
3. Sauvegarde

**Note** : Les métadonnées `merchant_name` dans les sessions Stripe ne changent pas le nom dans les emails Klarna. C'est le nom du business dans les paramètres Stripe qui est utilisé.

### 3. ✅ Détection ebook "4 Semaines pour être SHRED"
**Corrigé** : 
- Ajout de variantes : "EBOOK € 49,00 EUR 4 Semaines pour être SHRED - Perte de gras et prise de muscles"
- Détection améliorée pour reconnaître "ebook" + "shred" + "4 semaines"
- Logs détaillés pour voir ce qui est détecté

**Vérification** : Les logs sur Render montreront si l'ebook a été détecté lors du prochain achat.

## Vérifications à faire

1. **Vérifier les logs Render** après un achat pour voir :
   - Si l'ebook a été détecté
   - Quel nom de produit exact est reçu depuis Stripe
   - Si l'email avec le lien a été envoyé

2. **Vérifier l'email reçu** :
   - L'email ACHZOD (pas Klarna) devrait contenir le lien de téléchargement
   - Vérifier la boîte de réception et les spams

3. **Vérifier la page de confirmation Webflow** :
   - Les montants devraient s'afficher correctement après avoir changé la devise dans Webflow

## Actions immédiates

1. ✅ Code amélioré et déployé
2. ⚠️ **À FAIRE** : Changer le nom du business dans Stripe FR dashboard
3. ⚠️ **À FAIRE** : Vérifier la devise dans Webflow Commerce settings

