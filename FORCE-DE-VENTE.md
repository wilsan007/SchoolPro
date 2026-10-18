# SchoolPro — FORCE DE VENTE
### L'argumentaire commercial complet · La différenciation LEARNOS, tracée dans le code

> **Usage** : ce document est l'outil de vente de la plateforme. Chaque affirmation est
> ancrée dans un moteur réel de `src/lib/learnos/` (référence entre parenthèses).
> Règle de langage absolue : on ne prononce jamais « IA / algorithme / modèle » face au
> client — on vend des comportements : *il voit, il propose, il se tait, il montre ses
> preuves, vous décidez.* (Voir §8.)

---

## 1. Le pitch

**30 secondes — pour un directeur :**
« SchoolPro gère toute votre école — appel, bulletins, facturation, emplois du temps —
et fait ce qu'aucun logiciel ne fait : il suit chaque élève, compétence par compétence.
Il voit celui qui glisse avant que la moyenne ne chute. Il voit celui qui s'ennuie parce
qu'il maîtrise trop vite. Il propose des exercices taillés pour chacun — sur la marche
accessible, pas sur la marche visée. Et il ne décide jamais à votre place : il propose,
vous validez. »

**Pour un enseignant :**
« Vos exercices de rattrapage sont choisis à votre place : un élève bloqué sur la
proportionnalité ne reçoit pas de proportionnalité — il reçoit les fractions qui lui
manquent. Vos élèves avancés reçoivent de quoi être stimulés au lieu de s'ennuyer. Les
plans de leçon arrivent structurés, éditables champ par champ. Le cahier-journal se
clôture en un clic et met la planification à jour tout seul. L'entraînement est
autonome : l'élève travaille seul, corrigé instantanément — vous ne corrigez rien de plus. »

**Pour un parent :**
« Une absence = un message, le jour même, sur WhatsApp, en français, en anglais ou en
somali. Jamais quatre messages par semaine — le système plafonne lui-même. Et quand il
ne sait pas, il le dit : il n'invente rien. »

**Pour un élève :**
« Ton espace te montre ce que tu sais vraiment, compétence par compétence, et ce qui
te bloque — pas juste une note qui tombe sans explication. Tu t'entraînes, tu es corrigé
tout de suite, tu recommences jusqu'à ce que ce soit acquis. Et quand tu vaux mieux que
la moyenne, on ne t'oublie pas : on te pousse plus loin. »

**Pour une autorité (MENFOP) :**
« Né à Djibouti, trilingue natif, aligné GOSE 2.0, cloisonnement par établissement
fail-closed, chaque recommandation reproductible et justifiable. »

---

## 2. Les 12 piliers de différenciation

### PILIER 1 — Des exercices taillés pour CHAQUE élève
*La promesse que personne d'autre ne tient.*

- **Retard → rattrapage chirurgical.** Un élève en difficulté critique sur
  « proportionnalité » ne reçoit pas des exercices de proportionnalité. Il reçoit des
  exercices sur **les fractions — son prérequis manquant**. C'est la différence entre
  un exercice adapté et un exercice répété : on travaille la **marche accessible**, pas
  la marche visée. Il rattrape son niveau au lieu de s'enfoncer.
  *(exercice-selector.ts : « On travaille la marche accessible, pas la marche visée »)*
- **Avance → stimulation, jamais du silence.** Un élève qui maîtrise vite s'ennuie
  en silence — une perte aussi coûteuse qu'un décrochage, et invisible partout
  ailleurs. Ici, les bandes hautes (AVANCE, EXCELLENCE) déclenchent autant que les
  bandes basses : il est poussé vers davantage, il reste mobilisé.
  *(recommendation-engine.ts : « Couvrir tout le spectre »)*
- **Rien n'est imposé sans mesure.** Sous le seuil de confiance, aucun exercice de
  remédiation : on sonde d'abord. Traiter l'ignorance du système comme une difficulté
  de l'élève serait une faute. *(exercice-selector.ts : « On ne remédie pas à ce
  qu'on n'a pas mesuré »)*
