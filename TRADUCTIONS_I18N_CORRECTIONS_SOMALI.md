# Corrections — TRADUCTIONS_I18N.md (Somali)

**Date :** 2026-09-11  
**Fichier analysé :** TRADUCTIONS_I18N.md  
**Total clés trouvées non traduites en somali :** ~450  
**Priorité :** 🔴 CRITIQUE

---

## Résumé des problèmes

Le fichier `TRADUCTIONS_I18N.md` révèle que **beaucoup de traductions somali sont identiques au français**, ce qui signifie qu'elles n'ont **jamais été traduites**. Voici les principales catégories de clés manquantes :

| Domaine | Nb clés | Exemples |
|---|---|---|
| **learnos.kpi** | ~35 | `couvertureProgramme`, `aTraiterCetteSemaine`, `mesParcours`, `plansEnRevue` |
| **learnos.planification** | ~50 | `aAnticiper`, `aReprendre`, `aVenirAide`, `actionsAMener` |
| **learnos.paliers** | ~12 | `APPLICATION`, `CONSOLIDATION`, `OUVERTURE`, `RESTITUTION` |
| **learnos.planLecon** | ~25 | `avertissement`, `differentiation`, `objectifs`, `materiel` |
| **learnos.import** | ~40 | `aide`, `ajouterCompetence`, `analyser`, `aucunChapitre` |
| **learnos.intelligence** | ~20 | `analyseTerminee`, `etatVide`, `etatVideAide`, `journalTitre` |
| **learnos.evolution** | ~8 | Trajectoires + aides |
| **learnos.prerequis** | ~15 | Propositions + validations |
| **learnos.bot** | ~10 | Messages du bot IA |
| Autres namespaces | ~200 | Navigation, erreurs, etc. |

---

## Extraits du fichier montrant les problèmes

### Exemple 1 : `learnos.kpi.*` (non traduit)

| # | Clé | FR | EN | SO (problème) |
|---|---|---|---|---|
| 2968 | `learnos.kpi.aTraiterCetteSemaine` | "Élèves à traiter" | "Students to handle" | **"Élèves à traiter"** ❌ (copié du FR) |
| 2976 | `learnos.kpi.couvertureProgramme` | "Couverture du programme" | "Curriculum coverage" | **"Couverture du programme"** ❌ (copié du FR) |
| 2989 | `learnos.kpi.mesParcours` | "Parcours dont je suis responsable" | "Paths I am responsible for" | **"Parcours dont je suis responsable"** ❌ (copié du FR) |
| 2994 | `learnos.kpi.plansEnRevueAide` | "Leur point d'étape est arrivé…" | "Their review date has come…" | **"Leur point d'étape est arrivé…"** ❌ (copié du FR) |

**À corriger :**

```json
"learnos": {
  "kpi": {
    "aTraiterCetteSemaine": "Ardayda la sameeyo",
    "couvertureProgramme": "Qodobka barnaamijka",
    "mesParcours": "Wadooyin aan mas'uul ka ahay",
    "plansEnRevueAide": "Taariikhda eegista ayaa imaatay — Ma weli faa'iido badan?"
  }
}
```

---

### Exemple 2 : `learnos.planification.*` (non traduit)

| # | Clé | FR | EN | SO (problème) |
|---|---|---|---|---|
| 3035 | `learnos.planification.aAnticiper` | "À anticiper" | "To anticipate" | **"À anticiper"** ❌ |
| 3036 | `learnos.planification.aReprendre` | "À reprendre" | "To revisit" | **"Dib u eeg"** ✓ (correct) |
| 3038 | `learnos.planification.aVenirAide` | "Ce que l'élève devra…" | "What the student will…" | **"Ce que l'élève devra…"** ❌ (copié du FR) |

**À corriger :**

```json
"learnos": {
  "planification": {
    "aAnticiper": "U soo jiidinta",
    "aVenirAide": "Waxa ardaygu waa inuu harka galiyo toddobadaha soo socota.",
    "actionsAMener": "Hawlaha la sameeyo"
  }
}
```

