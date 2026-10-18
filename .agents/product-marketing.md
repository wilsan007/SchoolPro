# Product Marketing Context — SchoolPro / LEARNOS

**Document version:** v2
**Last updated:** 2026-10-13

## Product Overview
**One-liner:** SchoolPro — la gestion scolaire de nouvelle génération, avec LEARNOS, l'intelligence pédagogique qui voit chaque élève avant l'échec. (Tagline officielle : `login.heroTitle` — « La gestion scolaire de nouvelle génération. »)

**What it does:** SaaS multi-tenant de gestion scolaire complet (65 modules : élèves, notes, absences, bulletins, examens, emplois du temps, facturation, RH, caisse, communication) doublé de LEARNOS, un moteur d'intelligence pédagogique 100 % déterministe qui personnalise les exercices, anticipe les difficultés, prévient le décrochage et alerte les familles — toujours sous la validation de l'enseignant.

**Product category:** Logiciel de gestion scolaire (SIGE) + accompagnement pédagogique augmenté — la « étagère » sur laquelle on nous cherche : gestion scolaire numérique Afrique francophone / solution SIGE MENFOP Djibouti.

**Product type:** SaaS B2B multi-tenant (Next.js 15, Prisma, PostgreSQL/Supabase, RLS, 2FA, PWA offline, app mobile Capacitor).

**Business model:** Abonnement par établissement (tenant), multi-sites, facturation mensuelle automatique idempotente (le 1er du mois, 02:00 UTC).

## Target Audience
**Target companies:** Écoles primaires, collèges et lycées francophones — tête de pont Djibouti (MENFOP, aligné GOSE 2.0), extension Afrique francophone. École pilote : École Miriam, Djibouti.

**Decision-makers:** Directeur/directrice d'établissement (decision maker + champion), enseignants (users), comptabilité/secrétariat (financial influence), parents (bénéficiaires + prescripteurs), élèves (usagers finaux — espace `/eleve`), autorités éducatives (MENFOP — légitimation).

**Primary use case:** Remplacer Excel/registres papier par une plateforme unique qui gère l'école ET personnalise le suivi de chaque élève — sans qu'aucune décision pédagogique ne soit prise sans l'enseignant.

**Jobs to be done:**
- Gérer l'établissement sans double saisie (appel → bulletins → factures)
- Voir les difficultés AVANT l'échec (chaque élève, chaque semaine)
- Rejoindre les familles là où elles sont (WhatsApp, trilingue fr/en/so)

**Use cases:**
- Sécrétariat : appel numérique 30s, bulletins générés, facturation automatique
- Enseignants : exercices adaptés au niveau réel de chaque élève, plans de leçon, cahier-journal
- Direction : couverture du programme, tenue des cahiers, 7 indices de santé, simulation de remédiation
- Parents : alertes dosées, bulletins, espace mobile
- Élèves : espace `/eleve` — compétences, évolution, entraînement corrigé instantanément, aucune information financière

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Directeur (decision maker) | Le programme est tenu, aucun élève invisible, pilotage en un chiffre | Surcharge de tableaux, aucun baromètre fiable | 7 indices dont l'ISP ; alertes de décalage ; simulation « combien d'élèves sauvés si je remédie X ? » |
| Enseignant (user/champion) | Moins de paperasse, pédagogie respectée, pas de gadget imposé | Double saisie, remédiation au hasard, élèves hétérogènes | Exercices choisis à la place de l'enseignant sur la marche accessible ; IA propose / il valide ; plans éditables champ par champ |
| Comptabilité/secrétariat | Factures justes, uniques, à l'heure | Retards, doublons, relances | Facturation le 1er à 02:00, unicité garantie en base, notes en centièmes entiers |
| Parent (beneficiary) | Être informé sans être noyé | Coupures de réseau, langue, distance | 1 absence = 1 message (jamais 4/semaine), fr/en/so, WhatsApp, offline |
| Élève (usager final) | Voir ce qu'il sait et ce qui le bloque, sans être étiqueté ni comparé | Notes sans explication, exercices identiques pour tous, correctif tardif | Espace `/eleve` (compétences, évolution — jamais d'info financière) ; exercices sur la marche accessible ; correction instantanée ; maîtrise ≠ confiance |
| Autorité MENFOP (validator) | Alignement GOSE 2.0, données cloisonnées | Outils non conformes, pensés ailleurs | Né à Djibouti, RLS fail-closed, 11 rôles, audit trail |

## Problems & Pain Points
**Core problem:** L'école fonctionne sur Excel et le papier ; aucun croisement des signaux — l'élève à 9,5/20 dont tout baisse passe sous tous les radars jusqu'au jour où il est à 6.

