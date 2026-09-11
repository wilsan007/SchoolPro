# Étape 4 — Logique métier et workflows ERP

**Score actuel : 6,0 / 10** (brut 6,0 — sous le plafond de 7,0 imposé par les constats hauts)
**Score cible : 9,7** · **Effort estimé : 12 à 15 jours-développeur**

La chaîne « relances » est aussi affectée par le constat critique AUT-C1 (étape 5, fréquence du cron). Le défaut de la fonction elle-même est noté ici, celui de son déclencheur à l'étape 5.

---

## 1. Tableau des workflows

Les workflows reprennent la numérotation de `PLAN-CONTROLE-TOTAL.md` (W-1 à W-15). **Profondeur** : « lu » signifie que le code du workflow a été lu ligne à ligne ; « signaux » signifie que la note repose sur les tests existants, les constats transverses et la lecture des points d'entrée, sans relecture complète. Ces notes-là sont des **plafonds provisoires** : elles ne peuvent pas atteindre 9,7 sans une relecture complète.

| # | Workflow | Profondeur | Score | Constats principaux |
|---|---|---|---:|---|
| W-1 | Admissions → inscription | signaux | 8,0 | Tests d'API et E2E ; route de 633 lignes (API-M4) |
| W-2 | Réinscription de campagne | signaux | 7,5 | Tests ; jeton = cuid sans expiration (API-M2) |
| W-3 | Facturation → paiement → relance → recouvrement | lu | 4,5 | AUT-C1 + MET-H4 (relances en rafale), MET-H5 (double encaissement), montants en `Float` |
| W-4 | Évaluation → notes → bulletins → décision | lu | 5,5 | MET-H1, H2, H3, M1, M2 |
| W-5 | Appel → absences → alerte parent | lu | 5,0 | MET-H6, MET-M3 |
| W-6 | Cahier-journal → couverture → décalage | signaux | 8,0 | Gestionnaires testés ; tâches horaires répétées (AUT-C1) |
| W-7 | Emploi du temps (construction, import) | signaux | 7,5 | Tests ; 3 corps non validés ; génération automatique en 746 lignes |
| W-8 | Moteur de tâches automatiques | signaux | 7,5 | Tests ; synchronisation lancée 12 fois par heure (AUT-C1) |
| W-9 | Chaîne LEARNOS | lu | 7,5 | Voir étape 6 (corrections de notes non propagées) |
| W-10 | Bot parent | signaux | 7,0 | Intentions fermées ; webhook sans signature si le secret manque (AUT-H3) |
| W-11 | Intelligence direction | signaux | 7,0 | Assistant désactivé ; moteurs non testés (étape 6) |
| W-12 | Communication et notifications | lu (appel) | 6,0 | Deux circuits d'envoi, dont un sans préférences ni plafond (MET-H6) |
| W-13 | RH | signaux | 8,0 | Couvert par les seuils de couverture de `vitest.config.ts` |
| W-14 | Vie scolaire et santé | signaux | 6,5 | Suppressions de données de santé non auditées (API-H3) |
| W-15 | Mobile | voir étape 12 | 7,4 | |

## 2. Ce qui est solide

- **Unicité des numéros de facture** isolée dans le domaine (`src/lib/domain/facture-unicite.ts`, testée).
- **Refus du trop-perçu** au paiement (`facturation/paiement/route.ts:56-64`) et refus d'encaisser sur une facture annulée.
- **Historisation des bulletins** (`bulletin-historique.ts`) et statuts BROUILLON, VERROUILLE et PUBLIE modélisés (`schema.prisma`, modèle `Bulletin`).
- **Dispenses** : matière retirée de la moyenne et du rang, ligne conservée avec la mention « Dispensé(e) ».
- **Règles d'appréciation paramétrables** par établissement (`regleAppreciation`), avec repli par défaut.
- **Appel idempotent au niveau des lignes** : identifiant déterministe par classe, élève et date (`absences/appel/route.ts:77-95`), donc pas de doublon d'absence.
- **Domaine pur des notes déjà écrit** : `src/lib/domain/note.ts` fournit `Note`, `calculerMoyennePondereeCentiemes`, `calculerRangsCentiemes` (ex-aequo gérés) et `apprecierCentiemes`, avec tests. **Il n'est simplement pas utilisé** (MET-H1).

