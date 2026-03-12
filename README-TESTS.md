# Script de Tests Complets

Ce script teste **TOUT** le système de bout en bout :
- ✅ Chaque produit (ebooks, coaching)
- ✅ Chaque type de paiement (UAE normal, Klarna FR)
- ✅ Vérification des emails
- ✅ Vérification des webhooks
- ✅ Vérification des liens de téléchargement
- ✅ Vérification de la devise EUR
- ✅ Vérification des métadonnées (achzodcoaching)
- ✅ Test de la route `/download-links`

## Utilisation

```bash
# Installer les dépendances
npm install

# Lancer les tests (nécessite les variables d'environnement)
STRIPE_SECRET_KEY=sk_live_... STRIPE_SECRET_KEY_FR=sk_live_... npm test
```

Ou créer un fichier `.env` :
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_SECRET_KEY_FR=sk_live_...
API_URL=https://achzod-klarna-checkout.onrender.com
```

Puis :
```bash
npm test
```

## Ce qui est testé

### Produits testés :
1. **EBOOK** (4.90€) - doit trouver "liberer son potentiel"
2. **ANABOLIC CODE** (7.90€) - doit trouver "anabolic code"
3. **4 Semaines pour être SHRED** (5.90€) - doit trouver "4 semaines pour etre shred"
4. **Bioénergétique** (5.90€) - doit trouver "bioenergetique"
5. **Libérer son potentiel génétique en 10 semaines** (4.90€) - doit trouver "liberer son potentiel"
6. **Coaching sans suivi** (99€) - pas d'ebook
7. **Starter** (149€) - pas d'ebook

### Pour chaque produit :
- ✅ Création de session Stripe UAE
- ✅ Création de session Stripe FR (Klarna)
- ✅ Vérification devise EUR
- ✅ Vérification métadonnées (merchant_name = achzodcoaching)
- ✅ Vérification email client
- ✅ Test route `/download-links`
- ✅ Vérification détection ebook

## Résultats

Le script affiche :
- ✅ Tests réussis (vert)
- ❌ Tests échoués (rouge)
- ⚠️  Avertissements (jaune)
- 📊 Résumé final avec taux de réussite

## Problèmes détectés et corrigés

1. ✅ **payment_method_options[klarna][enabled]** - Paramètre invalide retiré
2. ✅ **Extraction session_id** - Amélioration pour gérer le format `/pay/cs_live_...`
3. ✅ **Price IDs manquants** - Le système utilise `price_data` en fallback
4. ✅ **Détection ebooks** - Amélioration avec plus de variantes de noms

## Notes

- Les tests créent des sessions Stripe réelles (mais non payées)
- Les sessions expirent après 30 minutes
- Les tests peuvent prendre quelques minutes (pause de 1s entre chaque test)