- **Entraînement autonome, correction instantanée.** L'élève travaille seul : les
  étapes se révèlent une à une, chaque réponse est corrigée immédiatement, la séance
  terminée devient une **preuve d'apprentissage** qui nourrit son profil.
  *(entrainement.ts)*
- **La même copie vaut toujours la même chose.** Corrigée deux fois, une réponse
  donne deux fois la même note — une contestation parentale est défendable.
  *(entrainement.ts : correction par comparaison, instantanée)*
- **Des énoncés rédigés en amont, jamais crus sur parole.** Chaque question générée
  passe une validation structurelle ; ce qui ne passe pas est jeté. Les questions
  relues par un enseignant ne peuvent jamais être écrasées. *(generation-questions.ts :
  « La sortie est validée, pas crue »)*

**Phrase de vente :** « Vos exercices ne sont pas "adaptatifs" à la mode — ils sont
justes : le prérequis manquant, au bon palier, pour chaque élève. Et votre bon élève
reçoit enfin de quoi ne pas s'ennuyer. »

### PILIER 2 — Le parcours personnel de chaque élève
- Chaque élève suit un **parcours signé** : le sélecteur croise son profil de maîtrise,
  le graphe de prérequis et la position de sa classe dans l'année pour décider **quoi
  travailler maintenant, à quel palier**. *(exercice-selector.ts)*
- Des **objectifs atteignables** remplacent la masse : la planification découpe
  l'année (chapitres → compétences), respecte vacances et examens, et chaque séance
  clôturée met à jour la progression réelle. *(planification.ts, boucle-cahier-journal.ts)*
- Les **plans de leçon sont structurés, pas en texte libre** : objectifs, durée,
  étapes, matériel, évaluation — éditables champ par champ, jamais imposés. C'est un
  point de départ, pas un script. *(plan-lecon.ts)*

**Phrase de vente :** « Un plan par élève, des objectifs à sa portée, une progression
qui se met à jour toute seule quand vous clôturez une séance. »

### PILIER 3 — Prévoir les notes avant de les subir
- Avant chaque chapitre, pour chaque élève : « **X % de chances de réussir cette
  compétence** » — calculé sur son profil, ses prérequis manquants, les patterns
  historiques de son niveau, sa tendance et son assiduité. *(prediction-engine.ts)*