## 3. Constats

### MET-H1 — Haute — La règle « notes en centièmes entiers » n'est appliquée nulle part

**Preuve.** Aucun fichier de production n'importe `src/lib/domain/note.ts` : `grep -rln "lib/domain/note" src` ne renvoie que les tests. Les moyennes sont calculées en flottant dans au moins **quatre implémentations différentes** :
- `src/lib/utils.ts:47-61` (`calculerMoyenne`, `Math.round(x*100)/100`), utilisée par `bulletins/generer`, `OrientationView` et `ParentsView` ;
- `src/app/api/analytics/route.ts:162-164` ;
- `src/app/api/mobile/analytics/route.ts:110` ;
- `src/components/eleves/EleveDetailView.tsx:241` et `:519` (calcul côté client).

**Conséquences.** (1) Violation de la règle non négociable n°3 d'`AGENTS.md`. (2) La moyenne générale subit un double arrondi : moyennes de matière arrondies au centième, puis `toFixed(2)` sur le total (`bulletins/generer/route.ts:235`). (3) La moyenne affichée peut différer d'un écran à l'autre (bulletin, fiche élève, analytique, mobile) pour un même élève. Aucune source unique ne fait foi.

### MET-H2 — Haute — Régénérer réécrit le contenu des bulletins publiés ou verrouillés

**Preuve.** Le schéma documente : *« VERROUILLE (clôturé, seul admin peut modifier) | PUBLIE (publié aux parents, verrouillé) »*. Or `bulletins/generer/route.ts` :
- ligne 252 : calcule `statutInitial`… qui n'est **utilisé nulle part** (code mort) ;
- lignes 259-282 : l'`upsert` réécrit `moyenneGenerale`, `appreciation`, `heuresAbsence` et `effectifClasse`, **quel que soit le statut** ;
- ligne 291 : `bulletinMatiere.deleteMany` puis `createMany` recrée toutes les lignes matières ;
- lignes 317-326 : rang, moyenne de classe et moyenne du premier sont réécrits.

La permission requise est `bulletins:write`, que CLASS_TEACHER possède. Un professeur principal qui relance la génération après publication modifie donc en silence un bulletin déjà lu par les familles.

### MET-H3 — Haute — Rang général sans ex-aequo, incohérent avec le rang par matière

`bulletins/generer/route.ts:323` : `rang: b.moyenne !== null ? i + 1 : null`, après un tri. Deux élèves à égalité reçoivent donc les rangs 3 et 4, dans un ordre arbitraire. Le rang par matière (`:220`, `indexOf(moy) + 1`) gère, lui, l'égalité. `calculerRangsCentiemes` existe mais n'est pas appelé. Le code du domaine le dit lui-même : *« les ex aequo sont la première source de contestation d'un bulletin »*.

### MET-H4 — Haute — Les relances n'ont ni délai entre niveaux ni plafond

`src/lib/relances-auto.ts:86-124` : à chaque appel, pour chaque facture échue, la fonction crée une relance de niveau `min(nombreDeRelances + 1, 3)` et envoie un courriel. Le test `if (niveau > MAX_NIVEAU) continue;` (`:87`) ne peut jamais être vrai, à cause du `Math.min`.
- Avec un cron quotidien : relance 1 le lundi, 2 le mardi, « dernière relance avant mise en recouvrement » le mercredi, puis une relance de niveau 3 **chaque jour, sans fin**.
- Avec le cron réel (toutes les 5 minutes, AUT-C1) : **prouvé par exécution** (`C-preuves/relances-cron.test.ts`), 12 courriels en une heure, niveaux 1 → 2 → 3 en 10 minutes.
- Aucune prise en compte des échéanciers, des promesses de paiement ni des préférences de la famille. Le message est en français seulement.

### MET-H5 — Haute — Double encaissement possible

`facturation/paiement/route.ts:36-64` : le solde restant est lu **hors transaction**. La transaction (`:76-94`) insère le paiement sans relire le solde. Deux requêtes simultanées (double clic, deux guichets, réseau lent avec nouvel essai) passent donc chacune le contrôle `montant > restant` : trop-perçu et deux reçus. Il n'existe ni clé d'idempotence ni verrou (`SELECT … FOR UPDATE`).

