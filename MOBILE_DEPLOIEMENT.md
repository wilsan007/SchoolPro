# EcolPro Mobile — Guide de publication (App Store & Play Store)

> Approche : **Capacitor** encapsule l'application web EcolPro hébergée.
> La coque native charge `server.url` (l'app déployée) et ajoute les capacités
> natives : notifications push, caméra, biométrie, état réseau, splash screen.

---

## 0. Pré-requis (à installer sur le Mac)

| Outil | Pour | Installation |
|-------|------|-------------|
| **Xcode** (≥ 15) | build iOS | App Store |
| **CocoaPods** | dépendances iOS | `sudo gem install cocoapods` |
| **Android Studio** | build Android | developer.android.com/studio |
| **JDK 17** | build Android | `brew install openjdk@17` |
| **Compte Apple Developer** | App Store | 99 $/an — developer.apple.com |
| **Compte Google Play** | Play Store | 25 $ une fois — play.google.com/console |

> ⚠️ Aucun de ces outils n'est requis pour le code : tout le pont natif est déjà
> en place. Ils ne servent qu'à **compiler et publier** les binaires.

---

## 1. Pré-requis applicatif : déployer le web d'abord

La coque mobile pointe vers l'app **déployée** (pas le code local). Déployer le
front Next.js (Vercel recommandé) et noter l'URL de production, ex.
`https://app.ecolpro.app`.

> **Multi-tenant :** chaque école a un sous-domaine (`lycee-x.ecolpro.app`).
> Pour le mobile, deux options :
> 1. **Point d'entrée unique** `app.ecolpro.app` avec un écran « Choisir mon
>    établissement » (saisie du slug) → recommandé pour une app unique sur les stores.
> 2. **App en marque blanche** par école (un build par tenant) → réservé aux
>    contrats Enterprise.
>
> Le `allowNavigation: ["*.ecolpro.app"]` de `capacitor.config.ts` permet déjà
> de naviguer entre sous-domaines sans sortir de la webview.

---

## 2. Générer les projets natifs

```bash
# Définir l'URL de prod (sinon valeur par défaut de capacitor.config.ts)
export CAP_SERVER_URL=https://app.ecolpro.app

npm run cap:add:ios       # crée ./ios
npm run cap:add:android   # crée ./android
npm run cap:sync          # installe les plugins natifs + applique la config
```

---

## 3. Icônes & splash screen

```bash
npm i -D @capacitor/assets
# Déposer un logo 1024×1024 dans ./assets/icon.png et ./assets/splash.png (2732×2732)
npx @capacitor/assets generate --iconBackgroundColor '#4f46e5' --splashBackgroundColor '#4f46e5'
npm run cap:sync
```

---

## 4. Notifications push

### Android (FCM)
1. Créer un projet **Firebase** → ajouter une app Android (`app.ecolpro.mobile`).
2. Télécharger `google-services.json` → le placer dans `android/app/`.
3. `npm run cap:sync`.

### iOS (APNs)
1. Dans Firebase, ajouter une app iOS (`app.ecolpro.mobile`) → `GoogleService-Info.plist`
   dans `ios/App/App/`.
2. Apple Developer → créer une **APNs Auth Key** (.p8) → l'uploader dans Firebase.
3. Dans Xcode → onglet *Signing & Capabilities* → ajouter **Push Notifications**
   et **Background Modes › Remote notifications**.

> Le client est déjà câblé : `src/lib/mobile/native.ts` enregistre le token et le
> POST vers `/api/mobile/register-device` (table `device_tokens`).
> **À faire côté backend (TODO M30) :** un worker qui envoie via FCM aux tokens
> du tenant quand une `Notification` de canal `PUSH` est créée
> (voir `src/app/api/communication/route.ts`, point d'envoi déjà marqué).

---

## 5. Appliquer la migration DB

Avant la mise en prod, exécuter sur Supabase :

```bash
psql "$DATABASE_URL" -f migration_device_tokens.sql
# ou : npx prisma migrate dev --name add_device_tokens   (en local)
```

---

## 6. Build & publication

### iOS → App Store
```bash
npm run cap:ios          # ouvre Xcode
```
Dans Xcode : choisir l'équipe de signature → *Product › Archive* →
*Distribute App › App Store Connect*. Puis sur **App Store Connect** :
fiche app, captures (6.7" + 5.5"), confidentialité, soumettre à la revue.

### Android → Play Store
```bash
npm run cap:android      # ouvre Android Studio
```
Dans Android Studio : *Build › Generate Signed Bundle (AAB)* (créer un keystore,
**le sauvegarder précieusement**). Puis sur **Play Console** : créer l'app,
uploader l'`.aab` en test interne → production, fiche + captures, soumettre.

---

## 7. Checklist conformité stores

- [ ] Politique de confidentialité en ligne (obligatoire — données élèves mineurs)
- [ ] Mentions RGPD / consentement parental (public scolaire mineur)
- [ ] Comptes de démo fournis aux reviewers (Apple exige un login de test)
- [ ] Icône, splash, captures pour chaque taille requise
- [ ] Version & build number incrémentés à chaque soumission
- [ ] `cleartext: false` (déjà configuré) — HTTPS obligatoire

---

## Récapitulatif de ce qui est DÉJÀ en place dans le code

| Élément | Fichier |
|--------|---------|
| Config Capacitor (server.url, plugins, splash) | `capacitor.config.ts` |
| Pont natif (status bar, splash, push, back button) | `src/lib/mobile/native.ts` |
| Provider d'init natif monté à la racine | `src/components/providers/NativeProvider.tsx` |
| Enregistrement du token push | `src/app/api/mobile/register-device/route.ts` |
| Modèle `DeviceToken` + migration | `prisma/schema.prisma`, `migration_device_tokens.sql` |
| Page de repli hors-ligne native | `mobile/www/index.html` |
| Scripts npm (`cap:*`) | `package.json` |
