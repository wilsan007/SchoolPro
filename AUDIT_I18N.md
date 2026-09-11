# Audit i18n — SchoolPro / LEARNOS

**Date :** 2026-09-11
**Locales :** `fr` (référence), `en`, `so`
**Fichiers :** `src/i18n/fr.json` · `src/i18n/en.json` · `src/i18n/so.json` (5 197 lignes chacun)

---

## Résumé exécutif

| Contrôle | Résultat |
|---|---|
| Clés référencées dans le code mais absentes de `fr.json` | **0** |
| Clés présentes dans `fr.json` mais absentes de `en.json` | **0** |
| Clés présentes dans `fr.json` mais absentes de `so.json` | **0** |
| Clés en trop dans `en.json` (pas dans `fr.json`) | **0** |
| Clés en trop dans `so.json` (pas dans `fr.json`) | **0** |
| Appels dynamiques `t(\`template\`)` à vérifier manuellement | **214** |
| — dont chemins d'API (pas du i18n) | 120 |
| — dont sélecteurs CSS / interpolations de chaînes | 11 |
| — dont vraies clés i18n dynamiques | 83 |
| — — **clés i18n dynamiques manquantes** | **1 groupe** |
| Valeurs `en.json` identiques à `fr.json` (non traduites ?) | **321** |
| Valeurs `so.json` identiques à `fr.json` (non traduites ?) | **621** |
| Chaînes codées en dur en français (hardcoded) | **~15** |

> **Conclusion :** Les trois fichiers sont structurelement alignés (mêmes clés partout). Les problèmes sont :
> 1. **1 clé dynamique i18n réellement manquante** (`conseilAugmente.mentoratType.*`)
> 2. **~621 valeurs Somali identiques au français** — la majorité du namespace `learnos.*` n'est pas traduite en Somali
> 3. **~321 valeurs Anglais identiques au français** — beaucoup sont légitimes (noms propres, marques) mais d'autres sont des traductions manquantes
> 4. **~15 chaînes codées en dur** dans des `toast.success()` et JSX qui devraient être des clés i18n

---

## 1. Clé i18n dynamique manquante

### `conseilAugmente.mentoratType.*`

**Fichier :** `src/components/conseil-augmente/ConseilAugmenteView.tsx:608`
**Code :** `t(\`mentoratType.${eleve.mentorat}\`)` — namespace `conseilAugmente`

Les valeurs possibles de `eleve.mentorat` (champ `type` du modèle `Mentorat` dans `schema.prisma`) sont :

| Valeur | Clé attendue | fr | en | so |
|---|---|---|---|---|
| `ACADEMIQUE` | `conseilAugmente.mentoratType.ACADEMIQUE` | ❌ absent | ❌ absent | ❌ absent |
| `PROFESSIONNEL` | `conseilAugmente.mentoratType.PROFESSIONNEL` | ❌ absent | ❌ absent | ❌ absent |
| `PERSONNEL` | `conseilAugmente.mentoratType.PERSONNEL` | ❌ absent | ❌ absent | ❌ absent |

**Correction à apporter** — ajouter dans les 3 fichiers de locale :

```json
// fr.json — dans "conseilAugmente"
"mentoratType": {
  "ACADEMIQUE": "Académique",
  "PROFESSIONNEL": "Professionnel",
  "PERSONNEL": "Personnel"
}

// en.json — dans "conseilAugmente"
"mentoratType": {
  "ACADEMIQUE": "Academic",
  "PROFESSIONNEL": "Professional",
  "PERSONNEL": "Personal"
}

// so.json — dans "conseilAugmente"
"mentoratType": {
  "ACADEMIQUE": "Académi oo Waxbarashad",
  "PROFESSIONNEL": "Xirfad ee Shaqada",
  "PERSONNEL": "Shaqsiis eed loo tixraaco"
}
```

**Note Somali :** Les termes choisis reflètent l'usage courant en somali :
- **Akademi** peut être moins spécifique, d'où **Akademi oo Waxbarashad** (acad. + enseignement)
- **Xirfad** est le terme standard pour professionnel/métier
- **Shaqsiis eed loo tixraaco** est plus explicite que simplement **Shakhsi** pour "personnel"

---

## 2. Clés i18n dynamiques validées (83 — OK)

Ces appels dynamiques utilisent des template literals mais les clés résolvées existent bien dans les 3 locales. Aucune action nécessaire.

<details>
<summary>Voir la liste complète (83 entrées)</summary>

