# EcolPro / LEARNOS — Recommandations, plans de progression, espaces par rôle

> Complète [learnos-integration-plan.md](learnos-integration-plan.md).
> Ce document spécifie trois briques : le **système de recommandation universel**,
> le **plan de progression suivi**, et les **espaces par rôle avec leurs KPI**.

---

## 0. Principe directeur

Trois règles gouvernent tout ce qui suit. Les enfreindre rendrait le système
inutilisable, quelle que soit la qualité du reste.

**1. Ne pas noyer.** Un système qui recommande quelque chose à tout le monde
n'est pas lu. La bande « consolidé » ne produit **délibérément aucune
recommandation** : c'est ce silence qui donne du poids aux autres.

**2. Ne rien dire sans preuve suffisante.** Une maîtrise basse mesurée par une
seule interrogation n'est pas une difficulté avérée. Sous le seuil de confiance,
le système se tait — « nous n'en savons pas assez » n'est pas « il ne maîtrise
pas ». Cette distinction vient directement de la séparation
`masterySignal` / `confidence` du moteur de preuves (P3-B).

**3. Rien d'automatique n'engage l'établissement.** Une recommandation est
proposée, un plan est validé par un humain, une alerte parent est encadrée.
L'IA prépare la décision ; elle ne la prend pas.

---

## 1. Système de recommandation universel

### 1.1 Le manque à combler

Les dispositifs d'accompagnement existants ne visent que les élèves en
difficulté. Un élève qui maîtrise vite s'ennuie sans que rien ne le signale —
c'est une perte au moins aussi coûteuse qu'un décrochage, et totalement
invisible aujourd'hui.

**Le système couvre donc tout le spectre**, sans rendre l'accompagnement
obligatoire pour autant.

### 1.2 Les cinq bandes

Déterminées par `StudentLearningProfile.masteryScore` (0..1), **sous réserve**
que `confidenceScore` dépasse le seuil de fiabilité.

| Bande | Maîtrise | Ce qu'on en fait | Statut par défaut |
|---|---|---|---|
| `CRITIQUE` | < 0,35 | Reprise du prérequis manquant | **Obligatoire** si bloquant, sinon recommandé |
| `FRAGILE` | 0,35 – 0,55 | Consolidation ciblée | Recommandé |
| `CONSOLIDE` | 0,55 – 0,80 | **Rien** — silence volontaire | — |
| `AVANCE` | 0,80 – 0,92 | Approfondissement | Proposé (facultatif) |
| `EXCELLENCE` | > 0,92 | Enrichissement, défi, tutorat | Proposé (facultatif) |

**Seuils configurables par établissement**, et affinables par niveau scolaire ou
par matière : un 0,55 en terminale scientifique et en CE1 ne disent pas la même
chose.

### 1.3 Trois statuts, trois régimes

| Statut | Qui décide | Suivi |
|---|---|---|
| `OBLIGATOIRE` | L'établissement impose | Suivi, relancé, évalué |
| `RECOMMANDEE` | L'enseignant valide ou écarte | Suivi si acceptée |
| `PROPOSEE` | L'élève ou le parent choisit | Suivi seulement si accepté |

Une recommandation `PROPOSEE` non retenue n'est **ni relancée, ni comptée
comme un échec**. C'est ce qui rend l'enrichissement acceptable : proposer sans
contraindre.

### 1.4 Escalade vers l'obligatoire

Une bande `CRITIQUE` ne devient obligatoire que si la compétence **bloque la
suite** : le graphe de prérequis compte les compétences en aval qu'elle
conditionne. Au-delà du seuil (défaut : 2), l'accompagnement devient obligatoire
— sans quoi l'élève accumulera un retard mécanique.

### 1.5 Explicabilité obligatoire

Toute recommandation porte :
- son **motif** en français lisible ;
- les **identifiants des preuves** qui la fondent (`evidenceRefs`) ;
- la **règle** qui l'a déclenchée.

Une recommandation qu'on ne peut pas justifier devant un parent ne doit pas
exister.

---

## 2. Plan de progression

### 2.1 Ce que c'est

Quand les recommandations s'accumulent, elles cessent d'être une liste et
deviennent **un parcours daté, attribué et vérifié**. C'est l'équivalent
numérique d'un programme personnalisé de réussite éducative — objet
institutionnel reconnu, pas une invention.

### 2.2 Déclenchement (configurable)

Un plan est **proposé** — jamais activé seul — quand l'une de ces conditions est
remplie :

