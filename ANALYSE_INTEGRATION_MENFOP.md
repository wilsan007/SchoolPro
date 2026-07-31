# Analyse des captures MENFOP — Intégration dans EcolPro

Les 5 captures montrent le module **Examen / Vie scolaire** d'une plateforme concurrente (MENFOP). Voici ce que chaque écran représente, et comment cela se compare/s'intègre à ce qui existe déjà dans EcolPro (`prisma/schema.prisma`, `src/app/api/bulletins/`, `src/app/api/notes/`, `src/app/api/examens/`, `src/components/bulletins/`).

---

## Image 1 — "Résultats annuels des examens"

Tableau matriciel **classe entière** (une ligne = un élève) avec :
- Colonnes = chaque matière (EPS, Maths, Arabe, Français, SVT, Anglais, Informatique, EMCI, DC Métiers, HG, Art, Physique-Chimie)
- Puis Trimestre 1 / Trimestre 2 / Trimestre 3, Résultat total, Nombre de matières, **Moyenne Annuelle**, Absences Annuelle, Décision, Appréciation globale
- Filtres : Niveau → Classe → Période, bouton **Excel** et **Imprimer**

**Statut EcolPro :** Nous avons déjà toutes les données sous-jacentes (`Bulletin`, `BulletinMatiere`, moyennes/rang/décision par période — voir `bulletin-generator.ts` et `generer/route.ts`), mais **pas de vue matricielle classe × matières × trimestres**, et **pas de calcul de moyenne annuelle** agrégeant les 3 périodes. Le `Bulletin` actuel est scopé par `periodeId` uniquement (unique `[eleveId, periodeId]`), il n'y a pas de "bulletin annuel" consolidé.
**Pas d'export Excel** actuellement (recherche confirmée : aucune lib xlsx dans le module examens/bulletins).

## Image 2 — "Rapport général d'examen de classe"

