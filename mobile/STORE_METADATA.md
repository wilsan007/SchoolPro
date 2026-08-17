# EcolPro — App Store / Google Play Metadata

## Google Play Store

### Titre (30 chars max)
EcolPro — Gestion Scolaire

### Description courte (80 chars max)
Plateforme intelligente de gestion scolaire pour l'Afrique francophone.

### Description complète (4000 chars max)
EcolPro est la plateforme SaaS de gestion scolaire conçue pour les établissements d'Afrique francophone et de la Corne de l'Afrique.

**Pour les parents :**
• Suivez en temps réel la scolarité de vos enfants (notes, bulletins, absences)
• Consultez l'emploi du temps et les documents scolaires
• Communiquez directement avec les enseignants et la direction
• Gérez les factures et les paiements scolaires
• Recevez des notifications instantanées (absences, notes, messages)

**Pour les enseignants :**
• Saisissez les notes et les absences depuis votre mobile
• Générez des bulletins automatiquement
• Bénéficiez du moteur pédagogique LEARNOS (recommandations adaptées)
• Planifiez vos cours et vos évaluations

**Pour la direction :**
• Tableau de bord en temps réel (effectifs, absences, finances)
• Gestion multi-sites et multi-tenant
• Analytics et prédictions pédagogiques
• Gestion des classes, élèves, et personnel

**Fonctionnalités uniques :**
• LEARNOS : seul SIS au monde avec prédiction de difficulté par chapitre
• Bot parent IA : réponses automatiques aux questions des parents
• Notifications WhatsApp, Telegram, SMS et Email
• Paiements locaux (Dahab Plus, Saba Pay, Faida, Waffi, CAC Pay)
• Fonctionnement offline pour les zones à connectivité limitée

### Mots-clés (100 chars max)
école, gestion scolaire, notes, bulletins, absences, parent, enseignant, pronote, eduka

### Catégorie
Éducation

### Classification de contenu
Tout public

### Coûts
Gratuit avec abonnement établissement

---

## Apple App Store

### Nom de l'app (30 chars max)
EcolPro

### Sous-titre (30 chars max)
Gestion scolaire intelligente

### Description (4000 chars max)
(Voir description Google Play ci-dessus)

### Mots-clés (100 chars max, séparés par virgules)
ecole,gestion,notes,bulletins,absences,parent,enseignant,scolarite,pronote,eduka

### Catégorie primaire
Éducation

### Catégorie secondaire
Productivité

### Classification
4+ (Tout public)

### URL de support
https://ecolpro.app/support

### URL de politique de confidentialité
https://ecolpro.app/privacy

---

## Captures d'écran requises

### Google Play
- Minimum: 2 captures, Maximum: 8 captures
- Format: PNG ou JPEG
- Minimum: 320px, Maximum: 3840px
- Ratio: 16:9 ou 9:16

### Apple App Store
- iPhone 6.7" (1290x2796) — obligatoire
- iPhone 6.5" (1242x2688) — obligatoire
- iPhone 5.5" (1242x2208) — obligatoire
- iPad 12.9" (2048x2732) — si supporte iPad

## Icône d'application
- Google Play: 512x512 PNG (32-bit)
- Apple: 1024x1024 PNG (sans coins arrondis, sans alpha)

---

## Build et déploiement

### Android (Google Play)
```bash
# 1. Générer les assets natifs
pnpm add -D @capacitor/assets
npx capacitor-assets generate --android

# 2. Ajouter la plateforme Android
pnpm cap:add:android

# 3. Synchroniser le code web
CAP_SERVER_URL=https://app.ecolpro.app pnpm cap:sync

# 4. Ouvrir dans Android Studio
pnpm cap:android

# 5. Dans Android Studio: Build > Generate Signed Bundle/APK
# 6. Créer un keystore de signature (keytool)
# 7. Build AAB (Android App Bundle) pour le Play Store
# 8. Uploader sur https://play.google.com/console
```

### iOS (App Store)
```bash
# 1. Générer les assets natifs
npx capacitor-assets generate --ios

# 2. Ajouter la plateforme iOS
pnpm cap:add:ios

# 3. Synchroniser le code web
CAP_SERVER_URL=https://app.ecolpro.app pnpm cap:sync

# 4. Ouvrir dans Xcode
pnpm cap:ios

# 5. Dans Xcode:
#    - Configurer le Bundle ID: app.ecolpro.mobile
#    - Configurer le Team (compte développeur Apple)
#    - Product > Archive
#    - Window > Organizer > Distribute App > App Store Connect
# 6. Uploader et soumettre sur https://appstoreconnect.apple.com
```

### Configuration requise

#### Avant de build
1. Définir `CAP_SERVER_URL` avec l'URL de production
2. Vérifier que `AUTH_SECRET` est configuré sur le serveur
3. Configurer Firebase Cloud Messaging (Android) et APNs (iOS) pour les push notifications
4. Tester le flow d'authentification dans la webview native

#### Comptes développeur
- **Google Play Console**: $25 (une fois) — https://play.google.com/console
- **Apple Developer Program**: $99/an — https://developer.apple.com
