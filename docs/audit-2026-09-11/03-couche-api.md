# Étape 3 — Couche API (266 routes)

**Score actuel : 5,0 / 10** (brut 6,1 — plafonné à 5,0 par deux constats critiques)
**Score cible : 9,7** · **Effort estimé : 10 à 12 jours-développeur**
Inventaire noté route par route : **annexe A** (moyenne automatique 8,94 ; 97 routes sur 266 à 9,7 ou plus ; 21 sous 7).

---

## 1. Périmètre et méthode

`src/app/api/**/route.ts` : 266 fichiers. Chaque route a été analysée par un script (`api-scan.mjs`, fourni dans le dossier de travail) qui repère sept signaux : authentification, contrôle de rôle, validation Zod du corps, `tenantId`, audit des mutations, présence d'un test, fuite de message d'erreur. Chaque signal suspect a ensuite été **vérifié à la main**. Les faux positifs (routes mobiles via `verifyMobileScope`, routes super-admin via `authorizeSuperAdmin`) ont été retirés.

## 2. Ce qui est solide

- **233 routes sur 266** s'authentifient ; les 33 restantes sont publiques par conception (auth, webhooks signés, cron à secret, invitations de réinscription, santé). Les 22 routes mobiles utilisent `verifyMobileScope`, qui relit le périmètre en base à chaque appel.
- **Codes d'erreur traduisibles** (`erreurJson`, `src/lib/erreurs-api.ts`) dans 108 routes, avec un test qui échoue si un code manque dans l'une des trois langues.
- **Le constat H-03 du pentest est corrigé** : il ne reste qu'un seul renvoi de `error.message` au client (`admissions/[id]:593`, message métier contrôlé).
- **Le constat C-01 du pentest est corrigé** : le webhook Stripe vérifie la signature via `constructEvent` (`stripe/webhook/route.ts:25`), sans repli.
- **Des outils IA à outils fermés** (`api/ai/chat`), chacun validé par un schéma Zod et soumis à une limitation de débit.

## 3. Constats

### API-C1 — Critique — N'importe quel compte peut clôturer, rouvrir ou archiver l'année scolaire

**Preuve.** `PATCH /api/parametres/annees-scolaires/[id]` (`route.ts:44-100`) vérifie seulement la session et l'appartenance de l'année au tenant. Il n'y a **aucun contrôle de rôle** avant `cloturerAnnee`, `reouvrirAnnee` ou `archiverAnnee`.

**Scénario.** Un parent connecté envoie `PATCH … {"action":"cloturer"}`. L'année courante est clôturée pour toute l'école, avec les effets en cascade de `cloturerAnnee` (`src/lib/annee-scolaire.ts`) sur les écrans, les saisies et les bulletins annuels.

### API-C2 — Critique — N'importe quel compte peut changer des élèves de classe

**Preuve.** `POST /api/eleves/changer-classe` (`route.ts:7-60`) :
1. Aucun contrôle de rôle, et aucune validation Zod (le corps est simplement « casté »).
2. Pour PARENT et STUDENT, `siteFilterForModel("eleve")` renvoie `{}` (voir ISO-H2) : **tous** les élèves du tenant sont modifiables.
3. `tx.historiqueClasse.updateMany({ where: { eleveId: { in: eleveIds }, dateSortie: null } })` ne filtre pas sur `tenantId`, et `createMany` crée de l'historique pour des identifiants non vérifiés : **écriture inter-tenant** (voir ISO-H3).

### API-H1 — Haute — Six autres mutations sans contrôle de rôle

Ces routes s'authentifient mais ne vérifient ni permission ni rôle ; elles sont donc ouvertes aux familles :

| Route | Effet accessible à un PARENT |
|---|---|
| `POST/DELETE /api/eleves/dispenses` | créer ou supprimer une dispense de matière (qui retire la matière de la moyenne du bulletin) |
| `POST /api/eleves/upload-photo` | remplacer la photo d'un élève |
| `POST /api/eleves/attestation` | générer une attestation officielle |
| `POST /api/vie-scolaire/convocations` | émettre une convocation |
| `POST /api/classeur` | générer le classeur PDF |
| `GET /api/parametres/classes/export` | exporter la liste des classes et des professeurs principaux |