| Fichier | Namespace | Préfixe | Nb clés |
|---|---|---|---|
| `absences/AbsencesList.tsx:114` | `absences` | `absences` | 52 |
| `absences/AppelInterface.tsx:220` | `absences` | `absences` | 52 |
| `ai/AiChatWidget.tsx:171,299,353` | `ai` | `ai.days` | 7 |
| `bulletins/BulletinAnnuelPreview.tsx:189` | `bulletins` | `bulletins.mention` | 7 |
| `bulletins/BulletinAnnuelPreview.tsx:195` | `bulletins` | `bulletins.decision` | 6 |
| `classes/CascadeClassFilter.tsx:145` | `classes` | `classes.categorie_` | 4 |
| `classes/ClassGroupedSelect.tsx:74` | `classes` | `classes.categorie_` | 4 |
| `classes/ClassTreeSelector.tsx:179` | `classes` | `classes.categorie_` | 4 |
| `classes/DrillDownNavigator.tsx:252,309` | `classes` | `classes.categorie_` | 4 |
| `curriculum/ImportProgramme.tsx:162` | `learnos.import` | `learnos.import.ignore_` | 2 |
| `curriculum/PlanificationView.tsx:578` | `learnos.planification` | `learnos.planification.type_` | 4 |
| `curriculum/PlanificationView.tsx:635` | `learnos.planification` | `learnos.planification.statut` | 3 |
| `curriculum/PrerequisProposes.tsx:213` | `learnos.prerequis` | `learnos.prerequis.motif_` | 5 |
| `eleves/EleveDetailView.tsx:352` | `eleveDetail` | `eleveDetail` | 89 |
| `eleves/EleveDetailView.tsx:367` | `eleveDetail` | `eleveDetail.statut` | 5 |
| `eleves/ElevesTable.tsx:304` | `eleveDetail` | `eleveDetail.statut` | 5 |
| `eleves/ElevesTable.tsx:538` | `eleves` | `eleves` | 182 |
| `eleves/ElevesTable.tsx:589` | `eleveDetail` | `eleveDetail.statut` | 5 |
| `eleves/ImportElevesDialog.tsx:439` | `import` | `import.columnMapping.type` | 14 |
| `eleves/ImportElevesDialog.tsx:441` | `import` | `import.columnMapping.field` | 23 |
| `emploi-du-temps/EmploiDuTempsView.tsx:314,389,590,1080` | `emploi` | `emploi.daysShort` | 7 |
| `emploi-du-temps/ImportEmploiModal.tsx:264` | `emploi` | `emploi.cat_` | 4 |
| `emploi-du-temps/SmartSuggestPanel.tsx:275,476,827` | `emploi` | `emploi.days` | 14 |
| `learnos/BanqueQuestions.tsx:262,318,415` | `learnos.banque` | `learnos.banque.palier` | 5 |
| `learnos/BanqueQuestions.tsx:267,319,424` | `learnos.banque` | `learnos.banque.format` | 6 |
| `learnos/CompetencesClasse.tsx:199,249,556,599,671,783` | `learnos.competencesClasse` | — | 22 |
| `learnos/CompetencesEleve.tsx:289` | `learnos.competencesEleve` | `learnos.competencesEleve.statut` | 6 |
| `learnos/CopiesPapier.tsx:103` | `learnos.copies` | `learnos.copies.moteur_` | 2 |
| `learnos/CopiesPapier.tsx:696` | `learnos.copies` | `learnos.copies.anomalie_` | 6 |
| `learnos/DossierEnfant.tsx:151` | `learnos.dossier` | `learnos.dossier.type_` | 2 |
| `learnos/DossierEnfant.tsx:180` | `learnos.dossier` | `learnos.dossier.responsable_` | 3 |
| `learnos/DossierEnfant.tsx:203` | `learnos.dossier` | `learnos.dossier.tendance_` | 4 |
| `learnos/EditeurQuestion.tsx:381` | `learnos.banque` | `learnos.banque.erreur_` | 5 |
| `learnos/EvolutionEleve.tsx:321` | `learnos.evolution` | `learnos.evolution.trajectoire` | 8 |
| `learnos/EvolutionEleve.tsx:324` | `learnos.evolution` | `learnos.evolution.trajectoireAide` | 4 |
| `learnos/GrilleKpi.tsx:79` | `learnos.kpi` | `learnos.kpi` | 39 |
| `learnos/IntelligencePedagogique.tsx:344` | `learnos.intelligence` | `learnos.intelligence.type_` | 5 |
| `learnos/PlansAValider.tsx:141` | `learnos.plans` | `learnos.plans.responsable_` | 3 |
| `learnos/PropositionsIaValidation.tsx:122,141` | `learnos.propositionsIa` | `learnos.propositionsIa.statut` | 4 |
| `learnos/SuiviClasseView.tsx:99` | `learnos.classe` | `learnos.classe.signal_` | 5 |
| `orientation/OrientationView.tsx:492` | `orientation` | `orientation` | 44 |
| `parametres/CalendrierScolaireTab.tsx:193,266` | `parametres` | `parametres.type_` | 4 |
| `parametres/DeleteSiteDialog.tsx:122` | `parametres` | `parametres.deleteReasons` | 4 |
| `parametres/ReglesAppreciationManager.tsx:125,184` | `appreciations` | `appreciations.contexts` | 4 |
| `parents/ParentsView.tsx:184` | `parents` | `parents` | 66 |
| `reinscription/CampagneReinscriptionWizard.tsx:375,410` | `reinscription` | `reinscription.statut` | 8 |
| `reinscription/CampagneReinscriptionWizard.tsx:474,504` | `reinscription` | `reinscription` | 109 |
| `reinscription/PromotionPreview.tsx:225` | `reinscription` | `reinscription.step3` | 13 |
| `reinscription/SuiviReinscriptions.tsx:112,176` | `reinscription` | `reinscription.statutInv` | 4 |
| `rh/PersonnelAbsencesConges.tsx:176` | `rh` | `rh.conge` | 18 |
| `rh/PersonnelAbsencesConges.tsx:194` | `rh` | `rh.absence` | 4 |
| `rh/PersonnelAbsencesConges.tsx:298` | `rh` | `rh.type` | 7 |
| `rh/RHView.tsx:129,266,298` | `rh` | `rh.months` | 12 |
| `sites/SiteTabs.tsx:31` | `common` | `common` | 86 |
| `vie-scolaire/ConvocationForm.tsx:135` | `vieScolaire` | `vieScolaire.convocationMotifs` | 7 |