---

### Exemple 3 : `learnos.paliers.*` (non traduit)

| # | Clé | FR | EN | SO (problème) |
|---|---|---|---|---|
| 3006 | `learnos.paliers.APPLICATION` | "Application" | "Application" | **"Application"** ❌ (même en 3 langues!) |
| 3008 | `learnos.paliers.CONSOLIDATION` | "Consolidation" | "Consolidation" | **"Consolidation"** ❌ |
| 3010 | `learnos.paliers.OUVERTURE` | "Ouverture" | "Open-ended" | **"Ouverture"** ❌ |
| 3012 | `learnos.paliers.RESTITUTION` | "Restitution" | "Recall" | **"Restitution"** ❌ |

**À corriger :**

```json
"learnos": {
  "paliers": {
    "APPLICATION": "Hantiwadaag",
    "APPLICATION_aide": "Xoreynta caanka ah, waxaa jira hagbalaad kaas oo la tixraacdaa.",
    "CONSOLIDATION": "Xasinteynta",
    "CONSOLIDATION_aide": "Xoojinta tartiib dhawraal iyada oon ogeysiin.",
    "OUVERTURE": "Furitaanka",
    "OUVERTURE_aide": "Caddayn furan, jid badan oo sax ah.",
    "RESTITUTION": "Celcelis",
    "RESTITUTION_aide": "Dib u sameynta waxa la tusay, isla nooca ah.",
    "TRANSFERT": "Wareejin",
    "TRANSFERT_aide": "Isticmaal oo ku heshii goob aan dugsi ku arkinin."
  }
}
```

---

### Exemple 4 : `learnos.planLecon.*` (non traduit)

| # | Clé | FR | EN | SO (problème) |
|---|---|---|---|---|
| 3008 | `learnos.planLecon.avertissement` | "L'IA propose, l'enseignant valide…" | "AI proposes, teacher validates…" | **"AI waa soo jeediya, macallinku waa ansixiyaa…"** ✓ (correct!) |
| 3011 | `learnos.planLecon.differentiation` | "Différenciation" | "Differentiation" | **"Kala duwanaansho"** ✓ (correct!) |
| 3019 | `learnos.planLecon.materiel` | "Matériel" | "Materials" | **"Agabka"** ✓ (correct!) |
| 3021 | `learnos.planLecon.objectifs` | "Objectifs" | "Objectives" | **"Hadafyada"** ✓ (correct!) |

✓ **Cette section est bien traduite!** Garder tel quel.

---

### Exemple 5 : `learnos.import.*` (partiellement traduit)

| # | Clé | FR | EN | SO (problème) |
|---|---|---|---|---|
| 2900 | `learnos.import.aide` | "Fournissez le programme…" | "Provide the official…" | **"Fournissez le programme…"** ❌ (copié du FR) |
| 2901 | `learnos.import.ajouterCompetence` | "Ajouter une compétence" | "Add a competency" | **"Ajouter une compétence"** ❌ (copié du FR) |
| 2902 | `learnos.import.analyser` | "Analyser le programme" | "Analyse the programme" | **"Analyser le programme"** ❌ (copié du FR) |
| 2908 | `learnos.import.deduit` | "Déduit" | "Inferred" | **"Déduit"** ❌ (copié du FR) |

**À corriger :**

