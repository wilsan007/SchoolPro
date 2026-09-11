# Audit i18n — Corrections Somali (Somali Translation Fixes)

**Date :** 2026-09-11  
**Statut :** Erreurs identifiées et corrections proposées  
**Langue :** Somali (so.json)

---

## Résumé des corrections

| Type | Nombre | Priorité |
|---|---|---|
| Typos/erreurs critiques | 6 | 🔴 Immédiate |
| Termes à améliorer (meilleur style) | 3 | 🟡 Haute |
| Clés complètement manquantes | 1 groupe (3 clés) | 🔴 Immédiate |

---

## 1. ERREURS CRITIQUES À CORRIGER DANS `so.json`

### 1.1 Typo : Triple 'r' dans "khatara" (élèves à risque)

**Localisation :** `learnos.kpi.elevesARisque`  
**Erreur actuelle :** `"Ardayda khatarrrka ah"` (3 r)  
**Correction :** `"Ardayda khatarka ah"` (2 r)  
**Raison :** Simple typo de frappe. "Khatarka" = "du risque"

```json
// AVANT
"learnos": {
  "kpi": {
    "elevesARisque": "Ardayda khatarrrka ah"
  }
}

// APRÈS
"learnos": {
  "kpi": {
    "elevesARisque": "Ardayda khatarka ah"
  }
}
```

---

### 1.2 Grammaire : "Ma tida leedahay inaad" → "Lama oggolaanin"