### MET-H6 — Haute — L'appel renvoie SMS et WhatsApp à chaque enregistrement

`absences/appel/route.ts:122-215` : à **chaque** enregistrement de l'appel, pour chaque élève absent ou en retard, l'application crée une `Notification` et envoie **à la fois** SMS et WhatsApp (plus Telegram et courriel selon les coordonnées) à chaque parent lié, sans aucune déduplication. Un enseignant qui corrige son appel trois fois envoie trois séries de messages. Ces messages :
- sont en français figé, alors que le bot parent gère la langue de la famille ;
- contournent la file `AlerteParent`, et donc les préférences, le plafond et les horaires d'envoi.

### MET-H7 — Haute — Supprimer un utilisateur détruit des données financières et des comptes d'autres établissements

`src/lib/actions/parametres.ts:343-387` (`deleteUser`) supprime définitivement la ligne `User`. Par cascade (`schema.prisma`), cela supprime :
- les **remises de caisse** dont il était le caissier (`RemiseCaisse.caissier`, `onDelete: Cascade`) : des enregistrements financiers ;
- ses tâches assignées et ses mentorats ;
- ses adhésions à **tous** les établissements (`userTenant.deleteMany({ where: { userId } })`, « limite assumée » dans le commentaire). Un administrateur de l'école A peut ainsi supprimer le compte d'un parent qui a aussi des enfants dans l'école B.

### MET-M1 — Moyenne — Le nom du professeur n'apparaît pas sur les bulletins

`bulletins/generer/route.ts:200` et `:225` : `nomProfesseur: "Professeur"`, avec un TODO. Le bulletin officiel affiche « Professeur » dans chaque ligne.

### MET-M2 — Moyenne — Génération des bulletins non atomique et lente

Pour chaque élève : `findFirst`, `upsert`, historique, `deleteMany`, `createMany`, **hors transaction**. Une erreur au milieu laisse un bulletin sans lignes matières. Au rythme mesuré dans `docs/learnos-etat.md` (environ 980 ms par requête sur le pooler transaction), une classe de 40 élèves demande plus de 200 requêtes séquentielles, soit plusieurs minutes pour une seule requête HTTP.

### MET-M3 — Moyenne — Appel : justification effacée, absence fantôme, pas de créneau

`absences/appel/route.ts:74-96` :
- l'`update` de l'`upsert` remet `motif: "INJUSTIFIE"` et `statut: "EN_ATTENTE"`, ce qui **efface la justification** déposée entre-temps par la famille ou la vie scolaire ;
- un élève d'abord noté absent puis corrigé en « présent » garde son absence : seuls les non-présents sont traités ;
- l'identifiant `appel-<classe>-<élève>-<jour>` n'autorise qu'une absence par jour et par classe. Un élève absent l'après-midi seulement est impossible à distinguer d'une absence d'une journée.

### MET-B1 — Basse — Détails d'appréciation et d'heures d'absence

- `genererAppréciationDefaut` teste `if (!moyenne)` : une moyenne de 0 donne « Travail à évaluer » au lieu de « Résultats très insuffisants ».
- `calculateHours` (`bulletins/generer`) compte 4 h par défaut quand les heures de l'absence ne sont pas renseignées. C'est une règle métier implicite, à valider par l'établissement.
- Commentaires de `domain/note.ts` inexacts : `Math.round` n'est **pas** un arrondi « bancaire » en JavaScript (il arrondit vers +∞), et `depuisFlottant(9.995)` renvoie 999, pas 1000. Le test le documente correctement ; ce sont les commentaires qui sont faux.

## 4. Angles morts

1. **Aucune source de vérité des moyennes.** Ni la base (pas de colonne en centièmes), ni une fonction unique.
2. **Aucune procédure de rectification d'un bulletin publié** (motif, version, notification des familles, conservation de l'ancienne version).
3. **Aucun rapprochement de caisse automatique** entre paiements, remises de caisse et dépôts. `RemiseCaisse` existe, mais aucun contrôle ne compare les totaux.
4. **Relances et échéanciers** : un parent sous échéancier accepté reçoit-il des relances ? Aucune règle.
5. **Notifications familles** : deux circuits coexistent, `AlerteParent` (préférences, plafond, langue, horaires) et l'envoi direct (appel, relances). Rien n'impose le premier.