| Situation | Condition par défaut |
|---|---|
| Difficultés multiples | ≥ 2 compétences `CRITIQUE` |
| Blocage structurel | 1 compétence `CRITIQUE` bloquant ≥ 3 compétences en aval |
| Dégradation | Tendance baissière sur ≥ 3 compétences d'une même matière |
| **Potentiel élevé** | ≥ 3 compétences `AVANCE`/`EXCELLENCE` dans une matière |

La dernière ligne est essentielle : **un plan d'approfondissement se déclenche
comme un plan de remédiation.** Même mécanique, finalité opposée.

### 2.3 Cycle de vie

```
BROUILLON → PROPOSE → [validation humaine] → ACTIF → EN_REVUE → TERMINE
                            ↓ refus                      ↓ échec
                        ABANDONNE                    révision du plan
```

La validation revient au professeur principal (`CLASS_TEACHER`) ou au CPE
(`COUNSELOR`) selon la nature du plan. **Aucun plan ne devient actif sans
signature humaine.**

### 2.4 Structure

Un plan = des **étapes**, chacune portant :

- la **compétence visée** ;
- l'**action** (exercice, séance de soutien, tutorat, projet) ;
- un **responsable** — enseignant, parent, ou l'élève lui-même ;
- une **échéance** ;
- un **jalon de vérification** : le retest qui l'atteste.

### 2.5 La boucle qui se referme

Le jalon de vérification est une évaluation ordinaire. Elle produit donc une
`LearningEvidence` par le moteur existant, qui met à jour le profil de maîtrise,
qui clôt l'étape. **Aucun mécanisme de suivi parallèle** : le plan se mesure
avec les mêmes preuves que le reste.

`masteryBefore` / `masteryAfter` sur l'intervention permettent de dire si le
plan a servi — et d'écarter les dispositifs sans effet.

---

## 3. Bot parent — du guichet au suivi

### 3.1 Deux régimes

**À la demande (pull)** — le parent écrit sur WhatsApp :

| Question | Réponse |
|---|---|
| « Moyenne de Amina ? » | Moyenne, rang, tendance |
| « Absences ? » | Détail justifié / non justifié |
| « Combien je dois ? » | Solde, échéance, moyens de paiement |
| « Où en est son plan ? » | Étapes faites / en cours / à venir |
| « Comment l'aider ? » | La prochaine action concrète, à sa portée |

**Proactif (push)** — l'établissement informe sans être sollicité :

| Niveau | Déclencheur | Exemple |
|---|---|---|
| `INFO` | Jalon atteint, progrès net | « Amina a validé l'étape 2 : les fractions sont acquises. » |
| `ATTENTION` | Absences répétées, baisse | « 3 absences non justifiées cette semaine. » |
| `URGENT` | Plan non suivi, décrochage | « Le plan de Amina est à l'arrêt depuis 3 semaines. » |

### 3.2 Le parcours de l'enfant — ce que le parent voit

Au-delà des chiffres, un récit court et honnête :

> **Amina Hassan — 5ème B**
> Acquis ce trimestre : proportionnalité, périmètres
> En cours : équations du 1er degré *(étape 2 du plan, échéance 30 mars)*
> À reprendre : fractions — **c'est ce qui bloque le reste**
> Tendance : ↗ en progression depuis février
>
> **Vous pouvez l'aider :** 15 min sur les fractions cette semaine → *[exercice]*

La dernière ligne compte plus que les autres. Un parent qui reçoit un constat ne
peut rien faire ; un parent qui reçoit **une action de quinze minutes** peut agir.

### 3.3 Garde-fous — non négociables

| Risque | Protection |
|---|---|
| Fuite de données | Numéro **obligatoirement** rattaché via `EleveParent` ; jamais de réponse à un numéro inconnu |
| Enfant multiple | Désambiguïsation explicite si le parent a plusieurs enfants |
| Harcèlement | Plafond de messages sortants par semaine, configurable |
| Refus | Désinscription des notifications à tout moment, sans perdre l'accès aux réponses à la demande |
| Contestation | Chaque réponse journalisée (qui, quoi, quand) |
| Invention | Le LLM **comprend** la question et **formule** la réponse ; les données viennent de requêtes SQL. Aucun chiffre n'est produit par le modèle. |

---

## 4. Espaces par rôle et KPI

### 4.1 Le problème actuel

L'application est organisée **par fonction** (notes, facturation, RH…), pas
**par rôle**. Chaque utilisateur doit savoir où chercher. Un enseignant n'a pas
besoin de « facturation » ; un comptable n'a rien à faire dans « évaluations ».