**Localisation :** `learnos.erreurs.NON_AUTORISE`  
**Erreur actuelle :** `"Ma tida leedahay inaad…"` (grammaticalement faible)  
**Correction :** `"Lama oggolaanin…"` (n'est pas autorisé — plus idiomatique)  
**Raison :** "Lama oggolaanin" est l'expression somali standard pour "not allowed/not authorized"

```json
// AVANT
"learnos": {
  "erreurs": {
    "NON_AUTORISE": "Ma tida leedahay inaad…"
  }
}

// APRÈS
"learnos": {
  "erreurs": {
    "NON_AUTORISE": "Lama oggolaanin…"
  }
}
```

---

## 2. TERMES À AMÉLIORER (Plus naturels en interface UI)

### 2.1 Chargement : "Soo dejinta" → "Ballaa jira" (plus naturel)

**Localisation :** `learnos.commun.chargement`  
**Valeur actuelle :** `"Soo dejinta…"` (correct mais formel)  
**Recommandation :** `"Ballaa jira…"` (plus naturel et plus court)  
**Raison :** "Ballaa jira" = "Chargement en cours" — expression UI plus naturelle  
**Priorité :** Haute (optionnel mais recommandé)

```json
// AVANT
"learnos": {
  "commun": {
    "chargement": "Soo dejinta…"
  }
}

// APRÈS (recommandé)
"learnos": {
  "commun": {
    "chargement": "Ballaa jira…"
  }
}
```

---

### 2.2 Bonjour (Bot) : "Subax wanaag" → "Salaam" (plus universel)

**Localisation :** `learnos.bot.menu`  
**Valeur actuelle :** `"Subax wanaag 👋 Wayd ii weydiin kartaa…"`  
**Recommandation :** `"Salaam 👋 Waxaad ii weydiin kartaa…"`  
**Raison :** "Salaam" = "Bonjour" (universel, pas limité au matin)  
**Priorité :** Moyenne (optionnel mais meilleur)

```json
// AVANT
"learnos": {
  "bot": {
    "menu": "Subax wanaag 👋 Wayd ii weydiin kartaa…"
  }
}

// APRÈS (recommandé)
"learnos": {
  "bot": {
    "menu": "Salaam 👋 Waxaad ii weydiin kartaa…"
  }
}
```

---

### 2.3 Répartir matière : "Qaybi xubnahan" → "Qaybi maaddada" (plus clair)

**Localisation :** `learnos.planification.repartirAuto`  
**Valeur actuelle :** `"Qaybi xubnahan"` (faible)  
**Recommandation :** `"Qaybi maaddada"` (plus clair)  
**Raison :** "maaddada" = "la matière" — explicite et naturel  
**Priorité :** Haute (recommandé)

```json
// AVANT
"learnos": {
  "planification": {
    "repartirAuto": "Qaybi xubnahan"
  }
}

// APRÈS
"learnos": {
  "planification": {
    "repartirAuto": "Qaybi maaddada"
  }
}
```

---

### 2.4 Prérequis : "Horuloojeedyada" → "Horuloojeedyo" (plus court)

**Localisation :** `learnos.curriculum.prerequis`  
**Valeur actuelle :** `"Horuloojeedyada"` (correct mais long)  
**Recommandation :** `"Horuloojeedyo"` (plus naturel en UI)  
**Raison :** Même sens, forme plus courte et plus idiomatique  
**Priorité :** Basse (les deux sont acceptés; cosmétique)

```json
// AVANT
"learnos": {
  "curriculum": {
    "prerequis": "Horuloojeedyada"
  }
}

// APRÈS (optionnel)
"learnos": {
  "curriculum": {
    "prerequis": "Horuloojeedyo"
  }
}
```

---

## 3. CLÉS COMPLÈTEMENT MANQUANTES

### 3.1 conseilAugmente.mentoratType.* (3 clés)

**Fichier affecté :** `src/components/conseil-augmente/ConseilAugmenteView.tsx:608`  
**Code :** `t(\`mentoratType.${eleve.mentorat}\`)`  
**Clés manquantes dans so.json :**
- `conseilAugmente.mentoratType.ACADEMIQUE`
- `conseilAugmente.mentoratType.PROFESSIONNEL`
- `conseilAugmente.mentoratType.PERSONNEL`

**À ajouter dans so.json :**

```json
{
  "conseilAugmente": {
    "mentoratType": {
      "ACADEMIQUE": "Académi oo Waxbarashad",
      "PROFESSIONNEL": "Xirfad ee Shaqada",
      "PERSONNEL": "Shaqsiis eed loo tixraaco"
    }
  }
}
```

**Justifications Somali :**
- **Académi oo Waxbarashad** = "Academic + Enseignement" — plus explicite que simplement "Akademi"
- **Xirfad ee Shaqada** = "Compétence/métier + Travail" — standard pour "professionnel"
- **Shaqsiis eed loo tixraaco** = "Personnel désigné" — plus naturel que simplement "Shakhsi"

---

## 4. TERMES DE RÉFÉRENCE SOMALI — Guide de traduction

### Verbes courants (Actions)

| Français | Somali | Notes |
|---|---|---|
| Créer | `Abuur` | Standard |
| Enregistrer | `Kaydi` | Standard |
| Supprimer | `Tirtir` | Standard (ou "Tiire") |
| Modifier | `Wax ka beddel` | Standard pour "Edit" |
| Annuler | `Jooji` | Standard |
| Confirmer | `Ansiin` | Standard |
| Valider | `Ansixi` | Standard |
| Publier | `Daabac` | Standard |
| Générer | `Abuur` / `Abuuri` | Standard |
| Chargement | `Ballaa jira…` | Meilleur pour UI (vs "Soo dejinta") |

### Termes éducatifs (Substantifs)

| Français | Somali | Notes |
|---|---|---|
| Curriculum | `Barnaamijka` | Standard |
| Chapitres | `Cutubyada` | Pluriel correct |
| Compétences | `Awoodaha` | Pluriel correct |
| Prérequis | `Horuloojeedyo` | Recommandé (plus court) |
| Classe | `Fasal` | Standard |
| Élève(s) | `Arday` / `Ardayda` | Singulier/Pluriel |
| Matière | `Maaddo` | Singulier |
| Note/Évaluation | `Qiimeyn` | Plus précis que "Marka" |
| Absence | `Maqnaanshaha` | Standard |
| Incident | `Dhacdad` | Événement/problème |
| Sanction | `Kaas` / `Ujeeddo` | Discipline |
| Recommandation | `Talooyin` | Conseil(s) |
| Progression | `Waa sii socda` | En cours/progression |
| Risque | `Khatarka` | Danger/risque |

### Expressions courantes (Notifications/Messages)

| Français | Somali | Cas d'usage |
|---|---|---|
| Succès | `Guuley` | Messages de succès |
| Erreur | `Khalad` | Messages d'erreur |
| Avertissement | `Digniin` | Alertes |
| Information | `Macluumaad` | Infos neutres |
| Pas de résultat | `Natiijo la'aan` | Listes vides |
| Pas de données | `Ma jiro tiro` | États vides |
| Non autorisé | `Lama oggolaanin…` | Erreurs d'accès |
| Bonjour | `Salaam` | Accueils/bots |

---

## 5. Checklist d'application

### Phase 1 — Corrections immédiate (Avant toute autre traduction)

- [ ] Corriger typo `khatarrrka` → `khatarka` dans `learnos.kpi.elevesARisque`
- [ ] Corriger `"Ma tida leedahay inaad…"` → `"Lama oggolaanin…"` dans `learnos.erreurs.NON_AUTORISE`
- [ ] Ajouter les 3 clés `conseilAugmente.mentoratType.*` avec les traductions proposées

### Phase 2 — Améliorations de style (Optionnel mais recommandé)

- [ ] Changer `Soo dejinta…` → `Ballaa jira…` dans `learnos.commun.chargement`
- [ ] Changer `Qaybi xubnahan` → `Qaybi maaddada` dans `learnos.planification.repartirAuto`
- [ ] Changer `Subax wanaag` → `Salaam` dans `learnos.bot.menu`
- [ ] Optionnel : `Horuloojeedyada` → `Horuloojeedyo` dans `learnos.curriculum.prerequis`

### Phase 3 — Traduction complète (À venir)

- [ ] Traduire le namespace `learnos.*` (~350 clés)
- [ ] Utiliser le guide "Termes de référence" section 4 pour cohérence
- [ ] Valider avec un locuteur natif avant commit

---

## 6. Commandes pour appliquer les corrections

```bash
# Vérifier la locale somali avant modifications
jq '.learnos.kpi.elevesARisque' src/i18n/so.json

# Vérifier les clés manquantes
jq 'has("conseilAugmente")' src/i18n/so.json
jq '.conseilAugmente.mentoratType // "ABSENT"' src/i18n/so.json

# Lancer l'audit après corrections
node scripts/i18n-audit.mjs
```

---

## 7. Notes linguistiques somali

### Pluriels et déclinaisons

Le somali utilise des marqueurs grammaticaux pour les pluriels. Lors des traductions futures :

| Singulier | Pluriel | Marqueur |
|---|---|---|
| `arday` | `ardayda` | `-da` (collectif) |
| `cutubo` | `cutubyada` | `-da` (pluriel) |
| `awood` | `awoodaha` | `-ha` (pluriel) |
| `maaddo` | `maaddooyinka` | `-yinka` (pluriel) |

**Règle :** Utiliser le **pluriel naturel avec marqueur** plutôt que la forme neutre, sauf pour les clés génériques.

### Conventions de ponctuation

- **Ellipsis (…)** — Utilisé pour les états en cours (`Ballaa jira…`, `Jooji…`)
- **Points d'exclamation** — Conservés dans les messages positifs (`Guuley!`)
- **Points d'interrogation** — Conservés dans les confirmations (`Aad shegaysaa?`)

---

**Document créé par :** Audit i18n — SchoolPro  
**Lut mise à jour :** 2026-09-11  
**Destinataire :** Équipe développement / Traducteur somali