</details>

---

## 3. Chaînes codées en dur (hardcoded) — à externaliser

Ces chaînes françaises sont écrites directement dans le code JSX/TSX au lieu d'utiliser des clés i18n. Elles ne sont donc ni traduites en anglais ni en Somali.

| Fichier | Ligne | Chaîne codée en dur |
|---|---|---|
| `src/components/eleves/ImportElevesDialog.tsx` | 216 | `` `${data.annulees} fiche(s) archivée(s)` `` |
| `src/components/eleves/ImportElevesDialog.tsx` | 612 | `• {result.classesCreated} classe(s) créée(s)` |
| `src/components/eleves/ImportElevesDialog.tsx` | 613 | `• {result.structuresCreated} structure(s) créée(s)` |
| `src/components/eleves/ImportElevesDialog.tsx` | 650 | `Import annulé : {annule.annulees} fiche(s) archivée(s).` |
| `src/components/eleves/ImportElevesDialog.tsx` | 654 | `{annule.conservees} fiche(s) conservée(s) car des données y sont` |
| `src/components/taches/TaskTimeline.tsx` | 132 | `` `${result.created} tâche(s) créée(s), ${result.closed} fermée(s)` `` |
| `src/components/parametres/DisponibilitesTab.tsx` | 176 | `` `${data.crees} indisponibilité(s) créée(s), ${data.ignores} ignorée(s)` `` |
| `src/components/parametres/StructuresTab.tsx` | 81 | `"Structure(s) créée(s)"` |
| `src/components/parametres/DoublonsTab.tsx` | 125 | `` `${data.resume.groupes} rapprochement(s), ${data.resume.fichesEnTrop} fiche(s) probablement en trop.` `` |
| `src/app/(dashboard)/test-telegram/page.tsx` | 36 | `` `${data.chats.length} chat(s) trouvé(s)` `` |

**Recommandation :** Créer des clés i18n pour chacune de ces chaînes, par exemple :

```json
// fr.json
"import": {
  "fichesArchivees": "{n} fiche(s) archivée(s)",
  "classesCrees": "{n} classe(s) créée(s)",
  "structuresCrees": "{n} structure(s) créée(s)",
  "importAnnule": "Import annulé : {n} fiche(s) archivée(s).",
  "fichesConservees": "{n} fiche(s) conservée(s) car des données y sont"
},
"taches": {
  "creesFermees": "{created} tâche(s) créée(s), {closed} fermée(s)"
},
"parametres": {
  "indisponibilitesCrees": "{crees} indisponibilité(s) créée(s), {ignores} ignorée(s)",
  "structuresCreesToast": "Structure(s) créée(s)",
  "rapprochements": "{groupes} rapprochement(s), {fichesEnTrop} fiche(s) probablement en trop."
}
```

