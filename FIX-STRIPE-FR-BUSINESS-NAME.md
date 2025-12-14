# Fix: Nom du business dans Stripe FR (pour emails Klarna)

## Problème

Les emails Klarna affichent "achkan hosseini maneche" au lieu de "achzodcoaching".

## Solution

Le nom dans les emails Klarna vient du **nom du business configuré dans Stripe FR**, pas des métadonnées de la session.

### Étapes pour corriger :

1. **Va sur le dashboard Stripe FR** : https://dashboard.stripe.com (avec le compte FR)
2. **Settings > Business** : https://dashboard.stripe.com/settings/business
3. **Change "Business name"** en : `AchzodCoaching` ou `achzodcoaching`
4. **Sauvegarde**

### Alternative : Via API (si tu veux que je le fasse)

Je peux créer un script pour mettre à jour le nom du business via l'API Stripe, mais il faut que le compte soit en mode "Express" ou "Standard" (pas Connect).

**Note** : Les métadonnées `merchant_name` et `business_name` dans les sessions Stripe ne changent pas le nom dans les emails Klarna. C'est le nom du business dans les paramètres Stripe qui est utilisé.

## Vérification

Après avoir changé le nom, les prochains emails Klarna devraient afficher "AchzodCoaching" au lieu de "achkan hosseini maneche".

