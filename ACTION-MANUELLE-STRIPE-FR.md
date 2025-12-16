# Action Manuelle Requise : Changer le Nom du Business dans Stripe FR

## Problème

Les reçus Stripe (Klarna) affichent "achkan hosseini maneche" au lieu de "AchzodCoaching".

## Solution

L'API Stripe ne permet pas de modifier le nom du business sur un compte standard. Tu dois le faire manuellement dans le dashboard Stripe.

## Instructions

1. **Ouvre ton compte Stripe FR**
   - Va sur https://dashboard.stripe.com
   - Connecte-toi avec ton compte Stripe FR (celui lié à Klarna)

2. **Accède aux paramètres du business**
   - Clique sur **Settings** (Paramètres) en haut à droite
   - Dans le menu de gauche, clique sur **Business settings** (Paramètres du business)
   - Ou accède directement à : https://dashboard.stripe.com/settings/business

3. **Modifie le nom du business**
   - Dans la section **Business details** (Détails du business)
   - Trouve le champ **Business name** (Nom du business)
   - Remplace "achkan hosseini maneche" par **AchzodCoaching**

4. **Modifie aussi l'URL du support (optionnel mais recommandé)**
   - **Support URL** : https://achzodcoaching.com
   - **Support email** : achzodyt@gmail.com

5. **Sauvegarde**
   - Clique sur **Save** (Enregistrer)

## Résultat

Après cette modification, tous les futurs reçus Stripe (Klarna) afficheront "AchzodCoaching" au lieu de ton nom personnel.

## Note

Cette modification ne s'applique qu'aux **futurs** paiements. Les reçus déjà envoyés (comme celui du client qui a commandé Anabolic Code) ne seront pas mis à jour rétroactivement.