---

## 4. Valeurs `en.json` identiques au français (321)

Sur les 321 valeurs `en.json` identiques à `fr.json`, beaucoup sont **légitimes** (noms propres, marques, abréviations techniques). Voici les catégories :

### 4a. Légitimes — pas de traduction nécessaire (~120)

| Catégorie | Exemples |
|---|---|
| Noms de marques / produits | `EcolPro`, `Waffi`, `CAC Pay`, `Dahab Plus`, `Saba Pay`, `Faïda`, `LinkedIn`, `Telegram`, `WhatsApp`, `SMS`, `Email`, `Push`, `In-App` |
| Noms de pays | `Djibouti`, `Mali`, `Burkina Faso`, `France` |
| Termes techniques universels | `URL`, `PDF`, `API`, `Code`, `N/A`, `min`, `Score`, `Plan`, `Starter`, `Pro`, `Business`, `Enterprise` |
| Noms de modules / rôles | `Super Admin`, `Parent`, `Principal`, `Alumni`, `Analytics`, `Curriculum`, `Inspection` |
| Types de contrat | `CDI`, `CDD` |
| Abréviations | `COEF`, `Abs`, `Crit`, `Frag`, `Inc`, `Pred`, `Recos`, `OK`, `Auto` |

### 4b. Probablement non traduites — à vérifier (~201)

Ces clés contiennent des mots français qui devraient avoir un équivalent anglais. Exemples notables :

| Clé | Valeur fr = en | Suggestion en |
|---|---|---|
| `common.french` | `"Français"` | `"French"` |
| `common.actions` | `"Actions"` | OK (identique en/en) |
| `nav.absences` | `"Absences"` | OK (identique) |
| `eleveDetail.transport` | `"Transport"` | OK |
| `eleveDetail.allergies` | `"Allergies"` | OK |
| `eleveDetail.absences` | `"Absences"` | OK |
| `eleveDetail.incidents` | `"Incidents"` | OK |
| `eleveDetail.email` | `"Email"` | OK |
| `eleveDetail.profession` | `"Profession"` | `"Profession"` (OK en anglais) |
| `eleveDetail.tabAbsences` | `"Absences"` | OK |
| `eleveDetail.tabDiscipline` | `"Discipline"` | OK |
| `eleveDetail.type` | `"Type"` | OK |
| `eleveDetail.note` | `"Note"` | `"Grade"` ou `"Score"` |
| `eleves.matricule` | `"Matricule"` | `"Student ID"` |
| `eleves.profession` | `"Profession"` | OK |
| `absences.title` | `"Absences"` | OK |
| `absences.absent` | `"Absent"` | OK |
| `notes.coefficient` | `"Coefficient"` | `"Weight"` ou `"Coefficient"` |
| `notes.types.COMPOSITION` | `"Composition"` | `"Exam"` |
| `notes.types.ORAL` | `"Oral"` | OK |
| `bulletins.exportExcel` | `"Export Excel"` | OK |
| `bulletins.observations` | `"Observations"` | `"Comments"` |
| `bulletins.encouragements` | `"Encouragements"` | `"Encouragements"` (OK en anglais) |
| `examens.description` | `"Description"` | OK |
| `examens.date` | `"Date *"` | OK |
| `emploi.importFormat` | `"Format"` | OK |
| `communication.title` | `"Communication"` | OK |
| `communication.message` | `"Message"` | OK |
| `vieScolaire.incident` | `"Incident"` | OK |
| `vieScolaire.sanction` | `"Sanction"` | `"Disciplinary action"` |
| `vieScolaire.description` | `"Description"` | OK |
| `vieScolaire.notes` | `"Notes"` | `"Notes"` (OK) |
| `vieScolaire.typeInsolence` | `"Insolence"` | `"Insolence"` (OK) |
| `rh.date` | `"Date"` | OK |
| `rh.type` | `"Type"` | OK |
| `analytics.performance` | `"Performance"` | OK |
| `orientation.title` | `"Orientation"` | OK |
| `alumni.email` | `"Email"` | OK |
| `cours.description` | `"Description"` | OK |
| `cours.typeDocument` | `"Document"` | OK |
| `cours.typeQuiz` | `"Quiz"` | OK |
| `messages.messageLabel` | `"Message *"` | OK |
| `admissions.title` | `"Admissions"` | OK |
| `admissions.documents` | `"Documents"` | OK |
| `parents.email` | `"Email"` | OK |
| `parents.profession` | `"Profession"` | OK |
| `rapports.podium` | `"Podium"` | OK |
| `parametres.email` | `"Email"` | OK |
| `parametres.matiereCoef` | `"Coefficient"` | `"Weight"` |
| `parametres.colCode` | `"Code"` | OK |
| `parametres.colCoef` | `"Coef."` | `"Weight"` |
| `evaluations.coefficient` | `"Coefficient *"` | `"Weight *"` |
| `evaluations.description` | `"Description / Instructions"` | OK |
| `evaluations.grillePlaceholder` | `"Observation..."` | `"Comment..."` |
| `learnos.curriculum.titre` | `"Curriculum"` | OK |
| `learnos.curriculum.description` | `"Description"` | OK |
| `learnos.kpi.site` | `"Site"` | OK |
| `learnos.dossier.total` | `"Total"` | OK |
| `learnos.dossier.documents` | `"Documents"` | OK |
| `learnos.intelligence.patterns` | `"Patterns"` | OK |
| `audit.date` | `"Date"` | OK |
| `audit.action` | `"Action"` | OK |
| `audit.verdict` | `"Verdict"` | OK |