### API-H2 — Haute — L'autorisation des API ne repose sur aucun contrôle systématique

Le middleware laisse passer `/api/*` sans `canAccessRoute` (`src/middleware.ts:67-87`, choix documenté : il ne voit pas la ressource). Chaque route doit donc se protéger elle-même, mais **rien ne vérifie qu'elle le fait**. `_security-guards.test.ts` couvre 5 routes nommées à la main. C'est ce qui a laissé passer API-C1, API-C2 et API-H1.

### API-H3 — Haute — Les mutations ne sont presque pas auditées

Seules **18 routes de mutation sur 173** écrivent dans `AuditLog`, et **27 routes `DELETE` sur 33** ne laissent aucune trace. Parmi elles :
- `super-admin/tenants/[id]` : suppression d'un **établissement entier** ;
- `budgets/[id]`, `depenses/[id]` : données financières ;
- `vie-scolaire/fiches-sanitaires/[id]`, `vie-scolaire/infirmerie/[id]` : **données de santé** ;
- `examens/[id]`, `curriculum/chapitres/[id]`, `emploi-du-temps/[id]`.

Le pentest du 28/08 le relevait déjà (H-05) : ce n'est toujours pas traité.

### API-M1 — Moyenne — 19 routes lisent un corps sans validation Zod

`communication/[id]`, `eleves/changer-classe`, `eleves/dispenses`, `eleves/generer-comptes`, `eleves/upload-photo`, `emploi-du-temps/[id]`, `emploi-du-temps/auto-generate`, `emploi-du-temps/import`, `import/eleves/analyze`, `inscriptions/upload`, `learnos/commentaires-bulletin`, `learnos/entrainement`, `learnos/intelligence`, `mobile/demo-now`, `parametres/annees-scolaires/[id]`, `parametres/upload-signature`, `parents/generer-comptes`, `stripe/checkout`, `vie-scolaire/convocations`.

### API-M2 — Moyenne — L'identifiant d'invitation sert de jeton, sans expiration

`GET /api/reinscription/invitation/[id]` et `POST /api/reinscription/confirm` sont publiques. Le jeton est l'`id` cuid de `InvitationReinscription` (`schema.prisma:802-803`). Un cuid n'est pas un secret cryptographique, et aucune date d'expiration n'est vérifiée. La limitation de débit existe (constat M-08 du pentest corrigé), mais elle repose sur l'IP, contournable (AUTH-H3).

### API-M3 — Moyenne — Deux formats d'erreur coexistent

108 routes renvoient un code (`erreurJson`), 167 contiennent encore des messages français figés (`{ error: "Non autorisé" }`). Le client ne peut pas traduire ces derniers en anglais ni en somali.

### API-M4 — Moyenne — Routes monolithiques

12 routes dépassent 330 lignes : `emploi-du-temps/auto-generate` (746), `admissions/[id]` (633), `comparateur` (537), `import/eleves` (464), `emploi-du-temps/import` (429), `ai/chat` (424), `messages/conversations` (392), `conseil-augmente` (380), `cahier-journal/generer-semaine` (353), `learnos/eleves/[id]/evolution` (352), `bulletins/generer` (337), `bulletins/matrice` (336). La logique métier y est mêlée au protocole HTTP, ce qui la rend impossible à tester sans simuler Next.js (et contredit la règle n°7 : domaine pur).

### API-B1 — Basse — Journaux de débogage en production

34 `console.log` dans 7 routes, dont `bulletins/generer` (« step 12 », « step 13 »…).

## 4. Angles morts