Même tableau matriciel mais **par période** (pas annuel), avec une colonne **Statut** (Active/Inactive de l'élève) et une colonne **Absences & Conduite** distincte de l'appréciation globale.

**Statut EcolPro :** Équivalent conceptuel à une vue "classe" de `ConseilDeClasse.tsx`, mais celui-ci est présenté en liste verticale (une carte par élève), pas en tableau/grille exportable Excel.

## Image 3 & 4 — "Bulletin de notes" (trimestriel) et "Bulletin de notes annuel"

Bulletin individuel avec en-tête établissement (tél, email, logo), infos élève, tableau matière/enseignant/nb notes/**rang**/moyenne élève/moyenne classe/appréciation.
La version **annuelle** (image 4) ajoute :
- Ligne "Moyenne Générale" avec rang annuel
- Bloc Absences par trimestre (T1/T2/T3) + absence annuelle + position élève
- Moyennes par trimestre (Moy T1, T2, T3) + Moyenne Générale Annuelle
- Bloc "Appréciation du conseil de classe" + Décision + **Signature & Cachet**

**Statut EcolPro :** Le bulletin trimestriel existe déjà et est **plus complet** sur certains points (génération PDF via `bulletin-generator.ts`, `BulletinPreview.tsx`, moyenne classe/premier de classe, décision conseil). **Ce qui manque** :
1. Le **bulletin annuel consolidé** (agrégation des 3 bulletins trimestriels par matière + moyenne générale annuelle + rang annuel)
2. Un bloc **signature & cachet** numérique/scanné sur le PDF exporté

## Image 5 — "Configuration des appréciations" › onglet "Appréciations absences"

Interface de **paramétrage de règles** : plages horaires (De/À en heures d'absence) → libellé d'appréciation auto-généré ("Attention aux absences !", "Avertissement pour absence", "Blâmes pour les absences", "S'exclu lui-même"). Modifiable/supprimable via CRUD. Les onglets voisins visibles dans la barre : *Appréciation des profs*, *Appréciations des périodes*, *Appréciations annuelles*, **Appréciations absences**, *Prolonger la saisie des notes*, *Signature*, *Clôture des périodes*.

**Statut EcolPro :** Notre génération d'appréciation (`genererAppréciation()` dans `src/app/api/bulletins/generer/route.ts`) est **codée en dur** dans le code (seuils de moyenne fixes, aucune règle sur les absences, non éditable sans redéploiement). Il n'existe **aucune UI de configuration des règles d'appréciation**, ni de gestion de **clôture de période** (verrouillage de la saisie), ni de **prolongation de délai de saisie des notes**, ni de **signature électronique du principal** — confirmé par recherche dans le code (`excel`, `cloture`, `signature`, `prolonger` : 0 résultat pertinent dans le module examens).

---

## Synthèse — Ce qui peut/doit être intégré à EcolPro

| Fonctionnalité MENFOP | Existe déjà ? | Effort d'intégration |
|---|---|---|
| Bulletin trimestriel individuel (PDF) | ✅ Oui, déjà supérieur (moyenne classe, 1er de classe) | — |
| Conseil de classe (décision/appréciation) | ✅ Oui (`ConseilDeClasse.tsx`) | — |
| **Vue matricielle classe (tableau élèves × matières)** | ❌ Non | Moyen — nouvelle page/API agrégeant `BulletinMatiere` par classe+période, format tableau |
| **Export Excel** des résultats | ❌ Non | Faible — lib `exceljs` déjà utilisée ailleurs dans le projet (skill `xlsx_document_skills` dispo), à brancher sur la vue matricielle |
| **Bulletin annuel consolidé** (3 trimestres + moyenne annuelle + rang annuel) | ❌ Non | Moyen — agréger les 3 `Bulletin` d'une année scolaire par élève, nouveau template PDF |
| **Configuration des règles d'appréciation** (par moyenne ET par absences) | ❌ Non (codé en dur) | Moyen — nouveau modèle Prisma `ReglesAppreciation` (type: NOTE\|ABSENCE, seuilMin, seuilMax, libelle) + UI CRUD dans Paramètres |
| **Clôture de période** (verrouillage saisie notes) | ❌ Non | Moyen — champ `statut`/`cloturedAt` sur `Periode`, vérification dans `src/app/api/notes/route.ts` |
| **Prolongation de la saisie des notes** | ❌ Non | Faible — champ `dateLimiteSaisie` par classe/matière/période + override ponctuel |
| **Signature & cachet** sur bulletin PDF | ❌ Non | Faible — champ `signatureUrl`/`cachetUrl` sur `Tenant`, injecté dans le template PDF |

## Recommandation de priorité

1. **Vue matricielle "Rapport de classe" + Export Excel** — forte valeur perçue, réutilise 100% des données existantes (`Bulletin`, `BulletinMatiere`), pas de nouveau modèle Prisma nécessaire.
2. **Bulletin annuel consolidé** — complète naturellement le cycle trimestriel déjà en place.
3. **Configuration des règles d'appréciation** — remplace le code en dur, donne de l'autonomie aux directeurs (pas besoin de nous pour changer un seuil).
4. **Clôture de période / prolongation de saisie / signature** — fonctionnalités de gouvernance/administration, utiles mais moins urgentes que 1-3.

---

## Suite — Nouvelles captures (module "Gestion de notes" complet + navigation)

### Image 1 & 4 — Onglets du module "Gestion de notes"

Barre d'onglets : **Période scolaire** · Saisie de notes · Créer un devoir · Bulletins des notes · Dispense matière · Importations des notes · Clôture de l'examen.

L'onglet **"Période scolaire"** affiche en fait une config de **"Genre d'épreuve"** : tableau NOM / TEMPS DE DÉBUT / TEMPS DE FIN / **DANS LE DERNIER** (Oui/Non) / Actions — avec les 3 trimestres et un flag indiquant lequel est la période courante/dernière.

**Statut EcolPro :**
- Équivalent du modèle `Periode` (`dateDebut`, `dateFin`, `isCurrent`) → **déjà couvert**, juste pas exposé sous cette UI précise (tableau éditable avec CRUD dédié dans le module Examens plutôt que dans Paramètres).
- **"Saisie de notes"** → couvert par `src/app/api/notes/route.ts` + composants de saisie.
- **"Créer un devoir"** → couvert par le modèle `Evaluation`.
- **"Bulletins des notes"** → couvert par `BulletinsManager.tsx`.
- **"Dispense matière"** (exempter un élève d'une matière, ex. EPS pour raison médicale) → ❌ **absent**. Aucun champ d'exemption sur `Note`/`Eleve`/`Matiere`. À prévoir : table `DispenseMatiere` (eleveId, matiereId, periodeId, motif) excluant l'élève du calcul de moyenne pour cette matière.
- **"Importations des notes"** (import Excel/CSV en masse) → ❌ **absent** (confirmé, 0 résultat pour import de notes dans le code). Fonctionnalité à forte valeur pour les enseignants qui ont déjà leurs notes sur Excel.
- **"Clôture de l'examen"** → ❌ **absent**, rejoint le point clôture de période déjà identifié.

### Image 2 — Arborescence de navigation complète du module Examen

Confirme la structure : Gestion de notes, **Résultats d'Admission**, Configuration des appréciations, Fiche de conseil de classe, Rapport conseil classe annuelle, **Résultats BEF**, Bulletin de notes, Bulletin de notes annuel.

**Statut EcolPro :**
- "Résultats d'Admission" ici concerne les **résultats d'un examen national/certificatif** (admis/recalé), **pas** notre module `Admissions` actuel qui gère les candidatures d'inscription des nouveaux élèves — ce sont deux concepts différents portant un nom proche. ❌ Absent.
- "Résultats BEF" (Brevet d'Études Fondamentales — examen national djiboutien) → ❌ Absent. Nécessiterait un module spécifique de gestion des résultats d'examens **nationaux/certificatifs** distinct des évaluations internes (import de résultats officiels par élève, mention/décision).

### Image 3 — "Changement de classe d'un élève"

Sous "La liste des élèves", interface de **transfert d'un élève d'une classe à une autre** au sein du même niveau ou non : sélection niveau → classe source → classe destination, listes à double panneau avec boutons `»` / `«` pour déplacer les élèves sélectionnés.

**Statut EcolPro :** ❌ **Absent** — aucune fonctionnalité de changement de classe en masse trouvée (recherche "changement de classe"/"transfert" : 0 résultat pertinent). Actuellement, changer la classe d'un élève nécessite probablement une édition individuelle de sa fiche. Cette UI en double-liste est un gain de productivité clair pour les directeurs en début d'année scolaire (répartition des effectifs).

### Image 5 — "Configuration des appréciations" › données réelles de l'onglet "Appréciation des profs"

Confirme et précise la structure déjà supposée : tableau NOM / **À PARTIR DE MARQUES** / **POUR LES MARQUES** / Actions, ex. :
- INEXISTANT : 0 → 0.99
- RESULTATS CATASTROPHIQUES : 1 → 5.99
- RESULTATS TRES INSUFFISANTS, DOIT TRAVAILLER DAVANTAGE : 6 → 7.99
- RESULTATS INSUFFISANTS, DOIT TRAVAILLER DAVANTAGE : 8 → 9.99
- RESULTATS MOYENS : 10 → 10.99
- …

C'est exactement une **table de règles seuil→libellé**, identique par structure à ce que `genererAppréciation()` fait en dur dans `src/app/api/bulletins/generer/route.ts` (actuellement seuils 18/16/14/12/10/8 fixes en JS). Les autres onglets (Appréciations des périodes, Appréciations annuelles, Appréciations absences, Prolonger la saisie des notes, Signature, Clôture des périodes) sont chacun une variante du même besoin : une règle de seuils différente selon le contexte (note de matière vs bulletin de période vs bulletin annuel vs heures d'absence).

**Statut EcolPro :** ❌ Confirmé absent — recommandation inchangée : un modèle Prisma unique `ReglesAppreciation` avec un champ `contexte` (enum: NOTE_MATIERE, BULLETIN_PERIODE, BULLETIN_ANNUEL, ABSENCE) + `seuilMin`, `seuilMax`, `libelle`, réutilisable pour tous ces onglets via une seule UI paramétrable (avec un sélecteur de contexte en haut).

---

## Synthèse mise à jour — Fonctionnalités totalement absentes d'EcolPro

| Fonctionnalité | Où dans MENFOP | Effort |
|---|---|---|
| Dispense matière (exemption élève/matière) | Gestion de notes | Faible — 1 table + filtre dans calcul moyenne |
| Import de notes en masse (Excel/CSV) | Gestion de notes | Moyen — parsing + mapping colonnes/élèves |
| Clôture d'examen / de période (verrouillage saisie) | Gestion de notes + Config appréciations | Moyen |
| Résultats d'examen national (BEF, etc.) | Examen | Élevé — nouveau module de résultats certificatifs |
| Résultats d'Admission (examen national admis/recalé) | Examen | Élevé — lié au point précédent |
| Changement de classe en masse (double liste) | La liste des élèves | Faible/Moyen — UI + endpoint bulk update `classeId` |
| Règles d'appréciation configurables (multi-contextes) | Configuration des appréciations | Moyen — 1 modèle générique + UI |
| Signature électronique sur bulletins | Configuration des appréciations | Faible |
| Prolongation de la saisie des notes | Configuration des appréciations | Faible |

---

## Suite (3e lot) — Module "La liste des élèves" (gestion administrative des élèves)

Ces captures détaillent le sous-menu **La liste des élèves** : *Gestion des élèves · Générer les utilisateurs des élèves · Élève transféré · Cartes scolaire · Changement de classe d'un élève*.

### Image — "Gestion les Élèves" (liste principale)

Tableau paginé des élèves : ID / NOM / SEX / NIVEAU / DATE DE NAISSANCE / STATUS / ANNÉE SCOLAIRE / Actions (éditer + voir). Filtres Niveau → Classe → Nationalité → Statut. Boutons d'action de tête : **élèves inactifs**, **Class Info**, **Importe images élèves**, **Excel**, **Imprimer**, **Imprimer feuille présence**, plus recherche + sélecteur de colonnes + Export.

**Statut EcolPro :**
- Liste + filtres + fiche élève → **couvert** (modèle `Eleve`, pages `(dashboard)` liste élèves).
- Photo élève → **couvert unitairement** (`src/app/api/eleves/upload-photo/route.ts`, champ `Eleve.photoUrl`), mais **"Importe images élèves" en masse** (upload groupé associant chaque photo au matricule) → ❌ **absent**.
- **"Imprimer feuille présence"** (génération d'une feuille d'appel vierge à imprimer, classe × dates) → ❌ absent. EcolPro fait l'appel **en ligne** (`AppelInterface.tsx`, `api/absences/appel`), mais **pas d'export/impression d'une feuille de présence papier**.
- **"élèves inactifs"** (filtre archivés) → partiellement couvert via `StatutAbsence`/statut, à confirmer côté `Eleve`.
- Export Excel de la liste → ❌ absent (même constat que le module notes : pas de lib xlsx branchée).

### Image — "Générer des utilisateurs" (comptes de connexion élèves en masse)

Formulaire : Titre → **Type d'utilisateur** (Student) → Rôles → **Mot de passe personnalisé** (toggle) → **Appliquer**. Génère en lot un tableau matricule / Nom complet / Titre / classe-niveau / **Nom d'utilisateur** / **Mot de passe** pour toute une classe.

**Statut EcolPro :** ❌ **Absent**. EcolPro a bien l'authentification (`User`, `password` bcrypt, rôles), mais **aucune UI de génération en masse d'identifiants élèves** (création automatique username + mot de passe pour toute une classe, avec impression des accès). C'est une fonctionnalité clé pour ouvrir un espace élève/parent en début d'année. Effort : **Moyen** — endpoint bulk créant les `User` liés aux `Eleve` d'une classe + génération username/mot de passe + export imprimable.

### Image — "Changement de classe d'un élève" (rappel, vue réelle)

Confirme l'écran déjà analysé (2e lot, Image 3) : double panneau De la classe → à la classe, boutons `»` / `«`. **Statut : ❌ absent** (confirmé, 0 résultat pour "changement de classe"/"transfert" dans le code).

> À noter aussi dans ce menu : **"Élève transféré"** (gestion des élèves transférés vers/depuis un autre établissement — différent du changement de classe interne) et **"Cartes scolaire"** (génération de cartes d'élève imprimables) → tous deux ❌ absents d'EcolPro.

---

## Suite (4e lot) — Module "Vie scolaire" complet + navigation principale

Le sous-menu **Vie scolaire** de MENFOP est éclaté en 9 entrées dédiées : *Attestation scolaire · Convocation des parents · Suivi des absences · Dispositif socialisation · Violence des élèves · Insolence de l'élève · Exclusion des élèves · Dégradation infrastructures · Notification de l'inspecteur VS*.

La navigation principale confirme aussi les grands modules : Vie scolaire, La liste des élèves, Enseignant, Examen, Promotions, **Orientation**, Parents, Administration, **Finance/Gestionnaire**, **inventaire**, **Dépenses**.

### Image — "Attestation scolaire" (Certificat de scolarité)

Formulaire : Honorifique (Monsieur…) → **Chef d'établissement** → Titre (CPE) → Niveaux → Classe → Élève → **Imprimer**. Génère un **Certificat de Scolarité officiel** (en-tête établissement tél/email, "Je soussigné … certifie que l'élève [matricule, nom, né(e) le, à], poursuit ses études en classe de …, année scolaire …, fait à … le …", + signature/fonction du chef d'établissement).

**Statut EcolPro :** ❌ **Absent** — aucun générateur d'attestation/certificat trouvé dans le code. EcolPro possède l'infrastructure PDF (`bulletin-generator.ts`) et toutes les données nécessaires (`Eleve`, `Classe`, `AnneesScolaires`, `Tenant`), donc l'effort est **Faible** : un template PDF paramétrable + choix du signataire. À forte valeur (document réclamé en permanence par les familles).

### Image — "Convocation des parents"

Formulaire : Niveaux → Classe → Élève → **Responsables** (parent) → Date → heure → **Imprimer**, avec choix du **motif** dans une liste : Violence scolaire, Dégradation des biens communs, Insolence envers un adulte, Exclusion de la classe. Produit une **convocation imprimable** adressée au responsable légal.

**Statut EcolPro :** ⚠️ **Partiel**. `CONVOCATION_PARENTS` existe uniquement comme **type de `Sanction`** rattaché à un `Incident` — il n'y a **pas de génération de document de convocation imprimable** (date/heure de RDV, motif, destinataire parent). Effort : **Faible** — réutiliser `Incident`/`Sanction` + relation `Parent`/`EleveParent` déjà présentes, ajouter un template PDF de convocation + champ date/heure de rendez-vous.

### Vie scolaire — comparaison structurelle discipline

MENFOP crée **une page par type d'incident** (Violence, Insolence, Exclusion, Dégradation infrastructures…), chacune avec ses colonnes métier (ex. Violence : *L'agresseur · Forme d'agression · Cause · Dommage corporel · Moyens de résolution · Date*).

EcolPro fait l'inverse : **un seul écran** `VieScolaireView.tsx` + modèle `Incident` générique avec un enum `TypeIncident` (`INSOLENCE`, `BAGARRE`, `VANDALISM`, `RETARD`, `TRICHE`, `ABSENTEISME`, `AUTRE`) et un enum `TypeSanction`.

| Entrée MENFOP | Équivalent EcolPro | Statut |
|---|---|---|
| Violence des élèves | `Incident type=BAGARRE` | ✅ Donnée couverte, ⚠️ pas de champs dédiés (agresseur/victime, dommage corporel, moyens de résolution) |
| Insolence de l'élève | `Incident type=INSOLENCE` | ✅ Couvert (générique) |
| Exclusion des élèves | `Sanction type=EXCLUSION_TEMP/COURS` | ✅ Couvert |
| Dégradation infrastructures | `Incident type=VANDALISM` | ✅ Couvert (générique) |
| Suivi des absences | `Absence` + `AppelInterface` | ✅ **Couvert et plus riche** (appel en ligne, motifs, statuts) |
| Attestation scolaire | — | ❌ Absent |
| Convocation des parents | `Sanction type=CONVOCATION_PARENTS` (donnée seule) | ⚠️ Pas de document imprimable |
| Dispositif socialisation | — | ❌ Absent (suivi éducatif/médiation) |
| Notification de l'inspecteur VS | `Notification` (générique) | ⚠️ Pas de workflow dédié inspecteur vie scolaire |

**Analyse de fond :** l'approche EcolPro (1 modèle générique + enums) est **techniquement plus saine et plus extensible** que les 9 tables/pages séparées de MENFOP. Le vrai écart n'est donc **pas le modèle de données** mais :
1. La **richesse des champs métier** par type d'incident (pour "Violence" : agresseur/victime, forme, dommage corporel, moyen de résolution) — actuellement `Incident.description` est un texte libre.
2. Les **documents imprimables** (attestation, convocation, notification inspecteur) qui n'existent pas côté EcolPro.

---

## Synthèse finale consolidée (4 lots) — Vraie comparaison EcolPro ↔ MENFOP

### A. Ce qu'EcolPro fait DÉJÀ (souvent mieux)
- Bulletin trimestriel PDF avec moyenne de classe, rang, 1er de classe (MENFOP ne montre pas la moyenne de classe comparative aussi clairement).
- Conseil de classe (décision + appréciation).
- Suivi des absences **en ligne** (appel numérique, motifs, notifications) — plus moderne que la feuille papier MENFOP.
- Discipline sur modèle générique extensible (`Incident`/`Sanction`).
- Modules **absents chez MENFOP (ou non montrés)** mais présents chez EcolPro : Facturation/Paiements, Paie (`BulletinPaie`, `FicheRH`), Inventaire, Emploi du temps, Messagerie/Conversations, App mobile, Alumni, RH enseignants multi-sites.

### B. Écarts RÉELS à combler (priorisés par ratio valeur/effort)

| # | Fonctionnalité manquante | Effort | Valeur | Priorité |
|---|---|---|---|---|
| 1 | **Attestation / Certificat de scolarité** (PDF) | Faible | Très forte (demande quotidienne) | 🔴 P1 |
| 2 | **Vue matricielle "Rapport de classe" + Export Excel** | Moyen | Très forte | 🔴 P1 |
| 3 | **Génération en masse des comptes élèves** (username/mdp imprimables) | Moyen | Forte (ouverture espace élève/parent) | 🔴 P1 |
| 4 | **Convocation des parents** (document imprimable + RDV) | Faible | Forte | 🟠 P2 |
| 5 | **Bulletin annuel consolidé** (3 trimestres + moyenne/rang annuels) | Moyen | Forte | 🟠 P2 |
| 6 | **Changement de classe en masse** (double-liste) | Faible/Moyen | Forte (rentrée) | 🟠 P2 |
| 7 | **Feuille de présence imprimable** + **import photos en masse** | Faible | Moyenne | 🟠 P2 |
| 8 | **Règles d'appréciation configurables** (multi-contextes, note & absences) | Moyen | Moyenne (autonomie directeurs) | 🟡 P3 |
| 9 | **Clôture / prolongation de saisie des notes** + **signature électronique** | Faible/Moyen | Moyenne (gouvernance) | 🟡 P3 |
| 10 | **Champs métier détaillés par type d'incident** (violence : agresseur/victime, dommage…) | Faible | Moyenne | 🟡 P3 |
| 11 | **Dispense de matière** (exemption élève/matière) | Faible | Moyenne | 🟡 P3 |
| 12 | **Import de notes en masse** (Excel/CSV) | Moyen | Forte (enseignants) | 🟡 P3 |
| 13 | **Cartes scolaires** imprimables + **Élève transféré** (inter-établissement) | Moyen | Moyenne | 🟢 P4 |
| 14 | **Résultats d'examens nationaux** (BEF, Admission certificative) | Élevé | Contexte Djibouti | 🟢 P4 |
| 15 | **Dispositif de socialisation** + **Notification inspecteur VS** | Moyen | Faible/Contexte | 🟢 P4 |

**Recommandation stratégique :** commencer par les 3 items P1 (attestation, rapport de classe + Excel, comptes élèves en masse) — ils réutilisent l'infrastructure existante (PDF, données `Bulletin`/`Eleve`), demandent peu de nouveaux modèles Prisma, et répondent aux usages **quotidiens** d'un établissement djiboutien — ce sont eux qui feront percevoir EcolPro comme « au moins équivalent à MENFOP » lors d'une démonstration.

---

# PLAN D'IMPLÉMENTATION DÉTAILLÉ

> **Principe directeur :** on garde 100 % du design existant (couleurs Tailwind, composants `src/components/ui/`, `Header`, layout `(dashboard)`). On **améliore** les pages existantes et on **crée** les manquantes en réutilisant ces mêmes briques. Aucune refonte visuelle.

> **Correction préalable importante :** ❗ contrairement à une note antérieure de ce document, **aucune librairie d'export n'est installée** (`exceljs`/`xlsx`/`papaparse` absents de `package.json`). L'export Excel est donc une **dépendance nouvelle à ajouter**, pas un simple branchement.

> **Rappel :** la route `src/app/api/bulletins/annuel/route.ts` **existe déjà** (moyenne + rang annuels + décision) → le bulletin annuel est à **finir** (UI + PDF), pas à créer.

## Phase 0 — Fondations transverses (à faire en premier, sert partout)

### 0.1 Bilingue FR/EN (i18n)
- **Lib :** `next-intl` (compatible App Router Next.js, la version du projet).
- **Étapes :**
  1. `npm i next-intl`
  2. Créer `src/i18n/` avec `fr.json` et `en.json` (dictionnaires de traduction).
  3. Wrapper `NextIntlClientProvider` dans `src/app/(dashboard)/layout.tsx`.
  4. Ajouter un **sélecteur de langue** dans `src/components/layout/Header.tsx` (comme le "FR ▾" de MENFOP), stockant le choix dans un cookie `NEXT_LOCALE`.
  5. Persister la préférence par utilisateur : champ `locale String? @default("fr")` sur `model User`.
- **Migration du texte :** remplacer progressivement les chaînes en dur par `t("clé")`. Commencer par le layout + les nouvelles pages P1, puis étendre. **Gros chantier** → le mener en continu, pas en bloquant les features.
- **Fichiers touchés :** `layout.tsx`, `Header.tsx`, `schema.prisma` (`User.locale`), + création `src/i18n/*`.

### 0.2 Helper d'export/import réutilisable
- **Libs :** `npm i exceljs papaparse` (+ `@types/papaparse`).
- **Créer `src/lib/export.ts`** : `exportToExcel(rows, columns, filename)`, `exportToCsv(...)`, `exportToPdf(...)` (réutilise le moteur PDF de `bulletin-generator.ts`).
- **Créer `src/lib/import.ts`** : `parseSheet(file)` → lignes typées + mapping de colonnes.
- **Créer un composant UI `src/components/ui/ExportMenu.tsx`** (bouton "Export ▾" : Excel / CSV / PDF) branchable sur n'importe quelle table, dans le style des `Button` existants.

### 0.3 Nouveaux modèles Prisma (une seule migration)
```prisma
model ReglesAppreciation {
  id        String   @id @default(cuid())
  tenantId  String
  contexte  ContexteAppreciation   // NOTE_MATIERE | BULLETIN_PERIODE | BULLETIN_ANNUEL | ABSENCE
  seuilMin  Float
  seuilMax  Float
  libelle   String
  ordre     Int      @default(0)
  @@index([tenantId, contexte])
}
enum ContexteAppreciation { NOTE_MATIERE BULLETIN_PERIODE BULLETIN_ANNUEL ABSENCE }

model DispenseMatiere {
  id        String  @id @default(cuid())
  tenantId  String
  eleveId   String
  matiereId String
  periodeId String?
  motif     String?
  @@unique([eleveId, matiereId, periodeId])
}
```
- Ajouts de champs : `Tenant.signatureUrl`, `Tenant.cachetUrl`, `Tenant.chefEtablissement` ; `Periode.statut` (OUVERTE|CLOTUREE) + `Periode.cloturedAt` + `Periode.dateLimiteSaisie` ; `User.locale`.
- **1 seule migration** `migration_menfop_features.sql`.

#### ✅ Correctif appliqué — relation `User ↔ Eleve` (débloque la Phase 1.3)
Vérification faite dans `schema.prisma` : **aucune relation directe n'existait** entre `User` et `Eleve` (le rôle `STUDENT` existait dans l'enum mais n'était relié à rien). Corrigé :
```prisma
// model Eleve
userId String? @unique
user   User?   @relation(fields: [userId], references: [id])
// model User
eleve  Eleve?
```
- **Optionnel** (`String?`) : tous les élèves n'ont pas forcément un compte.
- **`@unique`** : 1 compte = 1 élève.
- **`ON DELETE SET NULL`** : supprimer un compte ne supprime pas l'élève (historique scolaire conservé).
- Migration SQL dédiée : **`migration_eleve_user.sql`** (idempotente). Schéma revalidé + `prisma generate` OK.

---

## Phase 1 — Priorités P1 (valeur/effort optimal)

### 1.1 Attestation / Certificat de scolarité  🆕 CRÉER
- **Page :** `src/app/(dashboard)/eleves/attestations/page.tsx` (+ composant `src/components/eleves/AttestationForm.tsx`).
- **UI :** Honorifique · Chef d'établissement (depuis `Tenant`) · Titre · Niveau → Classe → Élève · bouton **Imprimer** — mêmes `Select`/`Button` que le reste.
- **PDF :** nouveau template dans `src/lib/attestation-generator.ts` (calqué sur `bulletin-generator.ts`), avec en-tête `Tenant` (tél/email/logo) + signature.
- **Données :** 100 % existantes (`Eleve`, `Classe`, `AnneesScolaires`, `Tenant`). **Aucun nouveau modèle.**

### 1.2 Rapport de classe matriciel + Export Excel  🔧 AMÉLIORER
- **Rattacher à l'existant :** nouvel onglet dans `src/components/examens/ExamensManager.tsx` **ou** nouvelle page `src/app/(dashboard)/examens/rapport-classe/page.tsx`.
- **API :** `src/app/api/bulletins/rapport-classe/route.ts` — agrège `BulletinMatiere` par `classeId + periodeId` en tableau (élèves × matières × T1/T2/T3 + moyenne + rang + décision).
- **UI :** `src/components/examens/RapportClasseTable.tsx` (grille scrollable horizontalement) + `ExportMenu` (Phase 0.2).
- **Aucun nouveau modèle Prisma.**

### 1.3 Génération des comptes élèves en masse  🆕 CRÉER
- **Page :** `src/app/(dashboard)/eleves/comptes/page.tsx` (+ `GenerationComptesForm.tsx`).
- **API :** `src/app/api/eleves/generer-comptes/route.ts` — pour une classe : crée/associe un `User` (role `STUDENT`) par `Eleve` via `Eleve.userId`, username = matricule ou nom.prénom, mot de passe aléatoire hashé bcrypt, option "mot de passe personnalisé".
- **Sortie :** tableau matricule / nom / username / mot de passe **imprimable/exportable** (réutilise `ExportMenu`).
- **Prérequis :** ✅ **LEVÉ** — relation `User ↔ Eleve` ajoutée (`Eleve.userId @unique`, cf. Phase 0.3). Migration `migration_eleve_user.sql` appliquée, `prisma generate` OK. La feature peut être codée directement.

---

## Phase 2 — Priorités P2

| Item | Action | Fichiers clés |
|---|---|---|
| **Bulletin annuel consolidé** | 🔧 FINIR (API déjà là) | UI dans `BulletinsManager.tsx` + template PDF annuel dans `bulletin-generator.ts` |
| **Convocation des parents** | 🆕 CRÉER | `vie-scolaire/convocations/page.tsx` + `api/vie-scolaire/convocations/route.ts` + PDF ; réutilise `Incident`/`Parent`/`EleveParent` |
| **Changement de classe (masse)** | 🆕 CRÉER | `eleves/transfert/page.tsx` (double-liste `»`/`«`) + `api/eleves/changer-classe/route.ts` (bulk update `classeId`) |
| **Feuille de présence imprimable** | 🔧 AMÉLIORER | bouton dans `eleves/page.tsx` → `api/absences/feuille-presence` (PDF vierge classe × jours) |
| **Import photos en masse** | 🔧 AMÉLIORER | `eleves/page.tsx` → réutilise `api/eleves/upload-photo` en boucle + mapping ZIP/matricule |

---

## Phase 3 — Priorités P3 (configuration & gouvernance)

| Item | Action | Fichiers clés |
|---|---|---|
| **Règles d'appréciation configurables** | 🆕 CRÉER UI + 🔧 brancher | `parametres/appreciations/` (CRUD sur `ReglesAppreciation`) ; modifier `genererAppréciation()` dans `api/bulletins/generer/route.ts` pour lire les règles au lieu du code en dur |
| **Clôture / prolongation de période** | 🔧 AMÉLIORER | `parametres/periodes/` (statut + dateLimiteSaisie) ; garde-fou dans `api/notes/route.ts` (refuse saisie si `Periode.statut = CLOTUREE`) |
| **Signature & cachet** | 🔧 AMÉLIORER | upload dans `parametres/` (`Tenant.signatureUrl/cachetUrl`) ; injection dans templates PDF |
| **Dispense de matière** | 🆕 CRÉER | table `DispenseMatiere` + UI dans fiche élève ; filtre dans calcul de moyenne (`bulletin-generator.ts`) |
| **Import de notes en masse** | 🆕 CRÉER | `notes/import/` + `api/notes/import/route.ts` (parse via `src/lib/import.ts`) |
| **Champs métier par type d'incident** | 🔧 AMÉLIORER | enrichir `Incident` (agresseur/victime, forme, dommage, résolution) + `VieScolaireView.tsx` |

---

## Phase 4 — Priorités P4 (contexte national Djibouti)

| Item | Action |
|---|---|
| **Cartes scolaires imprimables** | 🆕 `eleves/cartes/` + template PDF carte (photo + QR/matricule) |
| **Élève transféré (inter-établissement)** | 🆕 flux distinct du changement de classe interne |
| **Résultats examens nationaux (BEF / Admission certificative)** | 🆕 module `examens/national/` — import résultats officiels, mention/décision (effort élevé) |
| **Dispositif de socialisation / Notification inspecteur VS** | 🆕 pages dédiées sous `vie-scolaire/` (faible priorité) |

---

## Récap par type d'action (réponse directe à la demande)

**🔧 À MODIFIER / AMÉLIORER (fichiers existants) :**
`eleves/page.tsx` (+ ElevesTable/Actions) · `VieScolaireView.tsx` · `BulletinsManager.tsx` · `ExamensManager.tsx` · `bulletins/annuel` (finir) · `bulletins/generer/route.ts` (règles) · `notes/route.ts` (clôture) · `parametres/*` · `layout.tsx` + `Header.tsx` (i18n) · `bulletin-generator.ts` (signature/annuel) · `schema.prisma` (champs).

**🆕 À CRÉER (nouvelles pages/modules) :**
Attestation de scolarité · Génération comptes élèves · Changement de classe · Convocation des parents · Config règles d'appréciation · Config périodes (clôture) · Dispense de matière · Import de notes · Cartes scolaires · Élève transféré · Résultats examens nationaux · Dispositif socialisation / Notification inspecteur.

**⚙️ TRANSVERSE (à installer une fois) :**
i18n `next-intl` (bilingue FR/EN) · libs `exceljs`+`papaparse` · `src/lib/export.ts` + `src/lib/import.ts` + `ui/ExportMenu.tsx` · 3 nouveaux modèles Prisma + champs (1 migration).

**Ordre conseillé :** Phase 0 (fondations) → P1 → P2 → P3 → P4. L'i18n (0.1) peut avancer en parallèle et être appliqué page par page au fur et à mesure.