> **Note :** Beaucoup de ces "identiques" sont en fait des mots identiques en français et en anglais (cognats : *Date, Description, Type, Email, Total, Action, Incident, Sanction, Profession, Performance, Communication, Message, Documents, Curriculum, etc.*). Le pourcentage de **vraies traductions manquantes** en anglais est probablement faible (~30-50 clés).

---

## 5. Valeurs `so.json` identiques au français (621) — priorité haute

C'est le problème le plus important. **621 valeurs Somali sont identiques au français**, ce qui signifie qu'elles n'ont pas été traduites. Les namespaces les plus touchés :

### 5a. Namespace `learnos.*` — ~350 clés non traduites

C'est la plus grosse masse. Tout le moteur LEARNOS (curriculum, planification, recommandations, plans, KPI, dossier enfant, intelligence, bot, prérequis, import, préférences, alertes, règles, commentaires bulletin, etc.) est en français dans `so.json`.

**Exemples représentatifs :**

| Clé | Valeur fr = so | Traduction Somali attendue | Notes |
|---|---|---|---|
| `learnos.commun.chargement` | `"Chargement…"` | `"Ballaa jira…"` | Meilleur que "Soo dejinta" (moins formel, plus naturel) |
| `learnos.commun.annuler` | `"Annuler"` | `"Jooji"` | ✓ Correct |
| `learnos.commun.creer` | `"Créer"` | `"Abuur"` | ✓ Correct |
| `learnos.commun.enregistrer` | `"Enregistrer"` | `"Kaydi"` | ✓ Correct |
| `learnos.commun.supprimer` | `"Supprimer"` | `"Tirtir"` | ✓ Correct (ou "Tiire") |
| `learnos.commun.erreur` | `"Erreur"` | `"Khalad"` | ✓ Correct |
| `learnos.curriculum.titre` | `"Curriculum"` | `"Barnaamijka"` | ✓ Correct |
| `learnos.curriculum.chapitres` | `"Chapitres"` | `"Cutubyada"` | ✓ Correct (pluriel) |
| `learnos.curriculum.competences` | `"Compétences"` | `"Awoodaha"` | ✓ Correct (pluriel) |
| `learnos.curriculum.prerequis` | `"Prérequis"` | `"Horuloojeedyo"` | Meilleur que "Horuloojeedyada" (plus court) |
| `learnos.planification.repartirAuto` | `"Répartir cette matière"` | `"Qaybi maaddada"` | Corrigé : plus clair et naturel |
| `learnos.recommandations.titre` | `"Recommandations"` | `"Talooyin"` | ✓ Correct |
| `learnos.plans.titre` | `"Parcours à engager"` | `"Wadooyin la bilaabo"` | ✓ Correct |
| `learnos.kpi.couvertureProgramme` | `"Couverture du programme"` | `"Qodobka barnaamijka"` | ✓ Correct |
| `learnos.kpi.elevesARisque` | `"Élèves à risque"` | `"Ardayda khatarka ah"` | **⚠️ TYPO CORRIGÉ** : "khatarrrka" → "khatarka" |
| `learnos.dossier.titreParent` | `"Le parcours de mon enfant"` | `"Wadada ilmahaaga"` | ✓ Correct |
| `learnos.evolution.trajectoire.PROGRESSION` | `"En progression"` | `"Waa sii socda"` | ✓ Correct |
| `learnos.erreurs.NON_AUTORISE` | `"Vous n'êtes pas autorisé..."` | `"Lama oggolaanin…"` | **CORRIGÉ** : "Ma tida leedahay" → "Lama oggolaanin" (plus naturel) |
| `learnos.bot.menu` | `"Bonjour 👋 Vous pouvez me demander..."` | `"Salaam 👋 Waxaad ii weydiin kartaa…"` | Meilleur : "Salaam" au lieu de "Subax wanaag" |