**Why alternatives fall short:**
- Excel/registres — aucune mémoire individuelle, aucune alerte, double saisie permanente
- Logiciels « IA » génériques — décisions opaques, non reproductibles, hallucinations indéfendables devant un parent ; vocabulaire technologique anxiogène
- SIGE internationaux — non trilingues (pas de somali), en ligne seulement, non alignés GOSE 2.0, support lointain
- EcolPro (l'ancienne génération, nôtre) — gestion sans intelligence pédagogique

**What it costs them:** 3 soirées/semaine de retappe, des remédiations au hasard, des décrochages découverts trop tard, des familles débranchées.

**Emotional tension:** « Personne ne m'a prévenu avant le conseil de classe. » La peur que l'échec d'un élève soit un échec de l'école — et la peur (réelle, culturelle) d'une IA qui remplacerait l'enseignant.

## Competitive Landscape
**Direct:** SIGE internationaux (type logiciels de gestion scolaire occidentaux) — tombent court : pas de trilingue fr/en/so, pas de moteur pédagogique déterministe, pas de mode hors-ligne pensé pour le terrain, aucun alignement GOSE 2.0.
**Secondary:** EcolPro / anciennes solutions administratives locales — gestion pure, zéro pédagogie augmentée, aucun suivi individualisé.
**Indirect:** Excel + registres papier + WhatsApp informel — aucun croisement de signaux, aucune traçabilité, données perdues chaque année.

## Differentiation
**Key differentiators:**
- LEARNOS : chaque élève a un profil de maîtrise + confiance ; l'oubli se projette (demi-vie, vacances creuses) ; le décrochage silencieux (≥ 8/20 mais tout baisse) est signalé avant la chute
- Exercices sur la **marche accessible** : un élève bloqué sur la proportionnalité reçoit des exercices sur ses FRACTIONS manquantes — pas de répétition bébète ; les élèves avancés reçoivent une stimulation, pas du silence
- **Reproductible et opposable** : deux élèves identiques = mêmes recommandations, justifiables devant un parent ; l'IA rédige des énoncés en amont, ne décide jamais
- Notes en centièmes entiers (14,50 → 1450) ; cloisonnement fail-closed (un filtre vide = « aucun »)
- Trilingue natif fr/en/so, hors-ligne par design, WhatsApp/SMS/push signés, né à Djibouti
- L'IA propose, l'enseignant valide — jamais d'écriture automatique dans le graphe

**How we do it differently:** Des moteurs déterministes (comparaisons de seuils, graphes, statistiques) pour toutes les décisions ; l'IA générative cantonnée à la rédaction en amont (énoncés, plans de leçon, prérequis proposés) avec validation humaine systématique.

**Why that's better:** Défendable (contestations), économique (0 appel par correction), auditable (JournalApprentissage, motifs d'écartement conservés), et rassurant pour des équipes non initiées.

**Why customers choose us:** Le seul qui gère l'école ET chaque élève, dans la langue des familles, sans jamais retirer la décision à l'enseignant.

## Objections
| Objection | Response |
|-----------|----------|
| « L'IA va remplacer les enseignants » / peur de l'IA | Tout passe par « Il propose. Vous décidez. » Aucune écriture sans validation ; les alertes écartées sont conservées avec leur motif ; l'IA n'invente jamais — sous le seuil de preuves, le statut est « aucune conclusion ». |
| « Nos enseignants ne sont pas à l'aise avec le numérique » | Appel en 30 secondes ; leçon clôturée en un clic ; plans éditable champ par champ ; mode hors-ligne ; trilingue ; l'entraînement élève est autonome et ne mobilise pas l'enseignant. |
| « On a déjà un logiciel / Excel fonctionne » | Excel ne croise aucun signal : le programme tenu, la tenue des cahiers, l'oubli des vacances et l'absence du lundi ne sont visibles nulle part ailleurs. |
| « Est-ce fiable pour les notes ? » | Moyennes en centièmes entiers — l'erreur d'arrondi n'existe pas ; 161 fichiers de tests ; 29 migrations additives ; chaque recommandation montre ses preuves (0,88 de confiance, 3 compétences en aval dépendent d'elle). |
| « Le réseau tombe souvent » | Hors-ligne par design : la donnée attend et repart. PWA + app mobile. |
| « Et si ça nous alerte trop ? » | 1 déclencheur = 1 message (empreinte unique) ; le parent choisit son seuil ; plafond hebdomadaire ; toute alerte écartée garde son motif — la réponse à « pourquoi ne m'a-t-on pas prévenu ? » existe toujours. |