## 5. Notation détaillée

| Axe (poids) | Actuel | Justification | Cible |
|---|---:|---|---:|
| Sécurité (25 %) | 7 | Autorisations des flux métier traitées à l'étape 3 | 10 |
| Exactitude métier (25 %) | 5 | Moyennes flottantes et multiples, rangs, bulletins publiés réécrits | 9,5 |
| Robustesse (15 %) | 5 | Concurrence des paiements ; génération non atomique | 9,5 |
| Tests (15 %) | 6 | Paiement, facture et admissions testés ; relances, génération et appel non testés | 9,5 |
| Traçabilité (10 %) | 7 | Historique des bulletins ; relances et paiements partiellement tracés | 9,5 |
| Maintenabilité (10 %) | 6 | Domaine pur écrit mais contourné | 9,5 |
| **Brut** | **6,0** | | |

---

## 6. Cahier des charges

### MET-1 — Une seule source de vérité pour les notes, les moyennes et les rangs *(P1, 4 j)*

**Étapes.**
1. **Corriger les commentaires** de `src/lib/domain/note.ts` (lignes 12-13, 68-69 et 205-207) et **choisir explicitement** la règle d'arrondi, qui est une **décision du ministère ou de l'établissement** : « au demi-centième supérieur », ou « au plus proche, demi vers le pair ». Implémenter cette règle **en entiers** : `Math.floor((2 * somme + coef) / (2 * coef))` pour « demi supérieur » sur des valeurs positives. Écrire des tests aux bornes (x,xx5).
2. Créer `src/lib/domain/moyennes.ts`, sans Prisma :
   ```ts
   export function noteSur20EnCentiemes(valeur: number, noteMax: number): number   // via Note.depuisFlottant puis règle de trois en entiers
   export function moyenneMatiere(notes: {valeur:number; noteMax:number; coefficient:number}[]): number | null  // centièmes
   export function moyenneGenerale(matieres: {centiemes:number|null; coefficient:number; dispense:boolean}[]): number | null
   export function rangs(moyennes: Map<string, number|null>): Map<string, number|null>  // délègue à calculerRangsCentiemes
   export function formaterCentiemes(c: number | null, locale: string): string        // seule conversion vers l'affichage
   ```