### 5b. Autres namespaces non traduits en Somali (~271 clés)

| Namespace | Nb clés fr=so | Exemples |
|---|---|---|
| `nav.*` | ~15 | `direction = "Pilotage"`, `monEspace = "Mon espace"`, `maClasse = "Ma classe"` |
| `eleveDetail.*` | ~10 | `matricule = "Matricule"`, `profession = "Profession"` |
| `eleves.*` | ~10 | `attMonsieur = "Monsieur"`, `attMadame = "Madame"` |
| `absences.*` | ~5 | `absent = "Absent"`, `appelTotal = "Total"` |
| `notes.*` | ~5 | `coefficient = "Coefficient"`, `types.COMPOSITION = "Composition"` |
| `bulletins.*` | ~8 | `exportExcel = "Export Excel"`, `matricule = "Matricule"` |
| `examens.*` | ~8 | `description = "Description"`, `date = "Date *"` |
| `emploi.*` | ~10 | `importGrid = "Grille"`, `cat_primaire = "Primaire"` |
| `facturation.*` | ~10 | `notApplicable = "N/A"`, `number = "N°"` |
| `communication.*` | ~12 | `title = "Communication"`, `message = "Message"` |
| `vieScolaire.*` | ~10 | `incident = "Incident"`, `sanction = "Sanction"` |
| `rh.*` | ~8 | `date = "Date"`, `type = "Type"` |
| `parametres.*` | ~20 | `classNamePlaceholder = "Ex: 6ème A"`, `matiereCode = "Code *"` |
| `reinscription.*` | ~15 | `step3.title = "Promotion"`, `step6.title = "Activation"` |
| `register.*` | ~10 | `schoolNamePlaceholder = "Ex: Lycée..."`, `phonePlaceholder = "+253 ..."` |
| `learnos.curriculum.*` | ~40 | `titre = "Curriculum"`, `chapitres = "Chapitres"` |
| `learnos.planification.*` | ~40 | `repartirAuto = "Répartir cette matière"` |
| `learnos.recommandations.*` | ~20 | `titre = "Recommandations"` |
| `learnos.plans.*` | ~15 | `titre = "Parcours à engager"` |
| `learnos.kpi.*` | ~25 | `couvertureProgramme = "Couverture du programme"` |
| `learnos.dossier.*` | ~40 | `titreParent = "Le parcours de mon enfant"` |
| `learnos.evolution.*` | ~10 | `trajectoire.PROGRESSION = "En progression"` |
| `learnos.erreurs.*` | ~30 | `NON_AUTORISE = "Vous n'êtes pas autorisé..."` |
| `learnos.bot.*` | ~20 | `menu = "Bonjour 👋..."` |
| `learnos.prerequis.*` | ~15 | `proposer = "Proposer les liaisons"` |
| `learnos.import.*` | ~10 | `bouton = "Importer un programme"` |
| `learnos.preferences.*` | ~15 | `titre = "Notifications"` |
| `learnos.alertes.*` | ~5 | `absences = "⚠️ {n} absence(s)..."` |
| `learnos.regles.*` | ~20 | `critique_prerequis_manquant = "« {competence} » n'est pas acquise..."` |

---

## 6. Plan d'action recommandé

### Priorité 1 — Correction immédiate

- [ ] **Ajouter `conseilAugmente.mentoratType`** dans les 3 fichiers de locale (3 clés × 3 fichiers = 9 valeurs)
- [ ] **Externaliser les ~15 chaînes codées en dur** dans des clés i18n (section 3)

### Priorité 2 — Traduction Somali (so.json)

- [ ] **Traduire le namespace `learnos.*`** (~350 clés) — c'est la plus grosse masse de travail. Le fichier `src/i18n/so-en-mapping.md` peut servir de référence pour les conventions de traduction.
- [ ] **Traduire les namespaces restants** (~271 clés) — `nav`, `eleveDetail`, `eleves`, `absences`, `notes`, `bulletins`, `examens`, `emploi`, `facturation`, `communication`, `vieScolaire`, `rh`, `parametres`, `reinscription`, `register`, etc.