**Anti-persona:** Établissements cherchant uniquement une gestion administrative au rabais, sans suivi pédagogique, refusant tout investissement de formation — et les environnements qui veulent une IA « magique » qui décide toute seule.

## Switching Dynamics
**Push:** Retappes nocturnes, décrochages découverts trop tard, factures en retard, familles injoignables.
**Pull:** Une seule plateforme qui gère l'école et voit chaque élève, trilingue, née à Djibouti.
**Habit:** Excel connu de tous ; peur du changement ; « on a toujours fait comme ça ».
**Anxiety:** Peur de perdre des données, peur de l'IA, peur que les enseignants bloquent l'adoption → réponses : migrations additives, validation humaine partout, formation appel/cahier en un geste.

## Customer Language
**How they describe the problem:**
- « On découvre les difficultés au conseil de classe, quand c'est trop tard. »
- « Certains élèves s'ennuient et personne ne le voit. »
- « Les parents disent qu'on ne les prévient pas — ou trop tard. »
- « Le programme a pris deux semaines de retard sans qu'on sache laquelle. »

**How they describe us:**
- « Il se tait quand tout va bien. »
- « Il propose, je décide. »
- « Il sait dire "je ne sais pas". »

**Words to use:** SchoolPro voit / remarque / montre ses preuves / garde la mémoire / anticipe ; intelligence pédagogique (badge discret) ; l'enseignant valide ; la marche accessible ; vacances creuses ; décrochage silencieux.

**Words to avoid:** IA, LLM, algorithme, modèle, déterministe, génératif, jumeau numérique, machine learning, automatique (pour toute décision pédagogique).

**Glossary:**
| Term | Meaning |
|------|---------|
| LEARNOS | Le moteur d'intelligence pédagogique de SchoolPro (badge : « intelligence pédagogique ») |
| Maîtrise / Confiance | Les deux chiffres du suivi d'un élève, jamais confondus |
| Marche accessible | Le prérequis manquant, pas la compétence visée — c'est l'exercice réellement utile |
| Vacances creuses | La projection de l'oubli sur les vacances, pour réviser avant le départ |
| Décrochage silencieux | L'élève ≥ 8/20 dont tout baisse : invisible des bulletins, visible dans SchoolPro |
| Empreinte d'alerte | La garantie qu'un même événement ne produit qu'un seul message parent |

## Brand Voice
**Tone:** Direct, chaleureux, précis. Punchy startup avec gravité institutionnelle. Jamais technologique anxiogène — on parle d'élèves, d'enseignants et de familles, pas de machines.
**Style:** Phrases courtes. Faits assénés, tenus. Chiffres exacts. Humour discret accepté (« Excel n'est pas un logiciel scolaire — on dit ça avec affection »).
**Personality:** Sobre, fidèle, humble (le système sait dire « je ne sais pas »), fier de son ancrage djiboutien.

## Proof Points
**Metrics:** 65 modules · 161 fichiers de tests · 29 migrations additives · 3 langues natives · 11 rôles · 0 appel de modèle pour décider · facturation idempotente (unicité garantie en base) · correction instantanée des exercices.
**Customers:** École Miriam, Djibouti (école pilote). Alignement GOSE 2.0 — MENFOP Djibouti.
**Testimonials:**
> *(à collecter en pilote — placeholders prêts dans les 6 vidéos)*
**Value themes:**
| Theme | Proof |
|-------|-------|
| Efficacité | Courbe de l'oubli projetée avant les vacances ; prédiction par chapitre vérifiée a posteriori (boucle ±0,15) |
| Productivité | Appel 30s ; bulletins générés ; factures parties le 1er à 02:00 |
| Efficience | Notes en centièmes entiers ; cloisonnement fail-closed ; RLS PostgreSQL |
| Particularité | L'IA propose, l'enseignant valide ; prédictions vérifiées ; alertes conservées avec motif |

## Goals
**Business goal:** Devenir le SIGE de référence à Djibouti (MENFOP), puis l'Afrique francophone.
**Conversion action:** Demander une démo / ouvrir un établissement pilote.
**Current metrics:** 6 vidéos marketing produites (3×25s + 3×45s, 9:16) ; analyse de produit complète ; cette context v2.

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-10-13) — Ajout du persona **Élève** (usager final) parmi les cibles principales ; decision-makers, use cases et personas mis à jour pour que FORCE-DE-VENTE.md s'adresse aux 4 publics : directeur, enseignant, parent, élève.
- v1 (2026-10-13) — Initial context, drafted from codebase analysis (LEARNOS engines, AGENTS.md, DESIGN.md, i18n) + contrainte de perception anti-peur de l'IA fournie par l'utilisateur.