- **Le système sait s'il prédit bien.** Chaque prédiction est comparée à la réalité
  a posteriori (à ±0,15 près) ; les écarts recalibrent les seuils. Ce n'est pas une
  boule de cristal : c'est une boucle d'apprentissage vérifiée.
  *(prediction-engine.ts : « La boucle d'apprentissage » ; CalibrationSeuil)*
- L'enseignant entre dans le chapitre en sachant **qui va décrocher et pourquoi** —
  et peut agir avant la première note.

**Phrase de vente :** « Votre conseil de classe ne découvrira rien : les difficultés
étaient prévues, avec leur raison, avant le premier contrôle. »

### PILIER 4 — Le décrochage silencieux n'existe plus
- L'élève à 7/20 est déjà repéré. Le danger est **l'élève à 9,5/20** dont la maîtrise
  baisse sur trois compétences, qui s'absente de plus en plus — mais dont la moyenne
  n'a pas encore basculé. Personne ne le signale : SchoolPro, oui.
  *(risque-decrochage.ts : « intervenir AVANT la chute visible »)*
- **Score de risque 0-100 par élève**, cinq signaux pondérés : maîtrise en baisse
  (40 %), absences (25 %), incidents (15 %), impayés (10 %), absence de plan actif
  (10 %). *(risque-decrochage.ts)*

**Phrase de vente :** « Le décrochage le plus dangereux est invisible sur le bulletin.
Le nôtre l'attrape à 9,5/20 — avant la chute. »

### PILIER 5 — Compétences acquises, prérequis à travailler : le graphe le dit
- Chaque élève affiche ses **compétences maîtrisées, consolidées, fragiles, critiques**
  — et la **confiance** de chaque estimation, jamais confondue avec la maîtrise.
  *(learning-twin.ts)*
- Le **graphe de prérequis** répond à la question que tout parent pose : « c'est quoi
  qui bloque le reste ? » Une compétence CRITIQUE ne devient urgente que si elle
  bloque réellement la suite. *(recommendation-engine.ts, graphe-curriculum.ts)*
- Relier 50 compétences à la main, c'est jusqu'à **2 450 couples** à examiner : aucun
  enseignant ne le fera. SchoolPro propose les liaisons, **filtre** celles qui
  créeraient des cycles ou des blocs erronés, et explique **pourquoi** une liaison
  plausible a été écartée — l'enseignant accepte ou refuse, et rien ne s'écrit sans
  lui. *(prerequis-proposes.ts : « L'écart est l'information »)*

**Phrase de vente :** « Quand un élève est bloqué, on ne vous dit pas "il est faible".
On vous dit : c'est ÇA qui bloque, et ça, ça tient debout. »

### PILIER 6 — Le cahier-journal qui veille sur le programme
- **Clôture en un clic → tout se met à jour.** Marquer une séance EFFECTUEE met à jour
  les statuts de planification de chapitre et de compétence, reflète le réel —
  idempotent : re-clôturer ne crée jamais de doublon. *(boucle-cahier-journal.ts)*
- **Quatre verdicts par semaine, sans interroger personne** : ALIGNE (prévu + déclaré +
  preuves élèves) · DÉCLARÉ_SEUL (l'enseignant dit avoir fait, aucune preuve élève ne le
  confirme) · RÉALISÉ_NON_DÉCLARÉ (les élèves ont travaillé, le cahier n'est pas tenu) ·
  **DÉCALAGE — alerte : rien n'a été fait et ce n'est pas documenté.**
  *(alerte-decalage.ts : trois signaux croisés, prévu/déclaré/réalisé)*
- **La tenue du cahier par enseignant est mesurée** : séances attendues (emploi du
  temps) vs séances documentées — un taux < 50 % signale un cahier non tenu.
  *(suivi-programme.ts)*
- **Les retards se voient en semaines** : chaque ajustement de plan est comparé au
  plan initial ; une dérive > 2 semaines mérite une question, pas un verdict.
- **Les devoirs en retard sont détectés et signalés** — une seule fois par devoir,
  jamais un spam quotidien. *(devoirs-retard-check.ts : idempotence)*
- **Le baromètre programme du directeur** : par classe × matière, ce qui aurait dû
  être traité vs ce qui l'est réellement. *(suivi-programme.ts)*

**Phrase de vente :** « Votre programme ne prend plus deux semaines de retard en
silence : chaque semaine est alignée, déclarée, prouvée — ou alertée. »

### PILIER 7 — Les familles prévenues, jamais noyées
- **Une absence = un message. Une seule fois.** Chaque alerte porte une empreinte
  unique : le système peut passer dix fois, la même absence ne produira jamais dix
  messages. *(alertes-parent.ts : idempotence par empreinte)*
- **Le parent décide** : il choisit s'il reçoit, et à partir de quelle gravité. Un
  **plafond hebdomadaire** protège le canal même quand tout est légitime — car une
  famille qui reçoit quatre messages par semaine coupe tout, au pire moment.
- **Chaque alerte écartée est conservée avec son motif.** La question
  « pourquoi ne m'a-t-on pas prévenu ? » a toujours une réponse, inscrite.
- **Les absences récurrentes deviennent lisibles** : « toujours le lundi »,
  « toujours en mathématiques », « toujours en début de mois » — un signal
  structurel, pas une impression. *(pattern-absence.ts)*
- **L'engagement des familles est mesuré** et corrélé à la réussite : l'école sait ce
  qui marche avec les parents. *(engagement-parental.ts)*

**Phrase de vente :** « Le parent est prévenu le jour même, dans sa langue, sur
WhatsApp — et il reste abonné parce que vous ne le noyez pas. »

### PILIER 8 — Une mémoire fidèle qui ne punit pas
- **La récence pondère, elle ne pénalise pas.** Une preuve ancienne compte moins ;
  elle ne fait jamais baisser la note. Le temps qui passe se traduit par une
  confiance qui décroît — pas par une maîtrise inventée en chute.
  *(learning-twin.ts)*
- **Maîtrise et confiance restent séparées.** « Il ne maîtrise pas » et « on n'en sait
  pas assez » appellent des réactions opposées — les confondre rend le système
  inutile. *(learning-twin.ts)*
- **Il sait dire « je ne sais pas ».** Preuves insuffisantes → aucune conclusion
  tirée, aucune alerte envoyée. *(learning-twin.ts : statut UNKNOWN reformulé)*
- **Les textes suivent l'élève.** Résumé hebdomadaire du cours re-levelé selon son
  niveau de lecture — qui monte quand il progresse, qui s'adoucit quand il est en
  difficulté. Sans jamais inventer de contenu hors curriculum.
  *(revision-semaine.ts, releveling.ts)*

**Phrase de vente :** « Un élève malade un mois n'est pas noté "en chute" : le système
distingue ce qu'il sait de ce qu'on n'a pas encore mesuré. C'est de la justice. »

### PILIER 9 — L'oubli anticipé, pas constaté
- **Chaque compétence a une demi-vie.** `mastery(t) = m₀ × e^(−λt)` : l'oubli se
  mesure par élève, par compétence. *(courbe-oubli.ts)*
- **L'alerte « vacances creuses »** projette la décroissance sur les prochaines
  vacances et nomme les élèves qui passeront sous le seuil **au retour** → révisions
  ciblées **avant le départ**, quand elles sont encore efficaces.
- **Des simulations, pas des paris.** « Si je remédie ces 3 compétences, combien
  d'élèves sauvés du redoublement ? » : la réponse s'appuie sur le Δ de maîtrise
  réellement observé sur les interventions passées — et un ROI élèves-sauvés/coût
  pour prioriser. *(simulation-remediation.ts)*

**Phrase de vente :** « La rentrée ne découvrira plus une classe amnésique : les
révisions sont parties avant les vacances. »

### PILIER 10 — La direction pilote en un chiffre
- **Sept indices de santé, un score 0-1 chacun** — dont l'ISP (Indice de Santé
  Pédagogique) — et chaque indice se décompose jusqu'au levier concret : du chiffre
  global à l'action, sans tableau interminable. *(direction-intelligence.ts)*
- **L'efficacité est mesurée, pas supposée** : les remédiations font-elles progresser ?
  Quels enseignants obtiennent les meilleurs résultats ? Quel type d'intervention
  marche ? *(efficacite-pedagogique.ts : A15-A19)*
- **Un assistant de direction** répond en langage naturel aux questions du quotidien.
  *(chatbot-direction.ts ; route /chatbot-direction)*
- **Le conseiller augmenté** : le CPE et le conseiller voient chaque dossier enrichi
  des signaux croisés. *(conseiller-augmente, dossier-eleve.ts, dossier-progression)*
- **Finance, assiduité, alumni** : chaque dimension de l'établissement a son
  intelligence dédiée. *(finance-intelligence.ts, assiduite.ts, alumni-intelligence.ts)*

**Phrase de vente :** « Un seul chiffre dit si votre école va bien. Et vous pouvez
toujours descendre jusqu'à l'élève pour comprendre pourquoi. »

### PILIER 11 — Une administration qui respire (gestion enseignants incluse)
- **Appel numérique en 30 secondes** ; bulletins **générés, pas retapés** ; conseil de
  classe prêt ; notes alignées en colonnes.
- **Facturation mensuelle automatique** : le 1er du mois à 02:00, avant l'ouverture
  du secrétariat — **une seule fois, jamais deux** (unicité garantie en base).
  *(AGENTS.md : index partiel `factures_unicite_mensuelle`)*
- **Emploi du temps anti-chevauchement** : les conflits de salle et de créneau sont
  détectés **avant publication**.
- **Ma journée, mes tâches, ma classe** : chaque enseignant ouvre l'app et voit son
  programme du jour, ses devoirs à corriger, ses alertes — pas un menu de 65 items.
  *(routes /ma-journee, /ma-classe, /taches)*
- **Les propositions attendent leur validation** : prérequis, plans de leçon,
  questions générées — tout arrive dans une file « à valider », rien ne s'écrit dans
  le curriculum sans l'enseignant. *(workflow-validation.ts ; route /propositions-ia)*
- **Trilingue natif** fr/en/so, **hors-ligne par design** (la donnée attend, repart
  avec le réseau), **mobile iOS/Android**, **WhatsApp/SMS/push signés**.
- **65 modules** — élèves, notes, absences, examens, cours, RH, caisse, infirmerie,
  orientation, admissions, alumni, inventaire — dans une seule plateforme.

**Phrase de vente :** « Vos enseignants clôturent, valident, appellent. Le reste —
planification, alertes, factures, bulletins — suit tout seul. »

### PILIER 12 — L'équité mesurée, le bien-être surveillé
- **Les élèves à besoins spéciaux reçoivent-ils autant d'interventions que les
  autres ?** Un ratio < 1 signale une sous-desserte — mesurée, pas soupçonnée.
  *(equite-inclusion.ts : I18)*
- **Les sites avec le plus de moyens obtiennent-ils les meilleurs résultats ?** La
  corrélation est chiffrée, les sites sur- et sous-performants sont isolés.
  *(equite-inclusion.ts : I19)*
- **Passages à l'infirmerie ↔ résultats** : les élèves qui y vont souvent décrochent-ils ?
  Mesuré. *(climat-bien-etre.ts : A31)*
- **Hotspots d'incidents jour × heure** : la surveillance se place là où ça se passe,
  par site. *(climat-bien-etre.ts : A32)*

**Phrase de vente :** « Vous ne défendez plus l'équité de votre établissement avec
des impressions : vous la chiffrez, vous la montrez, vous la corrigez. »

---

## 3. L'inventaire complet des moteurs LEARNOS
*(80+ modules dans `src/lib/learnos/` — les 12 piliers ci-dessus en sont la traduction
commerciale ; voici la couverture exhaustive par famille.)*

| Famille | Moteurs | Ce que ça vend |
|---|---|---|
| **Profil & preuves** | evidence-engine, learning-twin, chronologie-maitrise, profile-recompute | La mémoire fidèle de chaque élève ; le graphe de progression |
| **Choix des exercices** | exercice-selector, entrainement (+ boucles), generation-questions | La marche accessible ; l'entraînement autonome ; la banque validée |
| **Anticipation** | prediction-engine, courbe-oubli, risque-decrochage, revision-semaine, simulation-remediation | Notes prédictives vérifiées ; vacances creuses ; décrochage silencieux ; ROI remédiation |
| **Curriculum** | curriculum, graphe-curriculum, prerequis-proposes, import-programme, suivi-programme, planification(-pure), plan-lecon, rubrique-evaluation | Le graphe de savoir ; le programme suivi ; plans éditables ; import officiel |
| **Cahier & discipline de classe** | boucle-cahier-journal, alerte-decalage, devoirs-retard-check, veille-assiduite, pattern-absence | La tenue du cahier mesurée ; les décalages alertés |
| **Familles** | alertes-parent, alerte-parent-pedagogique, bot-parent (+ webhook Telegram/WhatsApp), engagement-parental | 1 événement = 1 message ; patterns ; l'engagement corrélé |
| **Direction** | direction-intelligence, kpi, chatbot-direction, comparateur, exploitation, finance-intelligence, suivi-programme | 7 indices ; baromètre programme ; assistant |
| **Enseignants** | tableau-bord-enseignant, charge-lecture, ma-classe, ma-journee, plans-lecon, workflow-validation | La journée déblayée ; les propositions à valider |
| **Équité & climat** | equite-inclusion, climat-bien-etre, assiduite, clustering-eleves, trajectoires-cohortes | L'équité chiffrée ; les groupes homogènes ; les cohortes |
| **Bulletins & formalités** | commentaires-bulletin, attestation, rubrique-evaluation, releveling | Commentaires nourris de preuves ; textes re-levelés ; attestations |
| **Connaissance de l'école** | efficacite-pedagogique, kpi, pattern-analyzer, events, event-bus, journal d'apprentissage | Ce qui marche, mesuré ; audit de chaque analyse |

---

## 4. La journée d'un enseignant — avant / après

| Moment | Avant (Excel + papier) | Avec SchoolPro |
|---|---|---|
| 08:00 | Appel papier, copié à la vie scolaire | **Appel en 30 secondes** ; absences déjà signalées aux parents |
| 10:00 | « Où en sont-ils ? » — intuition | Profil de maîtrise à jour ; prédiction du prochain chapitre lue en entrant |
| 14:00 | Exercices identiques pour 40 élèves | Exercices **différenciés** : les fragiles sur le prérequis, les avancés sur l'excellence |
| 16:00 | Cours, retapé le soir | Séance **clôturée en un clic** → planification et progression mises à jour |
| 17:00 | Devoirs à corriger en tas | Entraînement autonome **corrigé instantanément**, converti en preuves |
| Le soir | Bulletins, factures, cahier à rattraper | Rien à retaper : bulletins générés, factures parties le 1er à 02:00 |

---

## 5. Personas — matrice × bénéfice, puis les 4 fiches de réunion

| Persona | Le bénéfice qui fait signer | Le pilier |
|---|---|---|
| Directeur | « Le programme, la tenue des cahiers, la santé de l'école — en un chiffre, avec alerte de décalage » | 6, 10 |
| Directeur pédagogique / CPE | « Le décrochage silencieux attrapé à 9,5/20 ; simulations de remédiation chiffrées » | 4, 9 |
| Enseignant | « Des exercices justes pour chaque élève, sans préparation supplémentaire ; propositions que JE valide » | 1, 2, 11 |
| Comptable / secrétariat | « Factures uniques et parties à l'heure ; notes exactes au centième » | 11 + centièmes entiers |
| Parent | « Prévenu le jour même, dans ma langue, sans noyade » | 7, 8 |
| Élève | « Je vois ce que je sais et ce qui me bloque — pas juste une note ; corrigé tout de suite, jamais étiqueté » | 1, 2, 5, 8 |
| MENFOP / autorité | « GOSE 2.0, trilingue, cloisonné fail-closed, tout reproductible » | 11, 12 |

### Les 4 fiches persona — les cibles qu'on rencontre en réunion
*(Structure : ce qu'il juge · douleurs · angle · objections · preuves à sortir · démo type.
Les personas secondaires — DP/CPE, comptabilité, MENFOP — restent couverts par la matrice
ci-dessus.)*

#### Directeur d'établissement — le décideur
- **Ce qu'il juge :** le programme est-il tenu ? l'école se pilote-t-elle en un chiffre ?
  est-ce que ça s'intègre à ce qu'on utilise déjà ?
- **Douleurs :** Excel et les registres ; le programme qui dérive en silence ; découvrir
  les difficultés au conseil de classe, quand c'est trop tard.
- **Angle :** « Un seul chiffre dit si votre école va bien — et vous descendez jusqu'à
  l'élève pour comprendre pourquoi. »
- **Objections à prévoir :** « On a déjà un logiciel » · « Nos enseignants vont être
  dépassés » · « C'est cher » (réponses §6).
- **Preuves à sortir :** 7 indices de santé dont l'ISP (pilier 10) · 4 verdicts par
  semaine et alerte de décalage (pilier 6) · simulation « combien d'élèves sauvés ? »
  (pilier 9).
- **Démo type :** baromètre programme → descendre dans une classe → montrer une alerte
  de décalage avec son motif.

#### Enseignant — le champion
- **Ce qu'il juge :** est-ce que ça m'enlève du travail sans m'enlever ma pédagogie ?
  qui décide, au fond ?
- **Douleurs :** double saisie ; remédiation au hasard ; 40 élèves hétérogènes face au
  même exercice ; le cahier-journal repris le soir.
- **Angle :** « Il propose, vous validez — et vos exercices de rattrapage ne sont plus
  choisis à votre place. »
- **Objections à prévoir :** « L'IA va remplacer l'enseignant » · « Nos enseignants vont
  être dépassés » (réponses §6).
- **Preuves à sortir :** file « à valider » — rien ne s'écrit sans lui (pilier 11) ·
  la marche accessible (pilier 1) · clôture en un clic → planification à jour
  (pilier 6).
- **Démo type :** appel en 30 secondes → ouvrir la file de propositions → clôturer
  une séance et montrer la planification qui se met à jour.

#### Parent — le bénéficiaire et prescripteur
- **Ce qu'il juge :** suis-je prévenu sans être noyé ? répond-on à mes questions dans
  ma langue ?
- **Douleurs :** apprendre une absence ou une note trop tard ; les messages répétés ;
  ne jamais savoir ce qui bloque vraiment son enfant.
- **Angle :** « Une absence = un message, le jour même, sur WhatsApp — jamais quatre
  par semaine. »
- **Objections à prévoir :** « Les parents ne veulent pas de spam » · « Mon enfant va
  se croire étiqueté » (réponses §6).
- **Preuves à sortir :** empreinte unique et plafond hebdomadaire (pilier 7) ·
  « c'est ÇA qui bloque » (pilier 5) · absences récurrentes lisibles (pilier 7).
- **Démo type :** recevoir une alerte simulée sur WhatsApp → montrer le plafond
  hebdomadaire et le motif des alertes écartées.

#### Élève — l'usager final
- **Ce qu'il juge :** est-ce que ça m'aide vraiment ? est-ce que c'est juste ? est-ce
  que je vois où j'en suis ?
- **Douleurs :** une note qui tombe sans explication ; les exercices identiques pour
  tous ; le correctif une semaine plus tard ; être comparé à son voisin.
- **Angle :** « Tu sais ce que tu sais, tu sais ce qui te bloque — et tu es corrigé
  tout de suite. »
- **Objections à prévoir :** « Pourquoi j'ai pas les mêmes exercices que mon copain ? » ·
  « Encore une appli qui me surveille » (réponses §6).
- **Preuves à sortir :** espace élève — compétences et évolution, **jamais
  d'information financière** (`/eleve`) · entraînement corrigé instantanément
  (pilier 1) · résumé hebdomadaire relu à son niveau de lecture (pilier 8) ·
  « il sait dire je ne sais pas » — aucune étiquette (pilier 8).
- **Démo type :** une séance d'entraînement → correction immédiate → ouvrir sa grille
  de compétences et lui montrer ce qui bloque le reste.

---

## 6. Objections — réponses prêtes

| Objection | Réponse |
|---|---|
| « L'IA va remplacer l'enseignant » | « C'est écrit dans le produit : il propose, vous validez. Aucune proposition ne s'écrit dans le curriculum sans un enseignant. Et quand il ne sait pas, il le dit — aucune conclusion sur preuves insuffisantes. » |
| « Nos enseignants vont être dépassés » | « L'appel prend 30 secondes, la séance se clôture en un clic, la journée s'affiche toute seule. Le suivi des élèves se fait en arrière-plan, pas en plus. » |
| « On a déjà un logiciel » | « Gère-t-il la tenue de vos cahiers-journaux ? Projette-t-il l'oubli des vacances ? Nomme-t-il l'élève qui glisse à 9,5/20 ? Non ? Alors il gère l'école — pas les élèves. » |
| « Et si les prédictions se trompent ? » | « Chaque prédiction est comparée à la réalité et les seuils se recalibrent : le système sait lui-même quand il s'est trompé. Une boule de cristal ne sait pas. » |
| « Les parents ne veulent pas de spam » | « Une absence = un message, empreinte unique ; seuil choisi par le parent ; plafond hebdomadaire. C'est conçu par quelqu'un qui sait qu'un canal noyé est un canal mort. » |
| « Le réseau tombe souvent ici » | « Hors-ligne par design : la donnée attend, puis repart avec le réseau. Mobile, trilingue, WhatsApp. » |
| « C'est cher pour une école » | « Trois soirées de retappe par semaine, des remédiations au hasard et des redoublements évitables : le calcul se fait tout seul. Et la facturation SchoolPro elle-même est un modèle d'exactitude. » |
| **(parent)** « Mon enfant va se croire étiqueté "faible" » | « Il voit ce qu'il maîtrise et ce qui le bloque — jamais un classement. Sans preuves suffisantes, le système n'affiche rien plutôt qu'un jugement. Et son espace n'affiche jamais la situation financière de la famille. » |
| **(élève)** « Pourquoi j'ai pas les mêmes exercices que mon copain ? » | « Parce qu'on ne te demande pas la même chose : on te donne d'abord ce qui te manque. Tu es corrigé tout de suite, tu recommences, et tu vois ce que tu sais vraiment. » |
| **(élève)** « Encore une appli qui me surveille » | « Ton espace ne montre que toi : tes compétences, ton évolution. Il se tait quand tout va bien, et il ne dit rien quand il n'a pas assez de preuves. » |
| **(direction)** « Les élèves verront ce qui ne les regarde pas ? » | « L'espace élève est borné au rôle : ses compétences, son évolution, ses bulletins. Jamais la situation financière, jamais le dossier d'un autre élève. » |

---

## 7. Chiffres à citer (tous vérifiés dans le dépôt)

- **65 modules** · **161 fichiers de tests** · **29 migrations additives** · **11 rôles**
- **3 langues natives** : français, english, af-soomaali
- **0 décision prise sans l'enseignant** ; **0 approximation** dans les moyennes (centièmes entiers, 14,50 → 1450)
- **5 signaux** du score de décrochage · **±0,15** de tolérance de vérification des prédictions
- **1 absence = 1 message** (empreinte unique) · facturation le **1er du mois à 02:00**, unicité garantie en base
- Né à Djibouti — aligné **GOSE 2.0 · MENFOP**

---

## 8. Le code de langage commercial (anti-peur de l'IA)

**Interdits face au client** : IA, LLM, algorithme, modèle, déterministe, génératif,
machine learning, jumeau numérique, automatique (pour une décision pédagogique).

**Autorisés** : « SchoolPro remarque / voit / propose / garde la mémoire / montre ses
preuves / sait dire "je ne sais pas" / se tait quand tout va bien ». L'enseignant
**valide**, **décide**, **ajuste**. Un badge discret « LEARNOS · intelligence
pédagogique » maximum, jamais en accroche.

**Les 4 piliers de confiance** (à dérouler dans cet ordre si le client s'inquiète) :
1. **Discretion** — il se tait au milieu : un système qui recommande tout n'est plus lu.
2. **Transparence** — chaque recommandation montre ses preuves et son « pourquoi ».
3. **Humilité** — preuves insuffisantes = aucune conclusion, aucune alerte.
4. **Contrôle** — il propose, vous décidez. Toujours.

---

## 9. Preuves & actifs disponibles

- **École pilote** : École Miriam, Djibouti · alignement GOSE 2.0 — MENFOP
- **6 vidéos promotionnelles** prêtes (3×25s + 3×45s, 9:16) — `brag-output-2026-10-13-124439/`
- **Analyse marketing complète** — `brag-output-2026-10-13-124439/ANALYSE-PROJET.md`
- **Contexte produit canonique** — `.agents/product-marketing.md` (v2, 2026-10-13)
- **Ingénierie de confiance** : RLS PostgreSQL, 2FA, Turnstile anti-bot, audit trail de
  chaque analyse (JournalApprentissage), alertes conservées avec leur motif

*Document vivant — à mettre à jour à chaque nouveau moteur LEARNOS.*