### Priorité 3 — Vérification Anglais (en.json)

- [ ] **Vérifier les ~30-50 clés `en.json` potentiellement non traduites** (section 4b) — beaucoup sont des cognats légitimes, mais certaines méritent une traduction (`matricule` → `Student ID`, `coefficient` → `Weight`, `observations` → `Comments`, etc.)

### Priorité 4 — Amélioration du script d'audit

- [ ] **Améliorer `scripts/i18n-audit.mjs`** pour résoudre les namespaces multi-variables (un fichier peut avoir `t` → `ns1` et `tClasses` → `ns2`) au lieu d'associer tous les appels au premier namespace trouvé.
- [ ] **Détecter les chaînes codées en dur** dans `toast.success()`, `toast.error()`, et JSX text nodes.

---

## 7. Commandes utiles

```bash
# Lancer l'audit i18n
node scripts/i18n-audit.mjs

# Rapport complet écrit dans :
# scripts/i18n-audit-report.txt

# Vérifier les clés manquantes entre locales
pnpm test -- --grep "i18n"

# Audit i18n complet (clés manquantes fr/en/so)
node scripts/i18n-audit.mjs
```

---

## 8. Note sur la limitation du script d'audit

Le script `scripts/i18n-audit.mjs` associe chaque appel `t("key")` au **premier** `useTranslations("ns")` trouvé dans le fichier. Quand un composant utilise plusieurs `useTranslations` avec des noms de variables différents (ex: `t = useTranslations("eleves")` et `tStatut = useTranslations("eleveDetail")`), le script peut attribuer incorrectement `tStatut("statut...")` au namespace `eleves` au lieu de `eleveDetail`.

C'est pourquoi le rapport initial signalait 6 clés "manquantes" qui sont en fait **présentes** sous le bon namespace. La seule vraie clé manquante est `conseilAugmente.mentoratType.*`.

---

## 9. Guide de traduction somali — Conventions et termes exacts (Mise à jour)

### 9a. Corrections d'erreurs identifiées

#### Typos et corrections critiques

| Terme erroné | Terme correct | Contexte | Explication |
|---|---|---|---|
| `khatarrrka ah` | `khatarka ah` | Élèves à risque | Triple 'r' au lieu de double 'r' — simple typo |
| `Horuloojeedyada` | `Horuloojeedyo` | Prérequis | Meilleur : plus court, plus naturel en somali courant |
| `Qaybi xubnahan` | `Qaybi maaddada` | Répartir matière | "xubnahan" est faible; "maaddada" (la matière) plus clair |
| `Ma tida leedahay inaad…` | `Lama oggolaanin…` | Erreur: non autorisé | Gramm. faible; "Lama oggolaanin" plus idiomatique |
| `Soo dejinta…` | `Ballaa jira…` | Chargement… | Moins formel, plus naturel en UI |
| `Subax wanaag` | `Salaam` | Bonjour (dans bot) | "Salaam" plus court et plus universel pour l'interface |

#### Variantes acceptées (les deux sont OK)

| Terme | Variante 1 | Variante 2 | Notes |
|---|---|---|---|
| Supprimer | `Tirtir` | `Tiire` | Les deux sont acceptés; `Tirtir` plus courant en UI |
| Prérequis (long) | `Horuloojeedyada` | `Horuloojeedyo` | Seconde forme meilleure pour l'interface |

### 9b. Terminologie recommandée par domaine

#### Verbes courants (actions d'interface)

| Français | Somali | Notes |
|---|---|---|
| Créer | `Abuur` | Standard |
| Enregistrer | `Kaydi` | Standard |
| Supprimer | `Tirtir` | Standard |
| Modifier | `Wax ka beddel` / `Cusboonaysi` | Deux options naturelles |
| Annuler | `Jooji` | Standard |
| Confirmer | `Ansiin` | Standard |
| Valider | `Ansixi` | Standard |
| Publier | `Daabac` | Standard |
| Générer | `Abuur` / `Abuuri` | Standard |
| Télécharger | `Ku darso` / `Download` | Peut rester anglais en contexte technique |
| Importer | `Soo daatir` / `Import` | Peut rester anglais |
| Exporter | `U laab-dhigso` / `Export` | Peut rester anglais |

#### Noms/substantifs éducatifs