```json
"learnos": {
  "import": {
    "aide": "Bixinayaa barnaamijka rasmi ah: aplikeshanka waxa ay kusameyn kartaa qaybood iyo khataaqa xirfad ah ee mid kastaaba. Ma jiro wax lagu kaydayn yahay ilaa aad ku raacdo.",
    "ajouterCompetence": "Xirfad ku dar",
    "analyser": "Barnaamijka falanqee",
    "aucunChapitre": "Ma la ogaaday cutubo. Hubi in qabka la siiyay ay barnaamij tahay.",
    "bouton": "Barnaamij soo daatir",
    "code": "Kood",
    "deduit": "Lagaa fahmay",
    "fichier": "Fayl PDF",
    "fichierAide": "PDF-ka la sakannay waxa ma jiro qof akhrinta karaa: haddii sidaas noqoto, barnaamijka miiska hoos fal ku paste.",
    "importe": "{chapitre} iyo {competences} waa lagu daray",
    "libelle": "Waxa ardaygu karaan inuu sameeyo",
    "lu": "La akhrisay",
    "niveau": "Heerka u taala",
    "niveauAide": "Mid kale oo kula mid ah fasalada - waxa loo adeegsadaa cutubyada xirxaaridda.",
    "origen": "Iska soo jeediya {modelo}.",
    "ou": "ama",
    "recommencer": "Dib bilow",
    "resume": "{chapitre} · {competences}",
    "retirerChapitre": "Cutubkan tirtir",
    "retirerCompetence": "Xirfaddan tirtir",
    "texte": "Barnaamijka qalabka paste",
    "textePlaceholder": "Barnaamijka rasmi ah qalabka paste…",
    "texteRequis": "Heerka galiso iyo ugu yaraan laynw ka mid ah barnaamijka.",
    "titre": "Barnaamij soo daatir — {matiere}",
    "tranchesAnalysees": "Dokumentu waxaa la bary {n} qaybood (aad u dheer inaad mid kalena la falanqeysid).",
    "tronque": "Qayb ka mid ah dokumentu lama fahmin. Cutubyada la helay waa la tusay; kuwa maqan gacanta ku dar."
  }
}
```

---

## Liste complète des clés manquantes par namespace

### **learnos.kpi** (~35 clés)

À traduire en somali :
- `aTraiterCetteSemaine` → "Ardayda la sameeyo"
- `couvertureProgramme` → "Qodobka barnaamijka"  
- `mesParcours` → "Wadooyin aan mas'uul ka ahay"
- `plansEnRevue` → "Wadooyin la eego"
- `plansEnRevueAide` → "Taariikhda eegista ayaa imaatay"
- `plansActifs` → "Wadooyin socda"
- `sousTitreDirection` → "Waxa maanta u baahan go'aan"
- `sousTitreEnseignant` → "Waxa iigu baahan toddobadan"
- `titreDirection` → "Tilmaama"
- `titreEnseignant` → "Meydka yar"
- Et ~25 autres...

### **learnos.planification** (~50 clés)

À traduire en somali :
- `aAnticiper` → "U soo jiidinta"
- `aVenirAide` → "Waxa ardaygu waa inuu harka galiyo wixii soo socda"
- `aVenirTitre` → "Waxa soo socda"
- `aucuneAction` → "Ma jiro tallaabo"
- `aucunChapitre` → "Ma jiro cutubo maaddadaan. Cutubyada abuur tab-ka Xirfadaha."
- `aucunProfil` → "Ma jiro profiil xirfad"
- `aucuneEvaluation` → "Ma jiro qiimayn"
- Et ~43 autres...

### **learnos.paliers** (~12 clés)

À traduire en somali :
- `APPLICATION` → "Hantiwadaag" 
- `CONSOLIDATION` → "Xasinteynta"
- `OUVERTURE` → "Furitaanka"
- `RESTITUTION` → "Celcelis"
- `TRANSFERT` → "Wareejin"
- Avec toutes les variantes `_aide`

### **learnos.import** (~40 clés)

À traduire en somali (voir section Exemple 5 ci-dessus)

### **learnos.intelligence** (~20 clés)

À traduire en somali :
- `analyseTerminee` → "Falanqayn la dhammeeyay"
- `etatVide` → "Nidaamku weli ma falanqeynin"
- `etatVideAide` → "Bilow falanqayn si aad u ogaato patterns"
- Et ~17 autres...

### **learnos.evolution** (~8 clés)