1. **Aucun test « refus »** systématique : pour une route donnée, rien ne prouve qu'un rôle non autorisé reçoit 403.
2. **Aucune clé d'idempotence** sur les créations sensibles (paiement, facture, inscription) : un double clic crée deux enregistrements (voir MET-H5).
3. **Aucun contrat d'API** (OpenAPI ou types partagés) : le mobile (`mobile-app/lib/api.ts`) et le web dépendent de réponses qu'aucun test ne fige.
4. **Taille des requêtes** : aucune limite explicite sur les imports (`import/*`, `curriculum/import`), qui acceptent des fichiers analysés en mémoire.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 4 | 2 critiques, 6 routes sans rôle | 10 |
| Exactitude (25 %) | 8 | La majorité des routes métier sont correctes | 9,5 |
| Robustesse (15 %) | 7 | 19 corps non validés ; pas d'idempotence | 9,5 |
| Tests (15 %) | 6 | 26 fichiers de tests pour 266 routes | 9,5 |
| Traçabilité (10 %) | 4 | 18 mutations auditées sur 173 | 9,5 |
| Maintenabilité (10 %) | 7 | Deux formats d'erreur, routes monolithiques | 9,5 |
| **Brut** | **6,1** | | |
| **Plafond** | **5,0** | | |

---

## 6. Cahier des charges

### API-1 — Corriger les deux critiques *(P0, 0,5 j, PR d'urgence avec AUTH-1)*

1. `parametres/annees-scolaires/[id]/route.ts` : **ne pas** utiliser `parametres:write`, car ACCOUNTANT la possède (`src/lib/permissions.ts`, rôle ACCOUNTANT), ce qui permettrait à un comptable de clôturer l'année. Créer une permission dédiée `annees:gerer` :
   - l'ajouter au type `Permission` et à TENANT_ADMIN (SUPER_ADMIN a déjà `*`). Pour PRINCIPAL, c'est une **décision du chef d'établissement** : aujourd'hui, il n'a que `parametres:read` ;
   - dans le PATCH, juste après la vérification de session :
     ```ts
     const denied = checkPermission(session.user.role, "annees:gerer");
     if (denied) return denied;
     ```
   - dans le GET : `checkPermission(role, "parametres:read")` ;
   - valider le corps avec `z.object({ action: z.enum(["cloturer", "reouvrir", "archiver"]) })` ;
   - auditer chaque action (`annee:cloturer`, `annee:reouvrir`, `annee:archiver`) avec l'utilisateur, l'année et le statut avant et après.
2. `eleves/changer-classe/route.ts` :
   - validation : `z.object({ eleveIds: z.array(z.string().min(1)).min(1).max(500), nouvelleClasseId: z.string().min(1) })` ;
   - `checkPermission(role, "eleves:write")`. Aujourd'hui, `eleves:write` est détenue par TENANT_ADMIN, PRINCIPAL, SECRETARY et **ACCOUNTANT**. Faire confirmer par la direction qu'un comptable peut changer un élève de classe ; sinon, créer `eleves:affecter` ;
   - dans la transaction, relire les élèves réellement modifiables : `const ok = await tx.eleve.findMany({ where: { id: { in: eleveIds }, tenantId, ...eleveFilter }, select: { id: true } })`, puis n'utiliser **que** `ok.map(e => e.id)` pour l'`updateMany` des élèves **et** pour les deux opérations sur `historiqueClasse`, en ajoutant `tenantId` à leurs `where` ;
   - vérifier que la classe cible appartient à l'année courante ;
   - écrire un audit `eleves:changer-classe` avec la liste des identifiants, l'ancienne classe et la nouvelle.

**Tests** (`src/app/api/eleves/changer-classe/changer-classe.test.ts` et `parametres/annees-scolaires/annees.test.ts`) : PARENT, STUDENT et TEACHER → 403 ; TENANT_ADMIN → 200 ; `eleveIds` contenant l'identifiant d'un autre tenant → cet élève n'est pas modifié et aucune ligne d'historique n'est créée pour lui.

### API-2 — Contrôle systématique « toute mutation vérifie un rôle » *(P0, 1,5 j)*