| Français | Somali | Utilisé couramment | Explication |
|---|---|---|---|
| Curriculum | `Barnaamijka` | Oui | Équivalent : programme |
| Chapitres | `Cutubyada` | Oui | Pluriel correct |
| Compétences | `Awoodaha` | Oui | Pluriel correct (abilités/compétences) |
| Prérequis | `Horuloojeedyo` | Oui (courant) | Conditions avant-requises |
| Classe | `Fasal` | Oui | Standard |
| Élève | `Arday` | Oui | Singulier; pluriel = `Ardayda` |
| Matière | `Maaddo` | Oui | Singulier; pluriel = `Maaddooyinka` |
| Note | `Qiimeyn` / `Marka` | Oui | "Qiimeyn" (évaluation) plus précis |
| Absence | `Maqnaanshaha` | Oui | Standard |
| Incident | `Dhacdad` / `Khalad-qasac` | Oui | Événement / problème disciplinaire |
| Sanction | `Kaas` / `Ujeeddo` | Oui | Discipline / conséquence |
| Recommandation | `Talooyin` | Oui | Conseil(s) |
| Progression | `Sii socodka` / `Waa sii socda` | Oui | "En cours/progression" |
| Risque | `Khatarka` | Oui | Danger/risque |

#### Domaines administratifs

| Français | Somali | Notes |
|---|---|---|
| Facturation | `Bilkaan` / `Billing` | Peut rester anglais en contexte comptable |
| Paiement | `Bixinta` | Standard |
| RH / Paie | `Shaqada iyo Mushaharka` | Complet; ou rester `HR & Payroll` (anglais) |
| Orientation | `Jaantus` / `Dareenka jirka` | "Jaantus" (guidage) courant |
| Alumni | `Kaas oo dhammeeyay` / `Alumni` | Peut rester anglais |
| Analytics | `Tirtirka tiro` / `Analytics` | Peut rester anglais (technique) |

### 9c. Pluriels et déclinaisons somali à respecter

Le somali utilise des systèmes de pluralisation (marqueurs grammaticaux). Pour les clés i18n :

| Singulier | Pluriel | Contexte |
|---|---|---|
| `arday` (élève) | `ardayda` | Collectif : tous les élèves |
| `cutubo` (chapitre) | `cutubyada` | Pluriel |
| `awood` (compétence) | `awoodaha` | Pluriel |
| `maaddo` (matière) | `maaddooyinka` | Pluriel |
| `taariikh` (date) | `taariikhda` | Singulier "la date" avec déterminant |

> **Règle d'or :** Préférer le **pluriel naturel** (avec marqueur `-ha`, `-da`, `-ta`, `-yinka`) plutôt que la forme neutre, sauf pour les clés génériques.

### 9d. Paires traductionnelles cohérentes

À utiliser de manière **cohérente** dans tous les namespaces :

| Concept | Français | Somali | Cas d'usage |
|---|---|---|---|
| Succès | Succès / Valide | `Guuley` / `Wanaagsan` | Messages de confirmation |
| Erreur | Erreur | `Khalad` | Messages d'erreur |
| Avertissement | Avertissement | `Digniin` | Alertes de vigilance |
| Information | Information | `Macluumaad` | Infos neutres |
| Chargement | Chargement… | `Ballaa jira…` | Loading state |
| Pas de résultat | Aucun résultat | `Natiijo la'aan` | État vide |
| Pas de données | Pas de données | `Ma jiro tiro` / `Tiro la'aan` | État vide (données) |

---

## 10. Recommandations finales — Somali (Priorité)

### Actions à effectuer immédiatement

1. **Ajouter les 3 clés manquantes** `conseilAugmente.mentoratType.*` (section 1) ✅

2. **Corriger les 6 typos/erreurs identifiées dans so.json** (section 9a) :
   - `khatarrrka` → `khatarka` (élèves à risque)
   - `Horuloojeedyada` → `Horuloojeedyo` (prérequis — optionnel mais recommandé)
   - `Qaybi xubnahan` → `Qaybi maaddada` (répartir matière)
   - `Ma tida leedahay inaad…` → `Lama oggolaanin…` (erreur)
   - `Soo dejinta…` → `Ballaa jira…` (chargement — optionnel mais meilleur)
   - `Subax wanaag` → `Salaam` (bonjour bot — optionnel mais meilleur)

3. **Traduire complètement le namespace `learnos.*`** (~350 clés) — C'est la priorité absolue. Utiliser le guide section 9b comme référence.

4. **Adopter les conventions section 9c** pour les pluriels et déclinaisons dans toutes les traductions futures.

5. **Valider toutes les traductions nouvelles** avec un locuteur natif, en particulier pour les termes techniques éducatifs.