**Il n'existe par ailleurs ni espace parent, ni espace élève** — alors que ce
sont les deux populations les plus nombreuses.

### 4.2 Principe : un espace = un rôle = trois questions

Chaque espace répond à trois questions, dans cet ordre :

1. **Que dois-je faire aujourd'hui ?** (actions en attente)
2. **Qu'est-ce qui ne va pas ?** (alertes)
3. **Où en sommes-nous ?** (KPI de tendance)

Un KPI qui n'appelle aucune action n'a pas sa place.

### 4.3 Direction — `TENANT_ADMIN` / `PRINCIPAL` → `/direction`

| KPI | Définition | Seuil d'alerte |
|---|---|---|
| Couverture du programme | chapitres validés / prévus à date | < 80 % du prévu |
| Saisie des notes | notes saisies / attendues à J-5 | < 90 % |
| Élèves à risque | profils de décrochage actifs | tendance croissante |
| Recouvrement | encaissé / facturé sur la période | < objectif |
| Écart de calibrage | dispersion du signal à compétence égale | > 2 écarts-types |
| Plans actifs | plans en cours, dont en retard | > 20 % en retard |
| Dossiers incomplets | élèves sans pièce obligatoire | > 0 |

**⚠️ Sur le calibrage :** un écart n'est pas une faute — classe difficile,
exigence assumée, ou vrai problème. **À présenter comme une question à poser, et
réservé au chef d'établissement.** Mal employé, cet indicateur détruit la
confiance des enseignants et vous fait perdre l'usage de l'outil.

### 4.4 Enseignant — `TEACHER` → `/mon-espace`

| KPI | Définition |
|---|---|
| Mes saisies en retard | évaluations sans notes, échéance dépassée |
| Élèves à traiter cette semaine | recommandations obligatoires me concernant |
| Ma progression | chapitres traités / prévus |
| Compétences les moins acquises | top 3 par classe — *où porter l'effort* |
| Mes plans | étapes dont je suis responsable, échéance proche |

### 4.5 Professeur principal — `CLASS_TEACHER` → `/ma-classe`

Tout ce qui précède, plus : profil de maîtrise agrégé de la classe, élèves à
risque, plans actifs, assiduité, préparation du conseil de classe.

### 4.6 Vie scolaire — `COUNSELOR` → `/vie-scolaire`

| KPI | Définition |
|---|---|
| Dossiers en alerte | élèves croisant ≥ 2 signaux (absences, notes, incidents, impayés) |
| Absentéisme chronique | > seuil d'absences non justifiées sur 30 jours |
| Incidents | tendance + motifs récurrents (créneau, lieu, classe) |
| Plans de suivi | actifs, en retard, clos avec succès |

### 4.7 Finance — `ACCOUNTANT` → `/finance`

Taux de recouvrement · créances par ancienneté (0-30 / 30-60 / 60-90 / 90+) ·
efficacité des relances par canal · exclusions financières actives ·
prévision d'encaissement.

### 4.8 Secrétariat — `SECRETARY` → `/secretariat`

Dossiers incomplets · inscriptions en cours · documents à produire ·
attestations demandées.

### 4.9 Infirmerie — `NURSE` → `/infirmerie`

Élèves à besoins particuliers · allergies · contacts d'urgence manquants.

### 4.10 Parent — `PARENT` → `/parent`

Parcours de l'enfant · plan en cours et prochaine étape · assiduité · solde ·
**la chose concrète à faire cette semaine**.

### 4.11 Élève — `STUDENT` → `/eleve`

| Ce qu'il voit | Pourquoi |
|---|---|
| Mes compétences (acquis / en cours / à reprendre) | Plus parlant qu'une moyenne |
| **Ma prochaine étape** | La seule chose qu'un élève en difficulté ne sait jamais |
| Mes progrès | Rendre visible ce qui avance |
| Mes défis *(si niveau avancé)* | Ne pas laisser s'ennuyer |

---

## 5. Modèle de données