Test `src/app/api/_route-guards.test.ts`, qui s'inspire du script d'annexe :
1. Parcourir `src/app/api/**/route.ts`.
2. Pour chaque fichier exportant `POST`, `PUT`, `PATCH` ou `DELETE`, exiger l'appel à l'une des fonctions reconnues (`checkPermission`, `authorize`, `authorizeSuperAdmin`, `requirePermission`, `verifyMobileScope` suivi d'un contrôle de rôle, contrôle de signature pour les webhooks, `CRON_SECRET`), **ou** la présence du fichier dans une liste d'exceptions `ROUTES_PUBLIQUES`, chaque entrée portant une justification écrite.
3. Pour chaque route qui n'est pas en exception, **tester réellement** le refus. Un tableau déclaratif `[route, méthode, rôleRefusé, corpsMinimal]` sert à appeler le handler avec une session simulée, puis vérifie que le statut vaut 403, avec Prisma simulé. Commencer par les routes d'API-H1.

**Critère.** Retirer volontairement `checkPermission` d'une route fait échouer la CI.

### API-3 — Corriger API-H1 *(P1, 1 j)*

Pour chacune des 6 routes : permission adéquate (`eleves:write`, `vie-scolaire:write`, `parametres:read`…), validation Zod, et, pour `attestation` et `upload-photo`, vérification que l'élève appartient au périmètre (`siteFilterForModel` puis `findFirst`). Chaque route reçoit son test de refus, via API-2.

### API-4 — Audit de toutes les mutations *(P1, 3 j)*

1. Créer `withAudit(handler, { action, resource })` dans `src/lib/audit.ts`. Après une réponse 2xx, le wrapper écrit `auditFire` avec `userId`, `tenantId`, l'IP de confiance (AUTH-4), la ressource, l'identifiant (paramètre de route ou `id` de la réponse) et un **résumé** du corps, dont les champs sensibles sont masqués par une liste (`password`, `totp`, `iban`, etc.).
2. Appliquer le wrapper aux 155 mutations non auditées, par lots de domaine. Traiter en priorité : suppressions (27), finances, santé, notes et bulletins, paramètres, super-admin.
3. Test : API-2 étendu, qui exige `withAudit` ou `auditFire` dans toute route de mutation.
4. **Suppression d'un établissement** : voir DON-3 (étape 11), qui remplace la suppression définitive.

### API-5 — Validation Zod des 19 corps restants *(P1, 1,5 j)*

Pour chaque route d'API-M1 : un schéma `z.object(...).strict()` en tête de fichier, puis `safeParse` et `erreurJson("DONNEES_INVALIDES")` en cas d'échec. Pour les téléversements (`formData`) : taille maximale (5 Mo pour les photos, 20 Mo pour les imports), type MIME **et** octets magiques (`src/lib/security/magic-bytes.ts`, déjà utilisé par 3 routes). Test : un corps invalide renvoie 400 sans aucun appel Prisma.

### API-6 — Jetons d'invitation dédiés *(P2, 1 j)*

Migration additive `InvitationReinscription.jeton String @unique` (32 octets aléatoires, `crypto.randomBytes(32).toString("base64url")`) et `expireLe DateTime`. Les liens envoyés utilisent le jeton ; l'`id` n'est plus accepté par les routes publiques après une période de transition de 30 jours. Test : jeton expiré → 410 ; `id` brut → 404 après la transition.

### API-7 — Un seul format d'erreur *(P2, 3 j, par lots)*

Remplacer les 167 routes à message figé par `erreurJson(code)`, en ajoutant les codes manquants dans `erreurs-api.ts` et leurs traductions fr/en/so (le test existant garantit la complétude). Supprimer les 34 `console.log` au profit du journal structuré (INF-3).

### API-8 — Extraire la logique des routes monolithiques *(P3, continu)*

Pour chaque route de plus de 300 lignes, placer la logique dans `src/lib/<domaine>/…` (fonction pure si possible, sinon service prenant `prisma` en paramètre) et laisser à la route : l'authentification, la validation, l'appel du service et la réponse. Commencer par `bulletins/generer` (combiné avec MET-1). Critère : aucune route au-delà de 200 lignes, et chaque service couvert par un test.

## 7. Définition de « terminé »

- [ ] 0 route de mutation sans contrôle de rôle testé (API-2 au vert).
- [ ] 100 % des mutations auditées ; audit consultable dans `/parametres/audit`.
- [ ] 0 corps non validé ; 0 `console.log` dans `src/app/api`.
- [ ] Annexe A régénérée : **toutes** les routes à 9,7 ou plus, avec une revue humaine signée pour chaque domaine.