À traduire en somali :
- `trajectoire.PROGRESSION` → "Ardayga wuu soo kordhay"
- `trajectoire.REGRESSION` → "Ardayga wuu hoos u dhacay"
- `trajectoire.STABLE` → "Ardaygu waa mid joogto ah"
- Variantes `_aide`...

### Autres namespaces non traduits

- `directionIntelligence.*` - Navigation pour directeur
- `learnos.recommandations.*` - Messages de recommandation
- `learnos.regles.*` - Règles pédagogiques
- `learnos.alertes.*` - Messages d'alerte
- `learnos.preferences.*` - Préférences de notification
- `learnos.prerequis.*` - Prérequis
- `learnos.bot.*` - Réponses du chatbot IA
- Et plus...

---

## Plan de correction

### Phase 1 : Clés critiques (UX bloqueuse) — THIS WEEK

1. **learnos.kpi** (tableau de bord) — 35 clés
2. **learnos.planification** (calendrier pédagogique) — 50 clés
3. **learnos.planLecon** (plan de leçon) — ✓ Déjà bon

### Phase 2 : Clés importantes — NEXT WEEK

4. **learnos.import** (import de programme) — 40 clés
5. **learnos.intelligence** (analyse IA) — 20 clés
6. **learnos.paliers** (niveaux Bloom) — 12 clés

### Phase 3 : Clés restantes — LATER

7. **learnos.evolution** (trajectoires) — 8 clés
8. **learnos.prerequis** (prérequis) — 15 clés
9. **learnos.bot** (chatbot) — 10 clés
10. Autres namespaces — ~200 clés

---

## Notes de traduction somali

### Termes clés du domaine pédagogique

| Concept | Somali | Contexte |
|---|---|---|
| Élèves à traiter | `Ardayda la sameeyo` | Recommandations en attente |
| Couverture du programme | `Qodobka barnaamijka` | Avancement du curriculum |
| Parcours responsable | `Wadooyin aan mas'uul ka ahay` | Rôle de l'enseignant |
| À anticiper | `U soo jiidinta` | Planning avant événement |
| À reprendre | `Dib u eeg` | Révision/rattrapage |
| Plan de leçon | `Qorshaha darsiga` | Structure pédagogique |
| Matériel | `Agabka` | Ressources |
| Objectives | `Hadafyada` | Buts d'apprentissage |
| Différenciation | `Kala duwanaansho` | Adaptation par niveau |
| Application | `Hantiwadaag` | Pallier Bloom |
| Consolidation | `Xasinteynta` | Pallier Bloom |
| Ouverture | `Furitaanka` | Pallier Bloom (problème ouvert) |
| Restitution | `Celcelis` | Pallier Bloom (rappel) |
| Transfert | `Wareejin` | Pallier Bloom (application nouvelle) |
| Programme | `Barnaamij` | Curriculum |
| Chapitre | `Cutubo` | Division du curriculum |
| Compétence | `Xirfad` | Capacité/savoir-faire |
| Prérequis | `Horuloojeedyo` | Condition avant-requise |
| Analyse | `Falanqayn` | Étude IA |
| Pattern | `Qaab` | Motif de réussite/échec |

---

## Validation checklist

- [ ] Traduire et ajouter **learnos.kpi** (~35 clés)
- [ ] Traduire et ajouter **learnos.planification** (~50 clés)
- [ ] Traduire et ajouter **learnos.import** (~40 clés)
- [ ] Traduire et ajouter **learnos.intelligence** (~20 clés)
- [ ] Traduire et ajouter **learnos.paliers** (~12 clés)
- [ ] Traduire et ajouter **learnos.evolution** (~8 clés)
- [ ] Traduire et ajouter **learnos.prerequis** (~15 clés)
- [ ] Traduire et ajouter **learnos.bot** (~10 clés)
- [ ] Valider avec locuteur natif
- [ ] Exécuter audit i18n : `node scripts/i18n-audit.mjs`
- [ ] Relancer tests i18n : `pnpm test -- --grep "i18n"`

---

**Document créé :** 2026-09-11  
**Destinataire :** Équipe traduction somali