3. Remplacer `calculerMoyenne` (`utils.ts`) par un réexport déprécié qui appelle `moyenneMatiere`, puis migrer les **quatre** appelants (bulletins, analytics, analytics mobile, `EleveDetailView`) et les deux composants (`OrientationView`, `ParentsView`). Côté client, **ne plus recalculer** : afficher la valeur fournie par le serveur.
4. Stockage : ajouter (migration additive) `Bulletin.moyenneGeneraleCentiemes Int?`, `BulletinMatiere.moyenneCentiemes Int?`, `Bulletin.moyenneClasseCentiemes Int?`. Les remplir à la génération, et garder les colonnes `Float` pendant la transition (règle n°5 d'AGENTS.md).
5. Test d'intégration de référence : une classe de 30 élèves, dont les notes sont tirées d'un jeu figé (`tests/fixtures/classe-reference.json`), et les moyennes et rangs attendus **calculés à la main** et validés par un enseignant. Tous les écrans doivent afficher les mêmes valeurs (test d'API bulletin, analytics, mobile).

**Critères.** `grep -rn "valeur / n.noteMax" src` ne renvoie plus rien hors `src/lib/domain`. Le cas 14,125 / 14,135 est tranché par la règle choisie et couvert par un test.

### MET-2 — Protéger les bulletins publiés et verrouillés *(P1, 1,5 j)*

1. Dans `bulletins/generer`, charger les statuts existants de la classe **avant** la boucle. Pour chaque élève : si le statut vaut `PUBLIE` ou `VERROUILLE`, **ne rien écrire**, ajouter l'élève à la liste `ignores` et le signaler dans la réponse (`{ generes, ignores: [{ eleveId, statut }] }`). L'interface affiche alors : « N bulletins publiés n'ont pas été modifiés ».
2. Créer une route distincte `POST /api/bulletins/[id]/rectifier`, réservée à TENANT_ADMIN (permission dédiée `bulletins:rectifier`), avec un motif obligatoire de 10 caractères minimum. Elle archive l'état courant (`BulletinVersion`, migration additive), régénère le bulletin, conserve le statut `PUBLIE`, publie l'événement `bulletin.rectifie` et notifie les familles via `AlerteParent`.
3. Supprimer le code mort `statutInitial` (ligne 252).

**Tests.** Une génération sur une classe contenant 3 bulletins publiés laisse ces 3 bulletins **identiques octet pour octet** (comparaison des lignes avant et après), et les autres sont régénérés. Une rectification sans motif renvoie 400 ; une rectification par un CLASS_TEACHER renvoie 403.

### MET-3 — Rangs, nom des professeurs, atomicité et performance de la génération *(P1, 2 j — à faire avec MET-1 et API-8)*

1. Rangs général et par matière via `rangs()` (ex-aequo).
2. `nomProfesseur` : retrouver l'enseignant de la matière pour la classe et l'année (`EmploiTemps` ou table d'affectation). S'il y en a plusieurs, les joindre par « / ». S'il n'y en a aucun, afficher « — », et non « Professeur ».
3. **Calcul en mémoire, écriture en une transaction par élève** : `tx.bulletin.upsert`, `tx.bulletinMatiere.deleteMany` et `createMany` dans un même `prisma.$transaction(async tx => { await applyRlsContext(tx); … })`.
4. Précharger en **une** requête chaque type de données (notes, absences, dispenses, règles, bulletins existants), comme c'est déjà partiellement fait. Objectif : moins de 5 + 3 × N requêtes au total.
5. Supprimer les `console.log("[generer] step …")`.
6. Appréciation : `if (moyenne === null)`, et non `!moyenne`.

**Critère de performance.** Classe de 40 élèves générée en moins de 15 s sur l'environnement de préproduction (mesure consignée dans `docs/TESTS/`).

### MET-4 — Relances : une par palier, espacées, via la file des familles *(P0, 1,5 j — à livrer avec AUT-1)*

1. Paramètres par établissement (migration `Tenant.relancesConfig Json?`, avec valeur par défaut) : `delaisJours: [7, 15, 30]` après l'échéance pour les niveaux 1, 2 et 3 ; `aucuneApresNiveau3: true`.
2. Dans `envoyerRelancesAutomatiques` :
   - le niveau dû se calcule à partir de `joursDeRetard = (maintenant − echeance)` et des délais, **pas** du nombre de relances déjà envoyées ;
   - on n'envoie que si aucune relance de ce niveau n'existe pour la facture ;
   - on ajoute `@@unique([factureId, niveau])` sur `Relance` (migration additive, après dédoublonnage des lignes existantes par script) et on crée avec `createMany({ skipDuplicates: true })` : l'idempotence est garantie par la base, même en cas d'exécutions concurrentes ;
   - on n'envoie rien si la facture a un échéancier actif et à jour (`Echeancier`/`EcheancePaiement`) ;
   - on supprime la condition morte `niveau > MAX_NIVEAU`.
3. Envoi : passer par la file d'alertes des familles (`AlerteParent` ou une file équivalente pour la facturation), afin d'hériter de la langue, des préférences, du plafond et des horaires. Les textes vont dans les fichiers de traduction (clés `facturation.relances.niveau1…3`).
4. **Nettoyage des dégâts** : script `scripts/relances-audit.mjs` (lecture seule) qui liste les factures ayant reçu plus d'une relance du même niveau ou plus d'une relance par jour depuis le 09/09. Ce qu'on en fait (message d'excuse aux familles, suppression des relances en double) relève d'une **décision de la direction**.

**Tests** (`src/lib/relances-auto.test.ts`, en repartant de `C-preuves/relances-cron.test.ts`) :

| Cas | Attendu |
|---|---|
| 12 passages dans la même heure | 1 relance au plus |
| J+6, J+7, J+14, J+15, J+30, J+31 | niveaux 0, 1, 1, 2, 3, 3 (aucun doublon) |
| Facture payée entre deux passages | aucune relance |
| Échéancier à jour | aucune relance |
| Deux exécutions concurrentes (`Promise.all`) | une seule relance créée |

### MET-5 — Encaissement sûr *(P1, 1 j)*

1. Accepter un en-tête `Idempotency-Key` (UUID généré par le client à l'ouverture du formulaire). Migration additive `Paiement.cleIdempotence String? @unique`. Une clé déjà vue renvoie le paiement existant (200) sans en créer de nouveau.
2. Faire, **dans la transaction**, `SELECT … FOR UPDATE` sur la facture (`tx.$queryRaw\`SELECT id FROM factures WHERE id = ${factureId} AND "tenantId" = ${tenantId} FOR UPDATE\``), puis relire la somme des paiements, puis contrôler le solde, puis insérer. Le calcul du statut se fait après l'insertion, à l'intérieur de la transaction.
3. Désactiver le bouton côté client pendant l'envoi (confort ; ce n'est pas un contrôle de sécurité).

**Tests.** Deux paiements simultanés de 30 000 sur une facture de 50 000 : un seul réussit, l'autre reçoit 400 (« solde restant 20 000 »). Même clé d'idempotence rejouée : une seule ligne.

### MET-6 — Appel : notifications uniques et justification préservée *(P1, 2 j)*

1. L'`update` de l'`upsert` ne modifie **que** `isRetard`, et seulement si le statut est encore `EN_ATTENTE` et le motif `INJUSTIFIE`. Une absence justifiée n'est jamais rétrogradée.
2. Les élèves passés de « absent » à « présent » : supprimer l'absence si elle est `EN_ATTENTE` et non justifiée, **publier un événement `absence.annulee`** (nouveau type, avec son gestionnaire LEARNOS qui retire la preuve), et journaliser.
3. Notifications : remplacer l'envoi direct par l'insertion d'une `AlerteParent` avec une **empreinte** `absence-<eleveId>-<date>-<statut>` et `skipDuplicates`. L'envoi effectif passe par `envoyerAlertesEnAttente`, qui respecte le canal préféré (**un seul** canal, SMS **ou** WhatsApp), la langue et les horaires. Un nouvel enregistrement de l'appel ne crée donc aucune nouvelle notification.
4. Créneau horaire : **décision produit**. Soit l'appel par séance (`seancePedagogiqueId` dans l'identifiant), soit par demi-journée (`matin`/`après-midi`). Tant que la décision n'est pas prise, documenter la limite dans l'interface.

**Tests.** Appel enregistré 3 fois → 1 notification par parent. Justification déposée, puis appel réenregistré → la justification est conservée. Élève corrigé en présent → absence supprimée et événement publié.

### MET-7 — Suppression d'utilisateur réversible et limitée au tenant *(P1, 1,5 j)*

1. Remplacer `deleteUser` par une **désactivation dans le tenant** : `UserTenant.isActive = false` pour le tenant appelant, `sessionVersion++` (AUTH-2), audit. La ligne `User` n'est jamais supprimée depuis un tenant.
2. Suppression définitive réservée à SUPER_ADMIN, par une procédure distincte (voir DON-3), après vérification que l'utilisateur n'a plus aucune adhésion active **et** qu'aucune donnée financière ne dépend de lui.
3. Migration additive : `RemiseCaisse.caissier` passe à `onDelete: Restrict` (précédé d'une vérification qu'aucune ligne orpheline n'existe) ; `Tache.assigneeA` passe à `onDelete: SetNull`.

**Tests.** Un administrateur de A « supprime » un parent présent aussi dans B : le parent ne peut plus se connecter à A, mais peut toujours se connecter à B. Les remises de caisse du caissier désactivé restent intactes.

## 7. Définition de « terminé »

- [ ] MET-1 à MET-7 livrés, avec leurs tests.
- [ ] Jeu de référence « classe de 30 élèves » validé par un enseignant et utilisé en CI.
- [ ] Recette avec la direction de l'école pilote : un bulletin publié, une rectification, une relance de chaque niveau, un double encaissement tenté.
- [ ] Workflows W-1, W-2, W-6, W-7, W-8, W-10, W-11, W-13 et W-14 **relus ligne à ligne** (profondeur « lu »), avec leurs constats ajoutés à ce document.