```prisma
enum NiveauRecommandation { CRITIQUE FRAGILE CONSOLIDE AVANCE EXCELLENCE }
enum StatutRecommandation { OBLIGATOIRE RECOMMANDEE PROPOSEE ACCEPTEE ECARTEE }
enum StatutPlan { BROUILLON PROPOSE ACTIF EN_REVUE TERMINE ABANDONNE }
enum StatutEtape { A_FAIRE EN_COURS FAIT VALIDE ECHOUE }
enum NiveauAlerteParent { INFO ATTENTION URGENT }

/// Seuils par établissement, affinables par niveau et matière.
model SeuilsRecommandation {
  tenantId, siteId?, niveau?, matiereId?
  seuilCritique, seuilFragile, seuilConsolide, seuilAvance  // 0..1
  confianceMinimale        // sous ce seuil : aucune recommandation
  prerequisBloquantsMin    // au-delà : CRITIQUE devient OBLIGATOIRE
  declenchementPlanCritiques, declenchementPlanAvances
}

/// Une recommandation, toujours justifiée.
model Recommandation {
  tenantId, siteId?, eleveId, competenceId
  niveau NiveauRecommandation
  statut StatutRecommandation
  motif String            // explicabilité — lisible par un parent
  regleDeclenchee String  // quelle règle, pour l'audit
  evidenceRefs String[]   // les preuves qui la fondent
  actionProposee String
  planId?                 // rattachée si consolidée en plan
  decideParId?, decideeLe?
}

/// Le parcours suivi, validé par un humain.
model PlanProgression {
  tenantId, siteId?, eleveId
  type            // "remediation" | "approfondissement"
  origine         // "automatique" | "manuel"
  statut StatutPlan
  motif String
  responsableUserId, valideParId?, valideLe?
  dateDebut?, dateRevue?, dateFin?
  parentInforme Boolean
  resultat?, masteryAvant?, masteryApres?
  etapes EtapePlan[]
}

model EtapePlan {
  planId, competenceId, ordre
  action String
  responsable     // "enseignant" | "parent" | "eleve"
  echeance?
  statut StatutEtape
  evaluationJalonId?   // le retest qui valide
  evidenceValidanteId? // la preuve produite
}

/// Notifications sortantes vers les parents, encadrées.
model AlerteParent {
  tenantId, siteId?, eleveId, parentId
  niveau NiveauAlerteParent
  type            // "assiduite" | "jalon" | "plan_arrete" | "progres"
  message String
  canal           // "whatsapp" | "sms" | "email"
  envoyeeLe?, lueLe?
  planId?
}

/// Préférences et consentement du parent.
model PreferencesParent {
  parentId (unique)
  canalPrefere, notificationsActives Boolean
  frequenceMax Int   // messages/semaine
  langue             // fr | ar | so
}

/// Historique des KPI, pour afficher une tendance et non un instantané.
model KpiSnapshot {
  tenantId, siteId?, role, kpiKey
  valeur Float, cible Float?
  periode DateTime
  @@unique([tenantId, siteId, role, kpiKey, periode])
}
```

---

## 6. Phasage proposé

| Lot | Contenu | Dépend de | Charge |
|---|---|---|---|
| **P4** | Learning Twin — profil de maîtrise agrégé | P3-B ✅ | 3 j |
| **P9-A** | Seuils + moteur de recommandation (déterministe) | P4 | 3 j |
| **P9-B** | Plans de progression + validation + suivi | P9-A | 4 j |
| **P9-C** | Jalons ↔ retests (boucle de vérification) | P9-B, P3-A ✅ | 2 j |
| **P10-A** | Socle KPI + `KpiSnapshot` + calcul planifié | P4 | 2 j |
| **P10-B** | Espaces direction / enseignant / classe | P10-A | 4 j |
| **P10-C** | Espaces parent et élève | P10-B | 4 j |
| **P11-A** | Bot parent — questions à la demande | P10-C | 4 j |
| **P11-B** | Bot parent — alertes proactives + suivi de plan | P11-A, P9-C | 3 j |

**Préalable technique :** ramener les tâches planifiées à **un seul cron**
dispatcheur. Le palier Vercel Hobby en limite le nombre, et tout ce document
repose sur du travail périodique.

---

## 7. Ce qui reste sans LLM

La quasi-totalité. Le modèle n'intervient que pour **lire ou écrire du français** :

| Sans LLM (déterministe, gratuit, reproductible) | Avec LLM |
|---|---|
| Bandes, seuils, escalade | Comprendre une question de parent |
| Déclenchement des plans | Formuler la réponse |
| Parcours du graphe de prérequis | Rédiger le motif d'une recommandation |
| Tous les KPI | Générer un exercice de remédiation |
| Détection de décrochage | Rédiger la synthèse d'un conseil de classe |
| Suivi des étapes et jalons | Qualifier un type d'erreur (P5) |
