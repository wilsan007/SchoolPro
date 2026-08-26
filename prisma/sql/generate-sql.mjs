#!/usr/bin/env node
/**
 * Générateur SQL pour le seed Cité Scolaire Ambouli (Djibouti)
 * Produit les fichiers 04-13 dans prisma/sql/
 *
 * Usage: node prisma/sql/generate-sql.mjs
 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const OUT_DIR = path.dirname(new URL(import.meta.url).pathname);

// Shared state between genFile11 and genFile12
const generatedEtapeIds = [];
// Compilation des evidences par année → niveau → matière → { avgMastery, count, trend }
// Cette structure est remplie par genFile11 et consommée par genFile13 pour les prédictions
// Chaîne temporelle: N-1 compile → N prédit sur N-1 → N compile → N+1 prédit sur N (cumul N-1)
const evidenceCompilation = {
  '2024': {}, // année N-1: compilé à partir des evidences 2024-2025
  '2025': {}, // année N: compilé à partir des evidences 2025-2026 (cumule N-1)
};
// Mot de passe commun à tous les comptes de démonstration, et son hash bcrypt.
// La correspondance est vérifiée ci-dessous : un hash écrit à la main ne peut
// plus passer. C'est exactement ce qui s'était produit — un digest de coût 10
// recollé derrière un préfixe `$2a$12$` — et `bcrypt.compare` échouait alors
// pour les 6 221 comptes chargés, sans autre symptôme que « Identifiants
// invalides » à la connexion.
// Pour changer le mot de passe : node -e "console.log(require('bcryptjs').hashSync('NouveauMotDePasse', 12))"
const PASSWORD = 'Ambouli@2026!';
const HASH = '$2a$12$1b7BChA.QF/6pf3jZkl6B.YUM5iMNKRG67GePvECwZN7VJe5I9FDC';
if (!bcrypt.compareSync(PASSWORD, HASH)) {
  throw new Error(
    `HASH ne correspond pas au mot de passe "${PASSWORD}" : les comptes générés seraient inutilisables. ` +
    `Régénérer avec bcrypt.hashSync(PASSWORD, 12).`
  );
}
const TS = '2024-09-15 12:00:00';
const TS2 = '2025-01-15 12:00:00';
const TRUE = true;
const FALSE = false;

// ── Helpers ──────────────────────────────────────────────────
function q(col) { return `"${col}"`; }
function cols(...c) { return c.map(q).join(', '); }
function val(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string' && v.startsWith("'") ) return v; // raw SQL
  // escape single quotes
  const escaped = String(v).replace(/'/g, "''");
  return `'${escaped}'`;
}
function vals(...v) { return v.map(val).join(', '); }
function batchInsert(table, columns, rows, conflictCol = 'id') {
  if (rows.length === 0) return '';
  const colList = columns.map(q).join(', ');
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const values = batch.map(r => `  (${r.map(val).join(', ')})`).join(',\n');
    chunks.push(`INSERT INTO ${table} (${colList}) VALUES\n${values}\nON CONFLICT ("${conflictCol}") DO NOTHING;`);
  }
  return chunks.join('\n\n');
}

// ── Data pools ───────────────────────────────────────────────
const NOMS = ['Mahamoud','Abdillahi','Omar','Hassan','Said','Ibrahim','Farah','Djibril','Aden','Moussa','Yacin','Rachid','Ali','Mohamed','Guelleh','Waberi','Gouled','Barkat','Elmi','Hersi','Ismael','Robleh','Daoud','Djama','Nour','Osman','Kadar','Yonis','Abdi','Ragueh'];
const PRENOMS_M = ['Abdillahi','Omar','Hassan','Said','Ibrahim','Farah','Djibril','Aden','Moussa','Yacin','Rachid','Ali','Mohamed','Nour','Osman','Yonis','Abdi','Ragueh','Kadar','Mahad'];
const PRENOMS_F = ['Amina','Fatima','Asma','Hodan','Leyla','Safia','Khadra','Naima','Mariam','Hawa','Deqa','Halima','Zainab','Sumaya','Yasmin','Salma','Fadumo','Ayan','Hibo','Lula'];
const PROFESSIONS = ['Fonctionnaire','Commercant','Enseignant','Militaire','Pecheur','Chauffeur','Menagere','Infirmier','Technicien','Ouvrier','Comptable','Tailleur','Boulanger','Mechanicien'];
const BANQUES = ['Banque de Djibouti','CAC Bank','BRED','Saba Bank','Bank of Africa'];
const GROUPE_SANGUIN = ['A+','B+','O+','AB+','A-','B-','O-'];

// Deterministic pseudo-random
let seed = 42;
function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function pickN(arr, n) { return arr.slice(0, n); }

// ── School year date helpers ─────────────────────────────────
// Demo "now" = 2026-08-16 (school year 2025-2026 is COMPLETED)
// All 2024-2025 data is historical/closed, all 2025-2026 data is also completed.
const DEMO_NOW = new Date(2026, 7, 16); // month is 0-indexed (7 = August) — vacances, année 2025-2026 clôturée

// School year months: sep(9)-dec(12) 2025, jan(1)-jul(7) 2026
const SCHOOL_MONTHS = [
  // 2025-2026 (année N, clôturée)
  { y: 2025, m: 9 }, { y: 2025, m: 10 }, { y: 2025, m: 11 }, { y: 2025, m: 12 },
  { y: 2026, m: 1 }, { y: 2026, m: 2 }, { y: 2026, m: 3 }, { y: 2026, m: 4 },
  { y: 2026, m: 5 }, { y: 2026, m: 6 }, { y: 2026, m: 7 },
  // 2026-2027 (année N+1, courante — T1 en cours)
  { y: 2026, m: 9 }, { y: 2026, m: 10 }
];

// Random date within the school year, formatted as "YYYY-MM-DD HH:MM:SS"
function schoolDate(hour = '00', minute = '00') {
  const mo = pick(SCHOOL_MONTHS);
  const day = randInt(1, 28);
  return `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')} ${hour}:${minute}:00`;
}

// Check if a date string "YYYY-MM-DD ..." is before DEMO_NOW
function isPast(dateStr) {
  const parts = dateStr.slice(0, 10).split('-');
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return d < DEMO_NOW;
}

// Djibouti school week: Sunday(0) through Thursday(4). Friday(5) and Saturday(6) are non-school days.
// Generate a school date string that falls on a school day (Sun-Thu).
function schoolDayDate(hour = '00', minute = '00') {
  // Pick a random month from the school year, then find a day that is Sun-Thu
  const mo = pick(SCHOOL_MONTHS);
  let day = randInt(1, 28);
  // Construct a Date to check the day of week
  const d = new Date(mo.y, mo.m - 1, day);
  // JS getDay(): 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
  // If it falls on Friday(5) or Saturday(6), shift to the nearest school day
  const dow = d.getDay();
  if (dow === 5) {
    // Friday -> shift to Thursday (day - 1) or Sunday (day + 2)
    day = day > 1 ? day - 1 : day + 2;
  } else if (dow === 6) {
    // Saturday -> shift to Thursday (day - 2) or Sunday (day + 1)
    day = day > 2 ? day - 2 : day + 1;
  }
  // Clamp day to valid range
  day = Math.max(1, Math.min(28, day));
  return `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')} ${hour}:${minute}:00`;
}

// ── Dates bornées à UNE année scolaire ───────────────────────
// `SCHOOL_MONTHS` ne couvre que 2025-2026 et 2026-2027 : tout ce qui s'y
// datait tombait donc dans l'année N, y compris les faits rattachés à une
// inscription de 2024-2025. Tant que les deux années avaient des populations
// disjointes cela passait inaperçu ; maintenant qu'un élève traverse les deux,
// une absence de 2026 sur son année de 6ème contredirait son propre parcours.

/// Mois de l'année scolaire ouverte par `anneeYear` : septembre → juin.
function moisAnnee(anneeYear) {
  const a = parseInt(anneeYear, 10);
  return [
    { y: a, m: 9 }, { y: a, m: 10 }, { y: a, m: 11 }, { y: a, m: 12 },
    { y: a + 1, m: 1 }, { y: a + 1, m: 2 }, { y: a + 1, m: 3 },
    { y: a + 1, m: 4 }, { y: a + 1, m: 5 }, { y: a + 1, m: 6 },
  ];
}

/// `schoolDate`, mais dans l'année scolaire de l'inscription.
function dateAnnee(anneeYear, hour = '00', minute = '00') {
  const mo = pick(moisAnnee(anneeYear));
  const day = randInt(1, 28);
  return `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')} ${hour}:${minute}:00`;
}

/// `schoolDayDate` (dimanche → jeudi, semaine djiboutienne), même bornage.
function jourEcoleAnnee(anneeYear, hour = '00', minute = '00') {
  const mo = pick(moisAnnee(anneeYear));
  let day = randInt(1, 28);
  const dow = new Date(mo.y, mo.m - 1, day).getDay();
  if (dow === 5) day = day > 1 ? day - 1 : day + 2;
  else if (dow === 6) day = day > 2 ? day - 2 : day + 1;
  day = Math.max(1, Math.min(28, day));
  return `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')} ${hour}:${minute}:00`;
}

// Weighted pick: given array of [value, weight] pairs, pick one
function weightedPick(options) {
  const total = options.reduce((s, o) => s + o[1], 0);
  let r = rand() * total;
  for (const [val, w] of options) {
    r -= w;
    if (r <= 0) return val;
  }
  return options[options.length - 1][0];
}

// Generate devoir dates: dateDonne always before dateRendu, both within school year
function devoirDates() {
  const donneIdx = randInt(0, SCHOOL_MONTHS.length - 3); // leave room for rendu
  const donneMo = SCHOOL_MONTHS[donneIdx];
  const dateDonne = `${donneMo.y}-${String(donneMo.m).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00`;
  const renduIdx = Math.min(donneIdx + randInt(1, 3), SCHOOL_MONTHS.length - 1);
  const renduMo = SCHOOL_MONTHS[renduIdx];
  const dateRendu = `${renduMo.y}-${String(renduMo.m).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00`;
  return { dateDonne, dateRendu };
}

// ── Levels & classes ─────────────────────────────────────────
const COLLEGE_NIVEAUX = ['6eme','5eme','4eme','3eme'];
const LYCEE_NIVEAUX = ['2nde','1ere','Terminale'];
const ALL_NIVEAUX = [...COLLEGE_NIVEAUX, ...LYCEE_NIVEAUX];

/// Enseignants par spécialité et par site, dimensionnés sur le volume horaire
/// réellement à couvrir : 22 classes × 26 heures = 572 heures par semaine, par
/// site et par année. L'effectif uniforme d'avant — 20 professeurs cyclant sur
/// 14 matières — ne laissait qu'un titulaire de SVT et un d'EPS par site, à qui
/// il aurait fallu confier 44 heures hebdomadaires sur les 30 que compte la
/// semaine. Aucun emploi du temps sans conflit n'était possible.
const ENSEIGNANTS_PAR_MATIERE = {
  MATH: 5, FR: 5, ANG: 3, AR: 2, HG: 3, PC: 3, SVT: 2, EPS: 2,
  TECH: 1, ART: 1, MUS: 1, ISL: 2, PHILO: 1, SES: 1,
};

/// Spécialité de chaque enseignant, dans l'ordre de sa numérotation :
/// `ens-ambouli-1` à `-5` enseignent les mathématiques, `-6` à `-10` le
/// français, et ainsi de suite.
const SPECIALITE_PAR_RANG = Object.entries(ENSEIGNANTS_PAR_MATIERE)
  .flatMap(([code, n]) => Array.from({ length: n }, () => code));

const NB_ENSEIGNANTS_PAR_SITE = SPECIALITE_PAR_RANG.length;

/// Enseignants de chaque matière, par site — le vivier dans lequel l'emploi du
/// temps choisit le titulaire d'une classe.
const ENSEIGNANTS_DU_SITE = Object.fromEntries(['ambouli', 'arhiba'].map(site => [
  site,
  SPECIALITE_PAR_RANG.reduce((acc, code, i) => {
    if (!acc[code]) acc[code] = [];
    acc[code].push(`ens-${site}-${i + 1}`);
    return acc;
  }, {}),
]));

const CLASS_SUFFIXES = {
  '6eme': ['A','B','C'], '5eme': ['A','B','C'], '4eme': ['A','B','C'], '3eme': ['A','B','C'],
  '2nde': ['A','B','C','D'], '1ere': ['S','ES','L'], 'Terminale': ['S','ES','L']
};
const CLASS_LABELS = {
  '6eme': '6ème', '5eme': '5ème', '4eme': '4ème', '3eme': '3ème',
  '2nde': '2nde', '1ere': '1ère', 'Terminale': 'Terminale'
};
const AGE_BY_NIVEAU = { '6eme':11, '5eme':12, '4eme':13, '3eme':14, '2nde':15, '1ere':16, 'Terminale':17 };

function structureFor(niveau, site) {
  const isLycee = LYCEE_NIVEAUX.includes(niveau);
  return isLycee ? `struct-lycee-${site === 'ambouli' ? 'amb' : 'arh'}` : `struct-coll-${site === 'ambouli' ? 'amb' : 'arh'}`;
}

function generateClasses() {
  const classes = [];
  for (const site of ['ambouli','arhiba']) {
    for (const anneeYear of ['2024','2025']) {
      // Salle attitrée : collège en 101→112, lycée en 201→210, dans l'ordre des
      // niveaux. La numérotation ne dépend pas de l'année — une même classe
      // occupe la même salle d'une année sur l'autre, et deux années
      // différentes ne peuvent de toute façon pas se disputer une salle.
      let numCollege = 100, numLycee = 200;
      for (const niveau of ALL_NIVEAUX) {
        for (const suffix of CLASS_SUFFIXES[niveau]) {
          const salle = `Salle ${LYCEE_NIVEAUX.includes(niveau) ? ++numLycee : ++numCollege}`;
          const id = `cls-${site}-${anneeYear}-${niveau}-${suffix}`;
          const nom = `${CLASS_LABELS[niveau]} ${suffix}`;
          const annee = anneeYear === '2024' ? '2024-2025' : '2025-2026';
          const anneeId = anneeYear === '2024' ? 'annee-2024-amb' : 'annee-2025-amb';
          const siteId = `site-${site}`;
          const structId = structureFor(niveau, site);
          const profIdx = (ALL_NIVEAUX.indexOf(niveau) * 3 + suffix.charCodeAt(0)) % NB_ENSEIGNANTS_PAR_SITE + 1;
          const profId = `ens-${site}-${profIdx}`;
          classes.push({ id, tenantId:'tenant-ambouli', siteId, structureId:structId, anneeId, niveau, suffix, salle, nom, effectifMax:40, profPrincipalId:profId, annee, createdAt:TS, updatedAt:TS });
        }
      }
    }
  }
  return classes;
}

// ── Flux de cohorte : des élèves qui traversent les années ───
//
// Le seed couvre deux années scolaires. Jusqu'ici l'identifiant portait
// l'année (`ele-ambouli-2025-0042`) : les 1 232 élèves de 2024-2025 et les
// 1 232 de 2025-2026 formaient deux populations disjointes, et aucun élève
// ne traversait les deux ans. Les six analyses longitudinales de LEARNOS —
// efficacité du redoublement, motifs de transfert, diplomation par cohorte —
// n'avaient donc aucune longitude à lire.
//
// L'identité est désormais celle d'une PERSONNE (`ele-ambouli-0042`, sans
// année), et l'on construit le flux réel d'une rentrée à l'autre :
//
//   fin 2024-2025 →  moyenne ≥ 10 : passage au niveau suivant
//                 →  moyenne < 10 : redoublement au même niveau
//                 →  ~3 % de départs (transfert, déménagement, abandon)
//                 →  Terminale reçue : diplômée, part vers les Alumni
//   rentrée 2025  →  ce flux, complété par des entrants extérieurs aux deux
//                    seuls niveaux qui recrutent : la 6ème et la 2nde
//
// Les effectifs 2025-2026 ne sont donc plus figés à 28 : ils découlent du
// flux. La 1ère se remplit (quatre classes de 2nde alimentent trois classes
// de 1ère), la 2nde recrute au-dehors. C'est exactement ce que la prédiction
// de remplissage des classes (I11) doit savoir lire.

const NIVEAU_SUIVANT = {
  '6eme': '5eme', '5eme': '4eme', '4eme': '3eme', '3eme': '2nde',
  '2nde': '1ere', '1ere': 'Terminale', 'Terminale': null,
};

/// Les deux seuls niveaux qui recrutent hors de l'établissement : entrée au
/// collège et entrée au lycée. Partout ailleurs l'effectif est celui que le
/// flux amène — on ne fabrique personne pour arrondir.
const NIVEAUX_RECRUTEMENT = new Set(['6eme', '2nde']);

/// Effectif visé par classe sur un niveau de recrutement.
const EFFECTIF_CIBLE = 28;

/// Part des élèves qui quittent l'établissement en fin d'année, toutes
/// causes confondues.
const TAUX_DEPART = 0.03;

/// Générateur pseudo-aléatoire indépendant : la structure de la cohorte doit
/// rester stable même si l'ordre des tirages change ailleurs dans le fichier.
function makeRng(graine) {
  let s = graine;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

/**
 * Moyenne annuelle à partir d'un « profil » dans [0, 1[ — 0 = tête de classe,
 * 1 = grande difficulté. Reproduit la distribution du seed d'origine :
 * 15 % d'excellents, 25 % de bons, 35 % de moyens, 15 % de faibles et 10 % de
 * très faibles, soit 75 % de passage.
 */
function moyennePourProfil(profil, r) {
  let m;
  if (profil < 0.15) m = 14 + r * 4;
  else if (profil < 0.40) m = 12 + r * 2;
  else if (profil < 0.75) m = 10 + r * 2;
  else if (profil < 0.90) m = 8 + r * 2;
  else m = 4 + r * 4;
  return Math.round(m * 100) / 100;
}

/**
 * Construit la population des deux années scolaires.
 *
 * Renvoie `{ personnes, inscriptions }` : une personne par élève réel (une
 * seule ligne `eleves`, un seul parent, un seul matricule), et une inscription
 * par couple élève × année (une ligne `parcours_scolaires`, une ligne
 * `historique_classes`, une facture, un jeu de notes et de bulletins).
 */
function buildCohortes() {
  const rng = makeRng(20252026);
  const pickRng = (arr) => arr[Math.floor(rng() * arr.length)];

  const classesParNiveau = new Map(); // `${site}|${anneeYear}|${niveau}` → classes
  for (const cls of generateClasses()) {
    const site = cls.siteId === 'site-ambouli' ? 'ambouli' : 'arhiba';
    const anneeYear = cls.annee === '2024-2025' ? '2024' : '2025';
    const cle = `${site}|${anneeYear}|${cls.niveau}`;
    if (!classesParNiveau.has(cle)) classesParNiveau.set(cle, []);
    classesParNiveau.get(cle).push(cls);
  }

  const personnes = [];
  const inscriptions = [];

  for (const siteName of ['ambouli', 'arhiba']) {
    const personnesSite = [];
    let compteur = 0;

    function nouvellePersonne(anneeEntree) {
      compteur++;
      const num = String(compteur).padStart(4, '0');
      const p = {
        eleveId: `ele-${siteName}-${num}`,
        parentId: `parent-${siteName}-${num}`,
        num,
        siteName,
        siteId: `site-${siteName}`,
        anneeEntree,
        /// Trait durable de l'élève : le même profil le suit d'une année sur
        /// l'autre, sans quoi comparer sa moyenne N et N+1 n'aurait pas de sens.
        profil: rng(),
        inscriptions: [],
        sortie: null,
      };
      personnes.push(p);
      personnesSite.push(p);
      return p;
    }

    function inscrire(p, cls, anneeYear, origine) {
      // Refaire l'année aide, mais inégalement : certains redoublants
      // repassent nettement la barre, beaucoup restent au même point. C'est
      // cette dispersion — et non un rattrapage automatique — que l'analyse
      // d'efficacité du redoublement (A11) doit avoir à lire.
      const bonus = origine === 'REDOUBLANT' ? rng() * 0.26 : 0;
      const profilAnnee = Math.min(0.999, Math.max(0, p.profil - bonus + (rng() - 0.5) * 0.06));
      const insc = {
        eleveId: p.eleveId,
        parentId: p.parentId,
        site: cls.siteId,
        siteName,
        annee: cls.annee,
        anneeYear,
        niveau: cls.niveau,
        classeId: cls.id,
        classeNom: cls.nom,
        isLycee: LYCEE_NIVEAUX.includes(cls.niveau),
        origine, // NOUVEAU | PROMU | REDOUBLANT
        moyenne: moyennePourProfil(profilAnnee, rng()),
        decision: null,
        rang: 0,
        effectif: 0,
      };
      p.inscriptions.push(insc);
      inscriptions.push(insc);
      return insc;
    }

    // ── Rentrée 2024 : la promotion d'entrée, toutes classes à 28 ──
    for (const niveau of ALL_NIVEAUX) {
      for (const cls of classesParNiveau.get(`${siteName}|2024|${niveau}`) || []) {
        for (let i = 0; i < EFFECTIF_CIBLE; i++) {
          inscrire(nouvellePersonne('2024'), cls, '2024', 'NOUVEAU');
        }
      }
    }

    // ── Fin 2024-2025 : passage, redoublement, diplôme ou départ ──
    const attendus = {}; // niveau de la rentrée 2025 → personnes
    for (const niveau of ALL_NIVEAUX) attendus[niveau] = [];

    for (const p of personnesSite) {
      const insc = p.inscriptions[0];
      const recu = insc.moyenne >= 10;

      if (insc.niveau === 'Terminale' && recu) {
        insc.decision = 'Diplômé';
        p.sortie = { anneeYear: '2024', statut: 'DIPLOME', motif: "Fin d'études", date: '2025-07-05 00:00:00' };
        continue;
      }

      insc.decision = recu ? 'Passage' : 'Redoublement';

      if (rng() < TAUX_DEPART) {
        const motif = pickRng(['Transfert', 'Déménagement', 'Abandon']);
        p.sortie = {
          anneeYear: '2024',
          statut: motif === 'Abandon' ? 'ABANDONNE' : 'TRANSFERE',
          motif,
          date: '2025-07-05 00:00:00',
        };
        continue;
      }

      attendus[recu ? NIVEAU_SUIVANT[insc.niveau] : insc.niveau].push(p);
    }

    // ── Rentrée 2025 : le flux, complété au besoin sur 6ème et 2nde ──
    for (const niveau of ALL_NIVEAUX) {
      const classes = classesParNiveau.get(`${siteName}|2025|${niveau}`) || [];
      if (classes.length === 0) continue;

      const effectif = attendus[niveau].slice();
      if (NIVEAUX_RECRUTEMENT.has(niveau)) {
        const cible = classes.length * EFFECTIF_CIBLE;
        while (effectif.length < cible) effectif.push(nouvellePersonne('2025'));
      }

      effectif.forEach((p, i) => {
        const origine = p.anneeEntree === '2025'
          ? 'NOUVEAU'
          : (p.inscriptions[0].decision === 'Passage' ? 'PROMU' : 'REDOUBLANT');
        inscrire(p, classes[i % classes.length], '2025', origine);
      });
    }

    // ── Fin 2025-2026 : l'année est clôturée à la date de démo ──
    for (const p of personnesSite) {
      const insc = p.inscriptions[p.inscriptions.length - 1];
      if (insc.anneeYear !== '2025') continue;
      const recu = insc.moyenne >= 10;
      if (insc.niveau === 'Terminale' && recu) {
        insc.decision = 'Diplômé';
        p.sortie = { anneeYear: '2025', statut: 'DIPLOME', motif: "Fin d'études", date: '2026-07-04 00:00:00' };
      } else {
        insc.decision = recu ? 'Passage' : 'Redoublement';
      }
    }
  }

  // Rang et effectif réels, par classe. Ils étaient jusqu'ici tirés au sort
  // (`randInt(1, count)`) et contredisaient donc la moyenne affichée à côté.
  const parClasse = new Map();
  for (const insc of inscriptions) {
    if (!parClasse.has(insc.classeId)) parClasse.set(insc.classeId, []);
    parClasse.get(insc.classeId).push(insc);
  }
  for (const liste of parClasse.values()) {
    liste.slice().sort((a, b) => b.moyenne - a.moyenne).forEach((insc, i) => {
      insc.rang = i + 1;
      insc.effectif = liste.length;
    });
  }

  return { personnes, inscriptions };
}

/// Une personne = une fiche élève. Une inscription = un couple élève × année.
/// `ALL_ELEVES` garde son nom : les générateurs en aval raisonnent bien par
/// inscription (une facture par an, un jeu de notes par an, une absence
/// rattachée à l'année où elle a eu lieu).
const { personnes: ALL_PERSONNES, inscriptions: ALL_ELEVES } = buildCohortes();

// Sous-ensembles prêts à l'emploi. Plusieurs générateurs en aval fabriquaient
// jusqu'ici des identifiants d'élève à la main (`ele-ambouli-2024-0042`) : ils
// visaient juste tant que la numérotation portait l'année, et tomberaient dans
// le vide maintenant qu'elle ne la porte plus. On tire donc dans les fiches
// réellement écrites.
const PERSONNES_PAR_SITE = {
  ambouli: ALL_PERSONNES.filter(p => p.siteName === 'ambouli'),
  arhiba: ALL_PERSONNES.filter(p => p.siteName === 'arhiba'),
};
const INSCRITS_2025_PAR_SITE = {
  ambouli: ALL_ELEVES.filter(e => e.siteName === 'ambouli' && e.anneeYear === '2025'),
  arhiba: ALL_ELEVES.filter(e => e.siteName === 'arhiba' && e.anneeYear === '2025'),
};
const INSCRITS_6EME_AMBOULI = ALL_ELEVES.filter(e => e.siteName === 'ambouli' && e.niveau === '6eme');

/**
 * Garde structurelle sur le flux de cohorte.
 *
 * La liaison des années est invisible à l'œil nu dans 300 fichiers SQL : elle
 * peut se défaire sans que rien n'échoue, et les analyses longitudinales
 * repartiraient alors silencieusement à vide. Sur le modèle de la garde du
 * hash bcrypt en tête de fichier, on refuse donc de générer un seed dont la
 * cohorte ne tient pas debout.
 */
function verifierCohortes() {
  const ordre = ALL_NIVEAUX;
  let deuxAns = 0;

  for (const p of ALL_PERSONNES) {
    if (p.inscriptions.length < 1 || p.inscriptions.length > 2) {
      throw new Error(`${p.eleveId} : ${p.inscriptions.length} inscriptions (attendu 1 ou 2).`);
    }
    if (p.inscriptions.length === 1) continue;

    const [a, b] = p.inscriptions;
    if (a.anneeYear !== '2024' || b.anneeYear !== '2025') {
      throw new Error(`${p.eleveId} : années ${a.anneeYear} puis ${b.anneeYear} (attendu 2024 puis 2025).`);
    }
    const attendu = a.decision === 'Passage' ? ordre[ordre.indexOf(a.niveau) + 1] : a.niveau;
    if (b.niveau !== attendu) {
      throw new Error(`${p.eleveId} : ${a.niveau} « ${a.decision} » → ${b.niveau} (attendu ${attendu}).`);
    }
    // Sortir à la fin de la seconde année est normal (un redoublant de
    // Terminale finit par être reçu) ; sortir à la fin de la première et
    // reparaître à la rentrée suivante ne l'est pas.
    if (p.sortie && p.sortie.anneeYear === '2024') {
      throw new Error(`${p.eleveId} : sorti en ${a.annee} mais réinscrit en ${b.annee}.`);
    }
    deuxAns++;
  }

  // Un élève qui traverse les deux ans est la seule chose que les analyses
  // longitudinales aient à lire. S'ils deviennent rares, la démonstration
  // n'existe plus, même si tout le reste du seed se charge sans erreur.
  const part = deuxAns / ALL_PERSONNES.length;
  if (part < 0.5) {
    throw new Error(
      `Seuls ${deuxAns}/${ALL_PERSONNES.length} élèves (${Math.round(part * 100)} %) traversent ` +
      `les deux années : la liaison des cohortes est rompue.`
    );
  }

  const diplomes = ALL_PERSONNES.filter(p => p.sortie && p.sortie.statut === 'DIPLOME').length;
  const sortis = ALL_PERSONNES.filter(p => p.sortie && p.sortie.statut !== 'DIPLOME').length;
  console.log(
    `  [cohortes] ${ALL_PERSONNES.length} élèves, ${ALL_ELEVES.length} inscriptions — ` +
    `${deuxAns} traversent les deux ans (${Math.round(part * 100)} %), ` +
    `${diplomes} diplômés, ${sortis} sortis en cours de route.`
  );
}
verifierCohortes();

// ── File 04: Users, Staff, Enseignants ───────────────────────
function genFile04() {
  let sql = `-- 04-users-staff-enseignants.sql\n-- Cité Scolaire Ambouli — Users, Staff, Enseignants, RH, Paie\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "bulletins_paie" WHERE "ficheRHId" IN (SELECT e."id" FROM "fiches_rh" e WHERE e."tenantId"='tenant-ambouli');\n`;
  sql += `DELETE FROM "fiches_rh" WHERE "tenantId"='tenant-ambouli';\n`;
  sql += `DELETE FROM "enseignant_sites" WHERE "enseignantId" IN (SELECT id FROM "enseignants" WHERE "tenantId"='tenant-ambouli');\n`;
  sql += `DELETE FROM "enseignants" WHERE "tenantId"='tenant-ambouli';\n`;
  sql += `DELETE FROM "user_sites" WHERE "userId" IN (SELECT id FROM "users" WHERE "tenantId"='tenant-ambouli' AND "id" != 'user-admin-amb');\n`;
  sql += `DELETE FROM "users" WHERE "tenantId"='tenant-ambouli' AND "id" != 'user-admin-amb';\n\n`;

  const users = [];
  const userSites = [];
  const enseignants = [];
  const ensSites = [];
  const fichesRH = [];
  const bulletinsPaie = [];

  // Staff users
  const staffDefs = [
    ['user-principal-coll-amb','principal.coll.amb@cite-ambouli.dj','PRINCIPAL','site-ambouli','Abdillahi','Mahamoud','M'],
    ['user-principal-lycee-amb','principal.lycee.amb@cite-ambouli.dj','PRINCIPAL','site-ambouli','Omar','Guelleh','M'],
    ['user-principal-coll-arh','principal.coll.arh@cite-ambouli.dj','PRINCIPAL','site-arhiba','Hassan','Waberi','M'],
    ['user-principal-lycee-arh','principal.lycee.arh@cite-ambouli.dj','PRINCIPAL','site-arhiba','Amina','Djama','F'],
    ['user-secretary-ambouli','secretary.ambouli@cite-ambouli.dj','SECRETARY','site-ambouli','Fatima','Elmi','F'],
    ['user-secretary-arhiba','secretary.arhiba@cite-ambouli.dj','SECRETARY','site-arhiba','Hodan','Hersi','F'],
    ['user-accountant-ambouli','accountant.ambouli@cite-ambouli.dj','ACCOUNTANT','site-ambouli','Said','Barkat','M'],
    ['user-accountant-arhiba','accountant.arhiba@cite-ambouli.dj','ACCOUNTANT','site-arhiba','Leyla','Gouled','F'],
    ['user-supervisor-ambouli-1','supervisor.ambouli1@cite-ambouli.dj','SUPERVISOR','site-ambouli','Ibrahim','Ismael','M'],
    ['user-supervisor-ambouli-2','supervisor.ambouli2@cite-ambouli.dj','SUPERVISOR','site-ambouli','Safia','Robleh','F'],
    ['user-supervisor-arhiba-1','supervisor.arhiba1@cite-ambouli.dj','SUPERVISOR','site-arhiba','Farah','Daoud','M'],
    ['user-supervisor-arhiba-2','supervisor.arhiba2@cite-ambouli.dj','SUPERVISOR','site-arhiba','Naima','Nour','F'],
    ['user-nurse-ambouli','nurse.ambouli@cite-ambouli.dj','NURSE','site-ambouli','Khadra','Ali','F'],
    ['user-nurse-arhiba','nurse.arhiba@cite-ambouli.dj','NURSE','site-arhiba','Djibril','Osman','M'],
    ['user-counselor-ambouli','counselor.ambouli@cite-ambouli.dj','COUNSELOR','site-ambouli','Yacin','Ragueh','M'],
    ['user-counselor-arhiba','counselor.arhiba@cite-ambouli.dj','COUNSELOR','site-arhiba','Hawa','Kadar','F'],
    ['user-caissier-ambouli-1','caissier.ambouli1@cite-ambouli.dj','CAISSIER','site-ambouli','Mahad','Omar','M'],
    ['user-caissier-ambouli-2','caissier.ambouli2@cite-ambouli.dj','CAISSIER','site-ambouli','Fadumo','Yusuf','F'],
    ['user-caissier-arhiba-1','caissier.arhiba1@cite-ambouli.dj','CAISSIER','site-arhiba','Abdi','Hassan','M'],
    ['user-caissier-arhiba-2','caissier.arhiba2@cite-ambouli.dj','CAISSIER','site-arhiba','Amina','Ibrahim','F'],
  ];

  for (const [id, email, role, siteId, fn, ln, sexe] of staffDefs) {
    users.push([id,'tenant-ambouli',siteId,email,HASH,`${fn} ${ln}`,fn,ln,role,TRUE,null,'fr','fr',FALSE,null,TS,TS]);
    userSites.push([`us-${id}`,id,siteId,role,TS,TS]);
  }

  // Teachers
  for (const site of ['ambouli','arhiba']) {
    const siteId = `site-${site}`;
    for (let i = 1; i <= NB_ENSEIGNANTS_PAR_SITE; i++) {
      const id = `user-prof-${site}-${i}`;
      const fn = pick(i % 3 === 0 ? PRENOMS_F : PRENOMS_M);
      const ln = pick(NOMS);
      const email = `prof.${site}.${i}@cite-ambouli.dj`;
      users.push([id,'tenant-ambouli',siteId,email,HASH,`${fn} ${ln}`,fn,ln,'TEACHER',TRUE,null,'fr','fr',FALSE,null,TS,TS]);
      userSites.push([`us-${id}`,id,siteId,'TEACHER',TS,TS]);

      const ensId = `ens-${site}-${i}`;
      const matiereCode = SPECIALITE_PAR_RANG[i - 1];
      enseignants.push([ensId,'tenant-ambouli',id,`ENS-${site.toUpperCase().slice(0,3)}-${String(i).padStart(3,'0')}`,matiereCode, pick(['CDI','CDD']), '2022-09-01 00:00:00']);
      ensSites.push([`es-${site}-${i}`,ensId,siteId,TS]);

      const rhId = `rh-${site}-${i}`;
      const salaire = randInt(180000, 350000);
      fichesRH.push([rhId,'tenant-ambouli',ensId, pick(['CDI','CDD']), '2022-09-01 00:00:00', null, salaire, null, pick(['Licence','Master','CAPES']), randInt(1,5), pick(['PCE','PCF','PEA']), pick(BANQUES), `DJ${randInt(100000,999999)}${i}`, null, 30, 0, 0, null, null, TS, TS]);

      // 24 months of pay slips
      for (const yr of [2024, 2025]) {
        for (let m = 1; m <= 12; m++) {
          const bpId = `bp-${site}-${yr}-${String(m).padStart(2,'0')}-${String(i).padStart(3,'0')}`;
          const primes = randInt(5000, 20000);
          const deductions = randInt(2000, 8000);
          const net = salaire + primes - deductions;
          const dateP = `${yr}-${String(m).padStart(2,'0')}-28 12:00:00`;
          bulletinsPaie.push([bpId, rhId, m, yr, 160, salaire, primes, deductions, net, TRUE, dateP, `VIR-${yr}${String(m).padStart(2,'0')}-${i}`, TS]);
        }
      }
    }
  }

  // Users
  sql += batchInsert('users', ['id','tenantId','siteId','email','password','name','firstName','lastName','role','isActive','phone','langue','locale','mustChangePassword','lastLoginAt','createdAt','updatedAt'], users) + '\n\n';
  // User sites
  sql += batchInsert('user_sites', ['id','userId','siteId','role','createdAt','updatedAt'], userSites) + '\n\n';
  // Enseignants
  sql += batchInsert('enseignants', ['id','tenantId','userId','matricule','specialite','typeContrat','dateEntree'], enseignants) + '\n\n';
  // Enseignant sites
  sql += batchInsert('enseignant_sites', ['id','enseignantId','siteId','createdAt'], ensSites) + '\n\n';
  // Fiches RH
  sql += batchInsert('fiches_rh', ['id','tenantId','enseignantId','typeContrat','dateEntree','dateSortie','salaireBase','tarifHoraire','diplome','echelon','grade','banque','rib','iban','congesAnnuels','congesPris','absencesCount','evaluation','observations','createdAt','updatedAt'], fichesRH) + '\n\n';
  // Bulletins de paie
  sql += batchInsert('bulletins_paie', ['id','ficheRHId','mois','annee','heuresEffectuees','salaireBase','primes','deductions','netAPayer','isPaye','datePaiement','reference','createdAt'], bulletinsPaie) + '\n\n';

  return sql;
}

// ── File 05: Classes, Eleves, Parents ────────────────────────
function genFile05() {
  let sql = `-- 05-classes-eleves-parents.sql\n-- Cité Scolaire Ambouli — Classes, Élèves, Parents, Parcours, Alumni\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "learnos_preferences_parent" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "alumni" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "historique_classes" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "parcours_scolaires" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "eleve_parents" WHERE "eleveId" IN (SELECT id FROM "eleves" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "parents" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "eleves" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "classes" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "user_roles" WHERE "userId" IN (SELECT id FROM "users" WHERE "tenantId"='tenant-ambouli' AND "email" LIKE 'parent.%@cite-ambouli.dj');\nDELETE FROM "user_tenants" WHERE "userId" IN (SELECT id FROM "users" WHERE "tenantId"='tenant-ambouli' AND "email" LIKE 'parent.%@cite-ambouli.dj');\nDELETE FROM "users" WHERE "tenantId"='tenant-ambouli' AND "email" LIKE 'parent.%@cite-ambouli.dj';\n\n`;

  const classes = generateClasses();
  sql += batchInsert('classes', ['id','tenantId','siteId','structureId','niveau','nom','effectifMax','profPrincipalId','annee'], classes.map(c => [c.id,c.tenantId,c.siteId,c.structureId,c.niveau,c.nom,c.effectifMax,c.profPrincipalId,c.annee])) + '\n\n';

  // ── Une fiche élève par PERSONNE, un parcours par ANNÉE ──
  //
  // L'élève est écrit une seule fois, avec la classe de sa dernière
  // inscription ; ses deux années apparaissent dans `parcours_scolaires` et
  // `historique_classes`. C'est cette paire de lignes qui rend les analyses
  // longitudinales possibles.
  const eleves = [];
  const parents = [];
  const parentUsers = [];
  const parentUserTenants = [];
  const parentUserRoles = [];
  const eleveParents = [];
  const parcours = [];
  const historique = [];
  const alumni = [];
  const prefs = [];

  /// Fin de l'année scolaire ouverte par `anneeYear` (juillet suivant).
  const finAnnee = (anneeYear) => `${parseInt(anneeYear, 10) + 1}-07-05 00:00:00`;

  function mentionPour(moyenne) {
    if (moyenne >= 16) return 'Très bien';
    if (moyenne >= 14) return 'Bien';
    if (moyenne >= 12) return 'Assez bien';
    if (moyenne >= 10) return 'Passable';
    return null;
  }

  function appreciationPour(moyenne) {
    if (moyenne >= 14) return 'Excellent trimestre, continuez ainsi';
    if (moyenne >= 12) return 'Bon trimestre, poursuivez vos efforts';
    if (moyenne >= 10) return 'Travail correct, des progrès sont possibles';
    if (moyenne >= 8) return 'Travail insuffisant, un soutien est nécessaire';
    return 'Travail très insuffisant, rencontre conseiller';
  }

  function recommandationPour(niveau, moyenne) {
    if (niveau === 'Terminale') {
      if (moyenne >= 16) return 'EXCELLENTE_VOIE';
      if (moyenne >= 14) return 'FILIERE_SCIENTIFIQUE';
      if (moyenne >= 10) return pick(['FILIERE_LITTERAIRE', 'FILIERE_TECHNIQUE']);
      return 'REDOUBLEMENT';
    }
    if (moyenne >= 16) return 'EXCELLENTE_VOIE';
    if (moyenne < 8) return 'SOUTIEN_RENFORCE';
    if (moyenne < 10) return 'REDOUBLEMENT';
    return null;
  }

  for (const p of ALL_PERSONNES) {
    const premiere = p.inscriptions[0];
    const derniere = p.inscriptions[p.inscriptions.length - 1];
    const site = p.siteName;

    const sexe = rand() < 0.5 ? 'M' : 'F';
    const fn = sexe === 'M' ? pick(PRENOMS_M) : pick(PRENOMS_F);
    const ln = pick(NOMS);
    // L'âge se lit au niveau d'ENTRÉE : un redoublant a donc bien un an de
    // plus que ses camarades l'année suivante, sans traitement particulier.
    const birthYear = parseInt(p.anneeEntree, 10) - AGE_BY_NIVEAU[premiere.niveau];
    const birthDate = `${birthYear}-${String(randInt(1,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00`;
    // Le matricule porte l'année d'entrée — il ne bouge plus ensuite.
    const matricule = `${site.toUpperCase().slice(0,3)}-${p.anneeEntree}-${p.num}`;
    const gs = pick(GROUPE_SANGUIN);
    const contactNom = pick(PRENOMS_M) + ' ' + ln;
    const contactPhone = `+253 77 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`;

    const statut = p.sortie ? p.sortie.statut : 'ACTIF';
    const dateSortie = p.sortie ? p.sortie.date : null;
    const motifSortie = p.sortie ? p.sortie.motif : null;

    eleves.push([p.eleveId,'tenant-ambouli',p.siteId,matricule,ln,fn,birthDate,'Djibouti','DJ',sexe,null,statut,derniere.classeId,null,null,gs,null,null,null,null,contactNom,contactPhone,premiere.annee,null,`${p.anneeEntree}-09-15 00:00:00`,dateSortie,motifSortie,null,TS,TS,null]);

    // ── Parent : un seul par élève, créé à son entrée ──
    const pUserId = `user-parent-${site}-${p.num}`;
    const pFn = pick(PRENOMS_M);
    const pLn = ln; // même nom de famille
    const pEmail = `parent.${site}-${p.num}@cite-ambouli.dj`;
    const pPhone = `+253 77 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`;
    const relation = pick(['PERE','MERE','TUTEUR']);

    parentUsers.push([pUserId,'tenant-ambouli',p.siteId,pEmail,HASH,`${pFn} ${pLn}`,pFn,pLn,'PARENT',TRUE,pPhone,'fr','fr',TRUE,null,TS,TS]);
    parentUserTenants.push([`ut-${pUserId}`,pUserId,'tenant-ambouli','PARENT',TRUE,TRUE,TS,TS]);
    parentUserRoles.push([`ur-${pUserId}`,pUserId,'tenant-ambouli','PARENT',TRUE,TS,TS]);
    parents.push([p.parentId,'tenant-ambouli',pUserId,pLn,pFn,pEmail,pPhone,null,pick(PROFESSIONS),null,null,TS,TS]);
    eleveParents.push([p.eleveId,p.parentId,relation,TRUE]);
    prefs.push([`pref-${p.parentId}`,'tenant-ambouli',p.parentId,'fr',TRUE,'INFO',3,TS,TS]);

    // ── Une ligne de parcours et d'historique par année suivie ──
    p.inscriptions.forEach((insc, i) => {
      const suivante = p.inscriptions[i + 1];

      // Un bilan d'année est arrêté à la clôture de cette année-là. Le stamp
      // global (septembre 2024) datait les deux bilans du même jour, dont
      // celui de 2025-2026 — visiblement faux dès qu'on l'affiche.
      parcours.push([`par-${p.eleveId}-${insc.anneeYear}`,'tenant-ambouli',p.eleveId,insc.annee,insc.classeNom,insc.niveau,insc.moyenne,insc.rang,insc.effectif,insc.decision,mentionPour(insc.moyenne),recommandationPour(insc.niveau, insc.moyenne),appreciationPour(insc.moyenne),finAnnee(insc.anneeYear)]);

      // Le motif dit d'où vient l'élève : c'est lui que lit l'analyse des
      // motifs de transfert (A12), et la sortie ferme la période.
      const motif = insc.origine === 'NOUVEAU'
        ? 'Inscription'
        : (insc.origine === 'REDOUBLANT' ? 'Redoublement' : 'Promotion');
      const sortieHist = suivante ? finAnnee(insc.anneeYear) : (p.sortie ? p.sortie.date : null);
      historique.push([`hist-${p.eleveId}-${insc.anneeYear}`,'tenant-ambouli',p.eleveId,insc.classeId,`${insc.anneeYear}-09-15 00:00:00`,sortieHist,motif,`${insc.anneeYear}-09-15 00:00:00`]);
    });

    // ── Alumni : les Terminales reçues, des deux promotions ──
    if (p.sortie && p.sortie.statut === 'DIPLOME') {
      const alStatut = pick(['ETUDES_SUPERIEURES','EN_EMPLOI','RECHERCHE_EMPLOI']);
      const etab = alStatut === 'ETUDES_SUPERIEURES'
        ? pick(['Université de Djibouti','ENSI','EST','IUT'])
        : (alStatut === 'EN_EMPLOI' ? pick(['Banque de Djibouti','Ministère','Port de Djibouti']) : null);
      alumni.push([`alum-${p.eleveId}`,'tenant-ambouli',derniere.site,p.eleveId,ln,fn,pEmail,pPhone,null,sexe,birthDate,derniere.annee,derniere.classeNom,mentionPour(derniere.moyenne),`DIP-${derniere.anneeYear}-${p.num}`,alStatut,etab,null,'Djibouti','DJ',null,TRUE,null,TS,TS]);
    }
  }

  sql += batchInsert('users', ['id','tenantId','siteId','email','password','name','firstName','lastName','role','isActive','phone','langue','locale','mustChangePassword','lastLoginAt','createdAt','updatedAt'], parentUsers) + '\n\n';
  sql += batchInsert('user_tenants', ['id','userId','tenantId','role','isActive','isDefault','createdAt','updatedAt'], parentUserTenants) + '\n\n';
  sql += batchInsert('user_roles', ['id','userId','tenantId','role','isActive','createdAt','updatedAt'], parentUserRoles) + '\n\n';
  sql += batchInsert('eleves', ['id','tenantId','siteId','matricule','nom','prenom','dateNaissance','lieuNaissance','nationalite','sexe','photoUrl','statut','classeId','userId','identiteKey','groupeSanguin','allergies','besoinsSpeciaux','regime','transport','contactUrgenceNom','contactUrgencePhone','anneeInscription','numeroBoursier','dateInscription','dateSortie','motifSortie','importBatchId','createdAt','updatedAt','deletedAt'], eleves) + '\n\n';
  sql += batchInsert('parents', ['id','tenantId','userId','nom','prenom','email','phone','phone2','profession','adresse','photoUrl','createdAt','updatedAt'], parents) + '\n\n';

  // EleveParent uses composite PK
  if (eleveParents.length > 0) {
    const epChunks = [];
    for (let i = 0; i < eleveParents.length; i += 100) {
      const batch = eleveParents.slice(i, i + 100);
      const values = batch.map(r => `  (${r.map(val).join(', ')})`).join(',\n');
      epChunks.push(`INSERT INTO "eleve_parents" ("eleveId","parentId","lien","isGardien") VALUES\n${values}\nON CONFLICT ("eleveId","parentId") DO NOTHING;`);
    }
    sql += epChunks.join('\n\n') + '\n\n';
  }

  sql += batchInsert('parcours_scolaires', ['id','tenantId','eleveId','annee','classe','niveau','moyenneAnnuelle','rang','effectif','decision','mention','recommandation','commentaire','createdAt'], parcours) + '\n\n';
  sql += batchInsert('historique_classes', ['id','tenantId','eleveId','classeId','dateEntree','dateSortie','motif','createdAt'], historique) + '\n\n';
  sql += batchInsert('alumni', ['id','tenantId','siteId','eleveId','nom','prenom','email','telephone','photoUrl','sexe','dateNaissance','anneeDiplome','classeDepart','mention','numeroDiplome','statut','etablissement','formation','ville','pays','linkedin','accepteContact','notes','createdAt','updatedAt'], alumni) + '\n\n';
  sql += batchInsert('learnos_preferences_parent', ['id','tenantId','parentId','langue','alertesActives','niveauMinimal','plafondHebdomadaire','createdAt','updatedAt'], prefs, 'parentId') + '\n\n';

  return sql;
}

// ── File 06: EDT, Evaluations, Notes, Bulletins ──────────────
// ── Emploi du temps : un vrai placement sous contraintes ─────
//
// L'ancien générateur posait le jour et le créneau par arithmétique sur le
// code de la matière — `jours[(s + matCode.charCodeAt(0)) % 5]` — et tirait la
// salle au hasard entre 101 et 203. Le professeur était déduit du rang de la
// matière, donc identique pour toutes les classes d'un site. Résultat : 1 654
// créneaux plaçaient un enseignant devant deux classes à la même heure, 615
// plaçaient une classe sur deux cours simultanés, et 522 mettaient deux
// classes dans la même salle. Un emploi du temps qu'aucun établissement
// n'aurait pu afficher.
//
// On place désormais chaque heure de cours en vérifiant les trois ressources —
// la classe, l'enseignant, la salle — et en refusant de poser un cours là où
// l'une d'elles est déjà prise.

const JOURS = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI'];
const CRENEAUX = [['08:00','09:00'],['09:00','10:00'],['10:15','11:15'],['11:15','12:15'],['14:00','15:00'],['15:00','16:00']];

/// Volume horaire hebdomadaire par matière. Les totaux (26 h au collège comme
/// au lycée) tiennent dans les 30 créneaux de la semaine et laissent la marge
/// sans laquelle aucun placement sous contraintes n'aboutit.
const HEURES_HEBDO = {
  college: { MATH:4, FR:4, ANG:3, AR:2, HG:2, PC:2, SVT:2, EPS:2, TECH:1, ART:1, MUS:1, ISL:2 },
  lycee:   { MATH:4, FR:3, ANG:3, AR:2, HG:3, PC:3, SVT:2, EPS:2, PHILO:2, SES:2 },
};

/// Salles spécialisées, par matière. Le cours s'y tient si elle est libre ;
/// sinon il se fait dans la salle de la classe — un cours de SVT n'est pas
/// toujours un travail pratique. L'EPS fait exception : elle exige une
/// installation sportive, et le créneau est abandonné si aucune n'est libre.
const SALLES_SPECIALISEES = {
  PC:   { salles: ['Labo Physique 1', 'Labo Physique 2'], obligatoire: false },
  SVT:  { salles: ['Labo SVT'],                            obligatoire: false },
  TECH: { salles: ['Salle Info'],                           obligatoire: false },
  EPS:  { salles: ['Gymnase', 'Terrain de sport', 'Plateau sportif'], obligatoire: true },
};

/// Au-delà de douze classes sur la même matière au même moment, l'emploi du
/// temps trahit une génération sans contrainte — l'audit le signale. On en
/// fait une contrainte de placement plutôt qu'un constat après coup.
const MAX_CLASSES_SIMULTANEES_PAR_MATIERE = 12;

/**
 * Construit l'emploi du temps des deux années, sans aucun conflit de classe,
 * d'enseignant ni de salle.
 *
 * Renvoie `{ lignes, ensParClasseMatiere, nonPlaces }` : les créneaux prêts à
 * insérer, l'enseignant titulaire de chaque couple (classe, matière) — dont
 * les évaluations et les bulletins ont besoin pour être cohérents avec
 * l'emploi du temps — et le nombre d'heures qu'il a fallu renoncer à placer.
 */
function construireEmploisDuTemps(classes) {
  const rng = makeRng(70707);
  const lignes = [];
  const ensParClasseMatiere = new Map(); // `${classeId}|${matCode}` → ensId
  let nonPlaces = 0;

  for (const anneeYear of ['2024', '2025']) {
    const annee = anneeYear === '2024' ? '2024-2025' : '2025-2026';
    // Compté sur les DEUX sites : c'est ainsi que l'audit mesure la
    // simultanéité d'une matière à l'échelle de l'établissement.
    const nbParMatiereEtCreneau = new Map();

    for (const site of ['ambouli', 'arhiba']) {
      const clsSite = classes.filter(c => c.siteId === `site-${site}` && c.annee === annee);
      const occupEns = new Set();
      const occupSalle = new Set();
      const occupClasse = new Set();
      const chargeEns = new Map();

      // ── Titularisation : une classe garde le même professeur toute l'année
      // dans une matière donnée. Les classes sont réparties entre les
      // professeurs de la spécialité, à charge égale.
      const compteurTitulaire = new Map();
      for (const cls of clsSite) {
        const bareme = LYCEE_NIVEAUX.includes(cls.niveau) ? HEURES_HEBDO.lycee : HEURES_HEBDO.college;
        for (const matCode of Object.keys(bareme)) {
          const pool = ENSEIGNANTS_DU_SITE[site][matCode];
          const rang = compteurTitulaire.get(matCode) || 0;
          compteurTitulaire.set(matCode, rang + 1);
          ensParClasseMatiere.set(`${cls.id}|${matCode}`, pool[rang % pool.length]);
        }
      }

      // ── Les heures à placer, les plus contraintes d'abord : l'EPS exige une
      // installation sportive, et une matière lourde a moins de créneaux
      // possibles qu'une matière à une heure par semaine.
      const aPlacer = [];
      for (const cls of clsSite) {
        const bareme = LYCEE_NIVEAUX.includes(cls.niveau) ? HEURES_HEBDO.lycee : HEURES_HEBDO.college;
        for (const [matCode, heures] of Object.entries(bareme)) {
          for (let h = 0; h < heures; h++) {
            aPlacer.push({ cls, matCode, heures, rang: h });
          }
        }
      }
      aPlacer.sort((a, b) => {
        const pa = a.matCode === 'EPS' ? 0 : 1, pb = b.matCode === 'EPS' ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return b.heures - a.heures;
      });

      for (const tache of aPlacer) {
        const { cls, matCode } = tache;
        const ensId = ensParClasseMatiere.get(`${cls.id}|${matCode}`);
        const spec = SALLES_SPECIALISEES[matCode];

        // Candidats : tous les créneaux de la semaine, du moins chargé au plus
        // chargé pour cette matière, avec un départ aléatoire pour ne pas
        // toujours remplir le lundi matin en premier.
        const candidats = [];
        for (let j = 0; j < JOURS.length; j++) {
          for (let c = 0; c < CRENEAUX.length; c++) candidats.push([j, c]);
        }
        for (let i = candidats.length - 1; i > 0; i--) {
          const k = Math.floor(rng() * (i + 1));
          [candidats[i], candidats[k]] = [candidats[k], candidats[i]];
        }
        candidats.sort((a, b) => {
          const ka = `${JOURS[a[0]]}|${CRENEAUX[a[1]][0]}|${matCode}`;
          const kb = `${JOURS[b[0]]}|${CRENEAUX[b[1]][0]}|${matCode}`;
          return (nbParMatiereEtCreneau.get(ka) || 0) - (nbParMatiereEtCreneau.get(kb) || 0);
        });

        let pose = null;
        // Première passe en évitant deux heures de la même matière le même
        // jour ; seconde passe sans cette préférence, si la semaine est serrée.
        for (const strict of [true, false]) {
          for (const [j, c] of candidats) {
            const jour = JOURS[j], [debut, fin] = CRENEAUX[c];
            const creneau = `${jour}|${debut}`;
            if (occupClasse.has(`${creneau}|${cls.id}`)) continue;
            if (occupEns.has(`${creneau}|${ensId}`)) continue;
            if (strict && occupClasse.has(`${jour}|${cls.id}|${matCode}`)) continue;

            const kMat = `${creneau}|${matCode}`;
            if ((nbParMatiereEtCreneau.get(kMat) || 0) >= MAX_CLASSES_SIMULTANEES_PAR_MATIERE) continue;

            // Salle : la spécialisée si elle est libre, sinon celle de la
            // classe — sauf pour l'EPS, où l'installation est obligatoire.
            let salle = null;
            if (spec) {
              salle = spec.salles.find(s => !occupSalle.has(`${creneau}|${site}|${s}`)) || null;
            }
            if (!salle) {
              if (spec && spec.obligatoire) continue;
              salle = cls.salle; // salle attitrée : jamais disputée
            }

            pose = { jour, debut, fin, salle, creneau };
            break;
          }
          if (pose) break;
        }

        if (!pose) { nonPlaces++; continue; }

        occupClasse.add(`${pose.creneau}|${cls.id}`);
        occupClasse.add(`${pose.jour}|${cls.id}|${matCode}`);
        occupEns.add(`${pose.creneau}|${ensId}`);
        occupSalle.add(`${pose.creneau}|${site}|${pose.salle}`);
        chargeEns.set(ensId, (chargeEns.get(ensId) || 0) + 1);
        const kMat = `${pose.creneau}|${matCode}`;
        nbParMatiereEtCreneau.set(kMat, (nbParMatiereEtCreneau.get(kMat) || 0) + 1);

        lignes.push([
          `edt-${cls.id}-${matCode}-${tache.rang}`, 'tenant-ambouli', cls.id, `mat-${matCode}`,
          ensId, pose.jour, pose.debut, pose.fin, pose.salle, annee,
        ]);
      }
    }
  }

  return { lignes, ensParClasseMatiere, nonPlaces };
}

function genFile06() {
  let sql = `-- 06-edt-evaluations-notes-bulletins.sql\n-- Cité Scolaire Ambouli — EDT, Évaluations, Notes, Bulletins\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "bulletin_matieres" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "bulletins" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "notes" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "evaluations" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "sessions_examen" WHERE "examId" IN (SELECT id FROM "examens" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "examens" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "emplois_temps" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const classes = generateClasses();

  // ── EDT : placement sous contraintes (zéro conflit) ────────
  const { lignes: edtRows, ensParClasseMatiere, nonPlaces } = construireEmploisDuTemps(classes);
  if (nonPlaces > 0) {
    console.warn(`  [EDT] ${nonPlaces} créneaux non placés (capacité saturée)`);
  }

  // ── Nom complet de chaque enseignant ────────────────────────
  // Reconstruit avec la même logique déterministe que genFile04 : la graine
  // globale `seed` n'est pas touchée, on utilise `pick()` en isolation.
  const ensNomComplet = new Map();
  const savedSeed = seed;
  for (const site of ['ambouli', 'arhiba']) {
    for (let i = 1; i <= NB_ENSEIGNANTS_PAR_SITE; i++) {
      seed = 42 + i * 7 + (site === 'arhiba' ? 1000 : 0);
      const fn = pick(i % 3 === 0 ? PRENOMS_F : PRENOMS_M);
      const ln = pick(NOMS);
      ensNomComplet.set(`ens-${site}-${i}`, `${fn} ${ln}`);
    }
  }
  seed = savedSeed;

  const evalTypes = ['CONTROLE','DEVOIR','EXAMEN'];
  const matieresByNiveau = {
    collège: ['MATH','FR','ANG','AR','HG','PC','SVT','EPS','TECH','ART','MUS','ISL'],
    lycée: ['MATH','FR','ANG','AR','HG','PC','SVT','EPS','PHILO','SES']
  };

  // Élèves par classe
  const classStudents = {};
  for (const e of ALL_ELEVES) {
    if (!classStudents[e.classeId]) classStudents[e.classeId] = [];
    classStudents[e.classeId].push(e.eleveId);
  }

  const evaluations = [];
  const notes = [];

  // ── Phase 1 : évaluations et notes ─────────────────────────
  // On collecte les notes par (classe, matière, période) pour calculer les
  // agrégats des bulletins dans la phase 2.
  // Clé `${classeId}|${matCode}|${periodeId}` → [note1, note2, …]
  const notesByCMP = new Map();
  // Clé `${classeId}|${eleveId}|${matCode}|${periodeId}` → noteValue
  const noteByECMP = new Map();

  for (const cls of classes) {
    const siteName = cls.siteId === 'site-ambouli' ? 'ambouli' : 'arhiba';
    const isLycee = LYCEE_NIVEAUX.includes(cls.niveau);
    const matiereCodes = isLycee ? matieresByNiveau['lycée'] : matieresByNiveau['collège'];
    const anneeYear = cls.annee === '2024-2025' ? '2024' : '2025';
    const periods = anneeYear === '2024'
      ? ['per-y2024-t1-amb','per-y2024-t2-amb','per-y2024-t3-amb']
      : ['per-y2025-t1-amb','per-y2025-t2-amb','per-y2025-t3-amb'];

    const studs = classStudents[cls.id] || [];

    for (const periodeId of periods) {
      for (const matCode of matiereCodes) {
        const matId = `mat-${matCode}`;
        const ensId = ensParClasseMatiere.get(`${cls.id}|${matCode}`) || `ens-${siteName}-1`;
        const evalId = `eval-${cls.id}-${matCode}-${periodeId}-0`;
        const evalType = pick(evalTypes);
        const periodIdx = periods.indexOf(periodeId);
        const evalMonth = anneeYear === '2024'
          ? 10 + periodIdx : 10 + periodIdx;
        const evalDate = `${anneeYear === '2024' ? 2024 : 2025}-${String(Math.min(evalMonth, 12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 12:00:00`;

        evaluations.push([evalId,'tenant-ambouli',`${matCode} ${periodeId}`,evalType,cls.id,matId,periodeId,evalDate,60,randInt(1,3),null,'TERMINE',TS,TS]);

        const cmpKey = `${cls.id}|${matCode}|${periodeId}`;
        const notesForCMP = [];

        for (const eleveId of studs) {
          const profileHash = (eleveId.charCodeAt(eleveId.length-1) + eleveId.charCodeAt(eleveId.length-2)) % 100;
          let baseNote;
          if (profileHash < 15) baseNote = 14 + rand() * 4;
          else if (profileHash < 40) baseNote = 12 + rand() * 2;
          else if (profileHash < 75) baseNote = 10 + rand() * 2;
          else if (profileHash < 90) baseNote = 8 + rand() * 2;
          else baseNote = 4 + rand() * 4;

          if (profileHash < 8) baseNote += periodIdx * 1.5;
          else if (profileHash >= 8 && profileHash < 16) baseNote -= periodIdx * 1.5;
          baseNote = Math.max(2, Math.min(20, Math.round(baseNote * 100) / 100));

          let appreciation = 'Travail correct';
          if (baseNote >= 14) appreciation = 'Très bon travail';
          else if (baseNote >= 12) appreciation = 'Bon travail';
          else if (baseNote >= 10) appreciation = 'Travail correct';
          else if (baseNote >= 8) appreciation = 'Travail insuffisant';
          else appreciation = 'Travail très insuffisant';

          notes.push([`note-${evalId}-${eleveId}`,'tenant-ambouli',eleveId,cls.id,matId,periodeId,evalType,`${matCode} ${periodeId}`,baseNote,20,randInt(1,3),evalDate,appreciation,null,null,TRUE,evalId,TS,TS]);
          notesForCMP.push(baseNote);
          noteByECMP.set(`${cls.id}|${eleveId}|${matCode}|${periodeId}`, baseNote);
        }
        notesByCMP.set(cmpKey, notesForCMP);
      }
    }
  }

  // ── Phase 2 : bulletins avec agrégats calculés ─────────────
  const bulletins = [];
  const bulletinMatieres = [];

  for (const cls of classes) {
    const siteName = cls.siteId === 'site-ambouli' ? 'ambouli' : 'arhiba';
    const isLycee = LYCEE_NIVEAUX.includes(cls.niveau);
    const matiereCodes = isLycee ? matieresByNiveau['lycée'] : matieresByNiveau['collège'];
    const anneeYear = cls.annee === '2024-2025' ? '2024' : '2025';
    const periods = anneeYear === '2024'
      ? ['per-y2024-t1-amb','per-y2024-t2-amb','per-y2024-t3-amb']
      : ['per-y2025-t1-amb','per-y2025-t2-amb','per-y2025-t3-amb'];

    const studs = classStudents[cls.id] || [];
    if (studs.length === 0) continue;

    for (const periodeId of periods) {
      // ── Moyenne générale de chaque élève sur cette période ──
      const moyenneParEleve = new Map();
      for (const eleveId of studs) {
        let somme = 0, count = 0;
        for (const matCode of matiereCodes) {
          const n = noteByECMP.get(`${cls.id}|${eleveId}|${matCode}|${periodeId}`);
          if (n !== undefined) { somme += n; count++; }
        }
        moyenneParEleve.set(eleveId, count > 0 ? Math.round(somme / count * 100) / 100 : 10);
      }

      // ── Agrégats de classe ──────────────────────────────────
      const moyennes = [...moyenneParEleve.values()].sort((a, b) => b - a);
      const moyenneClasse = Math.round(moyennes.reduce((a, b) => a + b, 0) / moyennes.length * 100) / 100;
      const moyennePremier = moyennes[0];

      // Rang (1 = meilleur)
      const rangs = new Map();
      const sorted = [...moyenneParEleve.entries()].sort((a, b) => b[1] - a[1]);
      sorted.forEach(([id], idx) => rangs.set(id, idx + 1));

      for (const eleveId of studs) {
        const moyenne = moyenneParEleve.get(eleveId);
        const rang = rangs.get(eleveId);

        const decision = moyenne >= 10 ? 'Passage' : (cls.niveau === 'Terminale' ? 'Ajourné' : 'Redoublement');
        let appGen = 'Trimestre satisfaisant';
        if (moyenne >= 14) appGen = 'Excellent trimestre';
        else if (moyenne >= 12) appGen = 'Bon trimestre';
        else if (moyenne >= 10) appGen = 'Trimestre correct';
        else appGen = 'Trimestre insuffisant';

        const bullId = `bull-${eleveId}-${periodeId}`;
        bulletins.push([bullId,'tenant-ambouli',eleveId,periodeId,moyenne,moyenneClasse,moyennePremier,randInt(0,10),rang,studs.length,appGen,decision,TRUE,TS,null,TS,TS]);

        // ── Bulletin matières : TOUTES les matières ───────────
        for (const matCode of matiereCodes) {
          const matId = `mat-${matCode}`;
          const cmpKey = `${cls.id}|${matCode}|${periodeId}`;
          const allNotes = notesByCMP.get(cmpKey) || [];
          const matMoy = noteByECMP.get(`${cls.id}|${eleveId}|${matCode}|${periodeId}`) || 10;

          // Agrégats par matière dans la classe
          const moyMax = allNotes.length > 0 ? Math.max(...allNotes) : matMoy;
          const moyMin = allNotes.length > 0 ? Math.min(...allNotes) : matMoy;

          // Rang dans la matière
          const sortedMat = [...allNotes].sort((a, b) => b - a);
          const matRang = sortedMat.indexOf(matMoy) + 1 || Math.ceil(sortedMat.length / 2);

          // Enseignant titulaire
          const ensId = ensParClasseMatiere.get(`${cls.id}|${matCode}`) || `ens-${siteName}-1`;
          const nomProf = ensNomComplet.get(ensId) || 'Enseignant';

          // Appréciation matière
          let appMat = 'Travail correct';
          if (matMoy >= 14) appMat = 'Très bon travail';
          else if (matMoy >= 12) appMat = 'Bon travail';
          else if (matMoy >= 10) appMat = 'Travail correct';
          else if (matMoy >= 8) appMat = 'Travail insuffisant';
          else appMat = 'Travail très insuffisant';

          bulletinMatieres.push([`bm-${bullId}-${matCode}`,'tenant-ambouli',bullId,matId,nomProf,randInt(1,5),matMoy,matRang,moyMax,moyMin,appMat]);
        }
      }
    }
  }

  sql += batchInsert('emplois_temps', ['id','tenantId','classeId','matiereId','enseignantId','jour','heureDebut','heureFin','salle','annee'], edtRows) + '\n\n';
  sql += batchInsert('evaluations', ['id','tenantId','titre','type','classeId','matiereId','periodeId','date','duree','coefficient','description','statut','createdAt','updatedAt'], evaluations) + '\n\n';
  sql += batchInsert('notes', ['id','tenantId','eleveId','classeId','matiereId','periodeId','type','intitule','valeur','noteMax','coefficient','date','appreciation','commentaire','saisieParId','isPubliee','evaluationId','createdAt','updatedAt'], notes) + '\n\n';
  sql += batchInsert('bulletins', ['id','tenantId','eleveId','periodeId','moyenneGenerale','moyenneClasse','moyennePremier','heuresAbsence','rang','effectifClasse','appreciation','decision','isPublie','publishedAt','pdfUrl','createdAt','updatedAt'], bulletins) + '\n\n';
  sql += batchInsert('bulletin_matieres', ['id','tenantId','bulletinId','matiereId','nomProfesseur','coefficient','moyenneEleve','rang','moyenneMax','moyenneMin','appreciation'], bulletinMatieres) + '\n\n';

  // Examens (10 total, 5 per site) with sessions
  const examens = [];
  const sessionExamens = [];
  const niveauxExam = ['6ème','4ème','3ème','2nde','Terminale'];
  const matieresExam = ['Mathématiques','Français','Histoire-Géographie','Sciences Physiques','SVT','Anglais'];
  for (let i = 0; i < 10; i++) {
    const site = i < 5 ? 'site-ambouli' : 'site-arhiba';
    const exId = `examen-${i+1}`;
    const isPastEx = i < 7;
    const dateDebut = isPastEx ? `2025-${String(randInt(10,12)).padStart(2,'0')}-01 00:00:00` : `2026-${String(randInt(1,5)).padStart(2,'0')}-01 00:00:00`;
    const dateFin = isPastEx ? `2025-${String(randInt(10,12)).padStart(2,'0')}-15 00:00:00` : `2026-${String(randInt(1,5)).padStart(2,'0')}-15 00:00:00`;
    const statut = isPastEx ? 'TERMINE' : 'PROGRAMME';
    const intitule = isPastEx ? `Examen ${niveauxExam[i % niveauxExam.length]} ${i < 5 ? 'Trimestre 1' : 'Trimestre 2'}` : `Examen Blanc ${niveauxExam[i % niveauxExam.length]}`;
    examens.push([exId,'tenant-ambouli',site,intitule,`Examen pour ${niveauxExam[i % niveauxExam.length]}`,statut,dateDebut,dateFin]);
    const nbSessions = randInt(2, 3);
    for (let s = 0; s < nbSessions; s++) {
      const sesId = `ses-${exId}-${s+1}`;
      const sesDate = isPastEx ? `2025-${String(randInt(10,12)).padStart(2,'0')}-${String(randInt(1,15)).padStart(2,'0')} 00:00:00` : `2026-${String(randInt(1,5)).padStart(2,'0')}-${String(randInt(1,15)).padStart(2,'0')} 00:00:00`;
      sessionExamens.push([sesId,exId,matieresExam[s % matieresExam.length],sesDate,'08:00','10:00',`Salle ${s+1}`,null,niveauxExam[i % niveauxExam.length]]);
    }
  }
  sql += batchInsert('examens', ['id','tenantId','siteId','intitule','description','statut','dateDebut','dateFin'], examens) + '\n\n';
  sql += batchInsert('sessions_examen', ['id','examId','matiereNom','date','heureDebut','heureFin','salle','surveillants','niveau'], sessionExamens) + '\n\n';

  return sql;
}

// ── File 07: Facturation ─────────────────────────────────────
function genFile07() {
  let sql = `-- 07-facturation-paiements-relances.sql\n-- Cité Scolaire Ambouli — Facturation, Échéanciers, Paiements, Relances\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "exclusions_eleve" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "relances" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "paiements" WHERE "factureId" IN (SELECT id FROM "factures" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "echeances_paiement" WHERE "factureId" IN (SELECT id FROM "factures" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "echeanciers" WHERE "factureId" IN (SELECT id FROM "factures" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "factures" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const factures = [];
  const echeanciers = [];
  const echeances = [];
  const paiements = [];
  const relances = [];
  const exclusions = [];

  // Re-generate student IDs
  const classes = generateClasses();
  seed = 42;
  let ec = { ambouli: { '2024': 0, '2025': 0 }, arhiba: { '2024': 0, '2025': 0 } };
  let factIdx = 0, echIdx = 0, paiIdx = 0, relIdx = 0;
  const methodes = ['ESPECES','CAC_PAY','DAHAB_PLUS','SABA_PAY'];
  // Une facture par INSCRIPTION : un élève présent les deux ans est facturé
  // deux fois, et l'identifiant porte donc l'année pour ne pas se télescoper.
  const elevesList = ALL_ELEVES.map(e => ({
    eleveId: e.eleveId,
    parentId: e.parentId,
    site: e.site,
    annee: e.annee,
    anneeYear: e.anneeYear,
    isLycee: e.isLycee,
    montant: e.isLycee ? 212000 : 160000,
  }));

  for (const e of elevesList) {
    factIdx++;
    const factId = `fact-${e.eleveId}-${e.anneeYear}`;
    const profileRoll = rand();
    let statut;
    if (profileRoll < 0.70) statut = 'PAYEE';
    else if (profileRoll < 0.90) statut = 'EN_RETARD';
    else statut = 'EN_ATTENTE';

    const montantPaye = statut === 'PAYEE' ? e.montant : (statut === 'EN_RETARD' ? Math.round(e.montant * 0.5) : 0);
    factures.push([factId,'tenant-ambouli',e.site,e.eleveId,`F-${factIdx}`,`Scolarité ${e.annee}`,e.montant,'DJF',statut,`${e.annee.slice(0,4)}-10-15 00:00:00`,'user-accountant-ambouli',TS,TS]);

    // Echeancier
    const echId = `ech-${factId}`;
    echeanciers.push([echId,factId,10,30,`${e.annee.slice(0,4)}-10-15 00:00:00`,statut === 'PAYEE' ? 'COMPLETE' : 'ACTIF',TS,TS]);

    // 10 echeances
    for (let n = 1; n <= 10; n++) {
      echIdx++;
      const echMontant = Math.round(e.montant / 10);
      const echDate = new Date();
      echDate.setFullYear(parseInt(e.annee.slice(0,4)), 9 + n - 1, 15);
      const dateStr = `${echDate.getFullYear()}-${String(echDate.getMonth()+1).padStart(2,'0')}-15 00:00:00`;
      let echStatut = 'EN_ATTENTE';
      if (statut === 'PAYEE') echStatut = 'PAYEE';
      else if (statut === 'EN_RETARD' && n <= 5) echStatut = 'PAYEE';
      else if (statut === 'EN_RETARD') echStatut = 'EN_RETARD';

      let paiementId = null;
      let payeeLe = null;
      if (echStatut === 'PAYEE') {
        paiIdx++;
        paiementId = `pai-${factId}-${n}`;
        payeeLe = dateStr;
        paiements.push([paiementId,factId,echMontant,'DJF',pick(methodes),`REF-${paiIdx}`,dateStr,null,'user-accountant-ambouli']);
      }

      echeances.push([`eche-${factId}-${n}`,echId,factId,n,echMontant,'DJF',dateStr,echStatut,paiementId,payeeLe,TS,TS]);
    }

    // Cantine (40% of students)
    if (rand() < 0.4) {
      factIdx++;
      const cantId = `fact-cantine-${e.eleveId}-${e.anneeYear}`;
      const cantMontant = 60000;
      const cantStatut = statut === 'PAYEE' ? 'PAYEE' : 'EN_ATTENTE';
      factures.push([cantId,'tenant-ambouli',e.site,e.eleveId,`F-C-${factIdx}`,`Cantine ${e.annee}`,cantMontant,'DJF',cantStatut,`${e.annee.slice(0,4)}-10-15 00:00:00`,'user-accountant-ambouli',TS,TS]);
    }

    // Relances for EN_RETARD — sequential niveaux (1, then 2, then 3) in chronological order
    if (statut === 'EN_RETARD') {
      const nbRelances = randInt(1, 3);
      const canal = pick(['SMS','WHATSAPP','EMAIL','COURRIER']);
      const envoyeePar = pick(['user-accountant-ambouli','user-accountant-arhiba','user-principal-coll-amb']);
      for (let n = 1; n <= nbRelances; n++) {
        relIdx++;
        // Each relance is sent progressively later (month increases with niveau)
        const relMonth = Math.min(n + 1, 6);
        relances.push([`rel-${factId}-${n}`,'tenant-ambouli',factId,n,canal,`Relance niveau ${n} pour la facture F-${factIdx}`,envoyeePar,`2025-0${relMonth}-15 12:00:00`]);
      }
    }
  }

  // Exclusions (6 total, 3 per site)
  const exclEleves = elevesList.filter(e => e.annee === '2024-2025').slice(0, 6);
  for (let i = 0; i < exclEleves.length; i++) {
    const e = exclEleves[i];
    exclusions.push([`excl-${e.eleveId}-${e.anneeYear}`,'tenant-ambouli',e.eleveId,'NON_PAIEMENT_REPETE','Factures impayées malgré relances','2025-03-01 00:00:00',null,null,null,'user-principal-coll-amb',TS]);
  }

  sql += batchInsert('factures', ['id','tenantId','siteId','eleveId','numero','libelle','montant','devise','statut','echeance','createdById','createdAt','updatedAt'], factures) + '\n\n';
  sql += batchInsert('echeanciers', ['id','factureId','nbEcheances','intervalleJours','datePremiereEcheance','statut','createdAt','updatedAt'], echeanciers) + '\n\n';
  sql += batchInsert('paiements', ['id','factureId','montant','devise','methode','reference','date','recu','enregistreParId'], paiements) + '\n\n';
  sql += batchInsert('echeances_paiement', ['id','echeancierId','factureId','numero','montant','devise','dateEcheance','statut','paiementId','payeeLe','createdAt','updatedAt'], echeances) + '\n\n';
  sql += batchInsert('relances', ['id','tenantId','factureId','niveau','canal','message','envoyeeParId','envoyeeLe'], relances) + '\n\n';
  sql += batchInsert('exclusions_eleve', ['id','tenantId','eleveId','motif','details','dateDebut','dateFin','leveeParId','leveeLe','decideeParId','createdAt'], exclusions) + '\n\n';

  return sql;
}

// ── File 08: Vie scolaire & Santé ────────────────────────────
function genFile08() {
  let sql = `-- 08-vie-scolaire-sante.sql\n-- Cité Scolaire Ambouli — Vie scolaire & Santé\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "dispenses_matiere" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "documents" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "entretiens_conseiller" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "sanctions" WHERE "incidentId" IN (SELECT id FROM "incidents" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "incidents" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "passages_infirmerie" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "fiches_sanitaires" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "absences" WHERE "tenantId"='tenant-ambouli';\n\n`;

  // Absences, incidents, passages : un jeu par INSCRIPTION, rattaché à
  // l'année où les faits ont eu lieu.
  const allEleves = ALL_ELEVES.map(e => ({ id: e.eleveId, siteId: e.site, site: e.siteName, classeId: e.classeId, anneeYear: e.anneeYear }));

  const fichesSan = [];
  const absences = [];
  const passages = [];
  const incidents = [];
  const sanctions = [];
  const entretiens = [];
  const dispenses = [];
  const documents = [];

  // Fiches sanitaires : une par ÉLÈVE, pas une par année — la relation est
  // 1‑1 côté schéma (`FicheSanitaire?`).
  for (const e of ALL_PERSONNES.map(p => ({ id: p.eleveId, siteId: p.siteId }))) {
    const allerg = pick(['{Aucune}','{Pollen}','{Arachide}','{Poussiere}','{Aucune}']);
    const traitements = rand() < 0.2 ? `'{"medicament":"Sirop","dose":"5ml","frequence":"3x/jour"}'::jsonb` : null;
    const contacts = `'{"nom":"Parent","relation":"Pere","telephone":"+25377123456"}'::jsonb`;
    const vaccins = `'{"vaccin":"BCG","date":"2015-03-01","rappel":"2025-03-01"}'::jsonb`;
    fichesSan.push([`fs-${e.id}`,'tenant-ambouli',e.siteId,e.id,allerg,traitements,rand() < 0.05,contacts,null,vaccins,null,TS,TS]);
  }

  // ════════════════════════════════════════════════════════════════
  // ABSENCES — logique de décrochage scolaire
  // ════════════════════════════════════════════════════════════════
  // Profils d'absence par type d'élève:
  // - excellent/good: peu d'absences (2-4/an), majoritairement JUSTIFIEES (maladie)
  // - average: absences modérées (4-8/an), mix justifié/injustifié
  // - weak/veryWeak: absences nombreuses (8-20/an), majoritairement INJUSTIFIEES
  // - décrochage: hausse d'absences en fin d'année (plus en T3 qu'en T1)
  // - abandon: élève ABANDONNE, arrêt brutal en cours d'année
  let absIdx = 0;
  // Marquer certains élèves faibles comme "décrochage" (hausse d'absences)
  // et d'autres comme "abandon" (statut ABANDONNE)
  const decrochageIds = new Set(); // élève à risque (hausse d'absences)
  const abandonIds = new Set(); // élève ayant abandonné
  for (const e of allEleves) {
    const ph = (parseInt(e.id.slice(-4)) * 37) % 100;
    if (ph >= 90) {
      // veryWeak: 30% décrochage, 15% abandon
      if (rand() < 0.30) decrochageIds.add(e.id);
      else if (rand() < 0.15) abandonIds.add(e.id);
    } else if (ph >= 75) {
      // weak: 15% décrochage, 5% abandon
      if (rand() < 0.15) decrochageIds.add(e.id);
      else if (rand() < 0.05) abandonIds.add(e.id);
    } else if (ph >= 40) {
      // average: 5% décrochage
      if (rand() < 0.05) decrochageIds.add(e.id);
    }
  }

  for (const e of allEleves) {
    const ph = (parseInt(e.id.slice(-4)) * 37) % 100;
    const isDecrochage = decrochageIds.has(e.id);
    const isAbandon = abandonIds.has(e.id);

    // Déterminer le nombre d'absences selon le profil
    let nbAbs, motifPool, justifRate;
    if (ph < 15) { nbAbs = randInt(2, 4); motifPool = ['MALADIE','MALADIE','FAMILIALE']; justifRate = 0.90; }
    else if (ph < 40) { nbAbs = randInt(3, 6); motifPool = ['MALADIE','FAMILIALE','TRANSPORT']; justifRate = 0.80; }
    else if (ph < 75) { nbAbs = randInt(4, 8); motifPool = ['MALADIE','INJUSTIFIE','FAMILIALE','TRANSPORT']; justifRate = 0.55; }
    else if (ph < 90) { nbAbs = randInt(8, 14); motifPool = ['INJUSTIFIE','INJUSTIFIE','MALADIE','AUTRE']; justifRate = 0.30; }
    else { nbAbs = randInt(12, 20); motifPool = ['INJUSTIFIE','INJUSTIFIE','INJUSTIFIE','AUTRE']; justifRate = 0.15; }

    // Décrochage: plus d'absences en fin d'année (T3 > T2 > T1)
    if (isDecrochage) nbAbs = Math.round(nbAbs * 1.5);

    // Abandon: arrêt brutal vers février-mars
    const abandonMonth = isAbandon ? randInt(2, 4) : null; // mois d'arrêt (février-avril)

    for (let i = 0; i < nbAbs; i++) {
      absIdx++;
      const isRetard = rand() < 0.25;
      const motif = pick(motifPool);

      // Date d'absence selon le profil
      let dateAbs;
      const anneeDebut = parseInt(e.anneeYear, 10);
      const anneeFin = anneeDebut + 1;
      if (isDecrochage) {
        // Concentrer les absences en T3 (février → juin de l'année suivie)
        const decrochMonth = pick([{y:anneeFin,m:4},{y:anneeFin,m:5},{y:anneeFin,m:6},{y:anneeFin,m:3},{y:anneeFin,m:2}]);
        const day = randInt(1, 28);
        const d = new Date(decrochMonth.y, decrochMonth.m - 1, day);
        let dow = d.getDay();
        if (dow === 5) day > 1 ? day - 1 : day + 2;
        if (dow === 6) day > 2 ? day - 2 : day + 1;
        dateAbs = `${decrochMonth.y}-${String(decrochMonth.m).padStart(2,'0')}-${String(Math.max(1,Math.min(28,day))).padStart(2,'0')} 08:00:00`;
      } else if (isAbandon && abandonMonth) {
        // Absences concentrées avant l'abandon (septembre à abandonMonth)
        const months = [{y:anneeDebut,m:9},{y:anneeDebut,m:10},{y:anneeDebut,m:11},{y:anneeDebut,m:12},{y:anneeFin,m:1},{y:anneeFin,m:2},{y:anneeFin,m:3},{y:anneeFin,m:4}];
        const validMonths = months.filter(mo => mo.m <= abandonMonth);
        const mo = pick(validMonths);
        const day = randInt(1, 28);
        dateAbs = `${mo.y}-${String(mo.m).padStart(2,'0')}-${String(day).padStart(2,'0')} 08:00:00`;
      } else {
        dateAbs = jourEcoleAnnee(e.anneeYear, '08');
      }

      // Statut: JUSTIFIEE pour les bons élèves, INJUSTIFIEE pour les faibles
      let statut;
      if (motif === 'INJUSTIFIE') {
        statut = isPast(dateAbs) ? 'INJUSTIFIEE' : 'EN_ATTENTE';
      } else {
        statut = isPast(dateAbs)
          ? (rand() < justifRate ? 'JUSTIFIEE' : 'INJUSTIFIEE')
          : 'EN_ATTENTE';
      }

      const parentNotifie = rand() < 0.70;
      const parentNotifieAt = parentNotifie ? dateAbs : null;
      absences.push([`abs-${absIdx}`,'tenant-ambouli',e.id,dateAbs,isRetard ? '08:00' : null, isRetard ? '08:30' : null,isRetard,motif,statut,null,null,null,parentNotifie,parentNotifieAt,TS,TS]);
    }
  }
  console.log(`  [genFile08] Absences: ${absIdx} total, décrochage=${decrochageIds.size}, abandon=${abandonIds.size}`);

  // Passages infirmerie (10%)
  let pasIdx = 0;
  for (const e of allEleves.filter(() => rand() < 0.10)) {
    pasIdx++;
    const motif = pick(['Maux de tête','Blessure','Malaise','Fièvre','Allergie']);
    const soin = pick(['Repos 15min','Pansement','Paracétamol','Observation']);
    const suite = pick(['retour_en_cours','retour_en_cours','renvoi_domicile']);
    passages.push([`pas-${pasIdx}`,'tenant-ambouli',e.siteId,e.id,dateAnnee(e.anneeYear, '10'),motif,soin,suite,suite === 'retour_en_cours',randInt(15,60),e.site === 'ambouli' ? 'user-nurse-ambouli' : 'user-nurse-arhiba',null,TS,TS]);
  }

  // ════════════════════════════════════════════════════════════════
  // INCIDENTS — corrélés au profil (élèves faibles = plus d'incidents)
  // ════════════════════════════════════════════════════════════════
  let incIdx = 0, sanIdx = 0;
  const incidentTypes = ['RETARD','BAVARDAGE','INSOLENCE','BAGARRE','TRICHE','VANDALISM'];
  const sanctionTypes = ['AVERTISSEMENT','BLAME','EXCLUSION_COURS','CONVOCATION_PARENTS'];
  for (const e of allEleves) {
    const ph = (parseInt(e.id.slice(-4)) * 37) % 100;
    // Taux d'incident selon le profil
    let incidentRate;
    if (ph < 15) incidentRate = 0.03; // excellent: 3%
    else if (ph < 40) incidentRate = 0.06; // good: 6%
    else if (ph < 75) incidentRate = 0.10; // average: 10%
    else if (ph < 90) incidentRate = 0.20; // weak: 20%
    else incidentRate = 0.30; // veryWeak: 30%

    if (rand() > incidentRate) continue;

    // Nombre d'incidents (1-3, plus pour les faibles)
    const nbInc = ph >= 75 ? randInt(1, 3) : 1;
    for (let i = 0; i < nbInc; i++) {
      incIdx++;
      const type = pick(incidentTypes);
      const gravite = ph >= 75 ? randInt(2, 3) : randInt(1, 2);
      const dateInc = dateAnnee(e.anneeYear, '12');
      const statut = isPast(dateInc)
        ? weightedPick([['RESOLU',5],['CLASSE',3],['EN_TRAITEMENT',1],['OUVERT',1]])
        : weightedPick([['OUVERT',6],['EN_TRAITEMENT',4]]);
      const signalePar = e.site === 'ambouli' ? 'user-supervisor-ambouli-1' : 'user-supervisor-arhiba-1';
      incidents.push([`inc-${incIdx}`,'tenant-ambouli',e.id,signalePar,type,statut,gravite,`${type} signalé en classe`,null,dateInc,null,TS,TS]);

      // Sanction (60% of incidents, plus pour les graves)
      if (rand() < (gravite >= 2 ? 0.75 : 0.50)) {
        sanIdx++;
        const sanType = pick(sanctionTypes);
        sanctions.push([`san-${sanIdx}`,`inc-${incIdx}`,sanType,`${sanType} suite à ${type}`,dateInc,rand() < 0.3 ? dateInc : null,rand() < 0.80,TS]);
      }
    }
  }
  console.log(`  [genFile08] Incidents: ${incIdx} total, sanctions: ${sanIdx}`);

  // Entretiens conseiller (5%)
  let entIdx = 0;
  for (const e of allEleves.filter(() => rand() < 0.05)) {
    entIdx++;
    const motif = pick(['Difficultés scolaires','Problèmes de comportement','Absences répétées','Orientation']);
    entretiens.push([`ent-${entIdx}`,'tenant-ambouli',e.id,e.site === 'ambouli' ? 'user-counselor-ambouli' : 'user-counselor-arhiba',dateAnnee(e.anneeYear, '14'),motif,`Compte-rendu: ${motif}. Élève vu en entretien individuel.`,`'{"action":"Suivi hebdomadaire"}'::jsonb`,'REALISE',TS,TS]);
  }

  // Dispenses (6, EPS)
  const dispEleves = allEleves.slice(0, 6);
  for (let i = 0; i < dispEleves.length; i++) {
    const e = dispEleves[i];
    const site = e.site === 'ambouli' ? 'AMB' : 'ARH';
    dispenses.push([`disp-${i+1}`,'tenant-ambouli',e.id,`mat-EPS`,null,'Certificat médical',TS,TS]);
  }

  // Documents (100)
  for (let i = 0; i < 100; i++) {
    const e = allEleves[i % allEleves.length];
    const type = pick(['ACTE_NAISSANCE','BULLETIN','CERTIFICAT','AUTRE']);
    documents.push([`doc-${i+1}`,'tenant-ambouli',e.id,`${type}_${i+1}.pdf`,type,`/documents/${type}_${i+1}.pdf`,randInt(50000, 500000),'application/pdf',TS]);
  }

  sql += batchInsert('fiches_sanitaires', ['id','tenantId','siteId','eleveId','allergies','traitements','contreIndicationsSport','contactsUrgence','protocoleUrgence','vaccinations','remarques','createdAt','updatedAt'], fichesSan) + '\n\n';
  sql += batchInsert('absences', ['id','tenantId','eleveId','date','heureDebut','heureFin','isRetard','motif','statut','justificatif','commentaire','saisieParId','parentNotifie','parentNotifieAt','createdAt','updatedAt'], absences) + '\n\n';
  sql += batchInsert('passages_infirmerie', ['id','tenantId','siteId','eleveId','date','motif','soin','suite','retourCours','dureeMin','infirmierId','notes','createdAt','updatedAt'], passages) + '\n\n';
  sql += batchInsert('incidents', ['id','tenantId','eleveId','rapporteParId','type','statut','gravite','description','lieu','date','notes','createdAt','updatedAt'], incidents) + '\n\n';
  sql += batchInsert('sanctions', ['id','incidentId','type','description','dateDebut','dateFin','parentNotifie','createdAt'], sanctions) + '\n\n';
  sql += batchInsert('entretiens_conseiller', ['id','tenantId','eleveId','conseillerId','date','motif','compteRendu','decisions','statut','createdAt','updatedAt'], entretiens) + '\n\n';
  sql += batchInsert('dispenses_matiere', ['id','tenantId','eleveId','matiereId','periodeId','motif','createdAt','updatedAt'], dispenses) + '\n\n';
  sql += batchInsert('documents', ['id','tenantId','eleveId','nom','type','url','taille','mimeType','createdAt'], documents) + '\n\n';

  return sql;
}

// ── Write files (split into chunks of max 2000 lines) ───────
const MAX_LINES = 1800;
const files = {
  '04-users-staff-enseignants.sql': genFile04(),
  '05-classes-eleves-parents.sql': genFile05(),
  '06-edt-evaluations-notes-bulletins.sql': genFile06(),
  '07-facturation-paiements-relances.sql': genFile07(),
  '08-vie-scolaire-sante.sql': genFile08(),
};

function splitAndWrite(filename, content) {
  const baseName = filename.replace(/\.sql$/, '');
  // Clean up old files (single file + any part files from previous runs)
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f === filename || f.startsWith(`${baseName}-part`)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
    }
  }
  const allLines = content.split('\n');
  const totalLines = allLines.length;
  if (totalLines <= MAX_LINES) {
    const filepath = path.join(OUT_DIR, filename);
    fs.writeFileSync(filepath, content);
    console.log(`✓ ${filename} (${totalLines} lines)`);
    return;
  }
  // Split at statement boundaries (lines ending with ;)
  let partNum = 0;
  let currentChunk = [];
  let chunkLines = 0;

  for (const line of allLines) {
    currentChunk.push(line);
    chunkLines++;
    if (chunkLines >= MAX_LINES && line.trim().endsWith(';')) {
      partNum++;
      const partName = `${baseName}-part${String(partNum).padStart(2, '0')}.sql`;
      fs.writeFileSync(path.join(OUT_DIR, partName), currentChunk.join('\n'));
      console.log(`✓ ${partName} (${chunkLines} lines)`);
      currentChunk = [];
      chunkLines = 0;
    }
  }
  if (chunkLines > 0) {
    partNum++;
    const partName = `${baseName}-part${String(partNum).padStart(2, '0')}.sql`;
    fs.writeFileSync(path.join(OUT_DIR, partName), currentChunk.join('\n'));
    console.log(`✓ ${partName} (${chunkLines} lines)`);
  }
}

for (const [filename, content] of Object.entries(files)) {
  splitAndWrite(filename, content);
}

// ── File 09: RH divers, communication, gouvernance, LMS, inventaire, admissions, budget, tâches ─
function genFile09() {
  let sql = `-- 09-rh-communication-gouvernance-divers.sql\n-- Cité Scolaire Ambouli — RH divers, Communication, Gouvernance, LMS, Inventaire, Admissions, Budget, Tâches\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "seances_mentorat" WHERE "mentoratId" IN (SELECT id FROM "mentorats" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "objectifs_mentorat" WHERE "mentoratId" IN (SELECT id FROM "mentorats" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "mentorats" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "resolutions" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "reunions" WHERE "conseilId" IN (SELECT id FROM "conseils" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "membres_conseil" WHERE "conseilId" IN (SELECT id FROM "conseils" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "conseils" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "taches" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "depenses" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "budgets" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "progressions_eleves" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "contenus_cours" WHERE "coursId" IN (SELECT id FROM "cours" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "cours" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "inventaire" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "candidatures" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "messages" WHERE "conversationId" IN (SELECT id FROM "conversations" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "conversation_participants" WHERE "conversationId" IN (SELECT id FROM "conversations" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "conversations" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "notifications" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "evenements" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "devoirs" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "remplacements_cours" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "conges_personnel" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "absences_personnel" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "disponibilites_enseignants" WHERE "tenantId"='tenant-ambouli';
DELETE FROM "demandes_lien_parent" WHERE "tenantId"='tenant-ambouli';
DELETE FROM "audit_logs" WHERE "tenantId"='tenant-ambouli';
DELETE FROM "regles_appreciation" WHERE "tenantId"='tenant-ambouli';
DELETE FROM "remises_caisse" WHERE "tenantId"='tenant-ambouli';

`;

  const absPers = [], conges = [], dispoEns = [], remplacements = [], devoirs = [];
  const notifs = [], conversations = [], convParts = [], messages = [];
  const evenements = [], cours = [], contenusCours = [], progressions = [];
  const inventaire = [], candidatures = [], budgets = [], depenses = [], taches = [];
  const demandesLien = [], auditLogs = [], reglesAppreciation = [], remisesCaisse = [];

  // Absences personnel (20% of teachers, 1-5 each)
  let apIdx = 0, cgIdx = 0, dpIdx = 0, rmIdx = 0, dvIdx = 0;
  for (const site of ['ambouli','arhiba']) {
    for (let i = 1; i <= NB_ENSEIGNANTS_PAR_SITE; i++) {
      const ensId = `ens-${site}-${i}`;
      // Disponibilités
      for (const jour of ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI']) {
        dpIdx++;
        dispoEns.push([`dispo-${site}-${i}-${jour}`,'tenant-ambouli',`site-${site}`,ensId,jour,'08:00','12:00']);
      }
      // Absences (20%)
      if (rand() < 0.20) {
        const nb = randInt(1, 5);
        for (let a = 0; a < nb; a++) {
          apIdx++;
          const type = pick(['ABSENCE','RETARD','MALADIE','FORMATION','MISSION']);
          const absDate = schoolDate('00');
          const statut = isPast(absDate)
            ? weightedPick([['JUSTIFIEE',6],['INJUSTIFIEE',3],['EN_ATTENTE',1]])
            : 'EN_ATTENTE';
          absPers.push([`ap-${apIdx}`,'tenant-ambouli',ensId,absDate,type==='RETARD'?'08:00':null,type==='RETARD'?'08:30':null,type,statut,null,null,null,'user-admin-amb',TS,TS]);
        }
      }
      // Congés (15%)
      if (rand() < 0.15) {
        cgIdx++;
        const type = pick(['ANNUEL','MALADIE','SPECIAL']);
        const cgDebut = schoolDate('00');
        // Ensure dateFin is after dateDebut: add nbJours to dateDebut
        const nbJours = randInt(3, 15);
        const debutParts = cgDebut.slice(0, 10).split('-');
        const finDate = new Date(parseInt(debutParts[0]), parseInt(debutParts[1]) - 1, parseInt(debutParts[2]) + nbJours);
        const cgFin = `${finDate.getFullYear()}-${String(finDate.getMonth()+1).padStart(2,'0')}-${String(finDate.getDate()).padStart(2,'0')} 00:00:00`;
        const statut = isPast(cgFin)
          ? weightedPick([['TERMINE',8],['APPROUVE',2]])
          : isPast(cgDebut)
            ? 'APPROUVE'
            : weightedPick([['DEMANDE',5],['APPROUVE',5]]);
        // APPROUVE must have approuveParId and approuveAt (after dateDebut)
        let approuveParId = null;
        let approuveAt = null;
        if (statut === 'APPROUVE' || statut === 'TERMINE') {
          approuveParId = pick(['user-admin-amb','user-principal-coll-amb','user-principal-lycee-amb','user-principal-coll-arh']);
          // approuveAt: a date after dateDebut
          const apprDate = new Date(parseInt(debutParts[0]), parseInt(debutParts[1]) - 1, parseInt(debutParts[2]) - randInt(1, 5));
          approuveAt = `${apprDate.getFullYear()}-${String(apprDate.getMonth()+1).padStart(2,'0')}-${String(apprDate.getDate()).padStart(2,'0')} 00:00:00`;
        }
        conges.push([`cg-${cgIdx}`,'tenant-ambouli',ensId,type,statut,cgDebut,cgFin,nbJours,null,null,null,approuveParId,approuveAt,null,TS,TS]);
      }
    }
  }

  // Remplacements (10)
  for (let i = 0; i < 10; i++) {
    rmIdx++;
    const site = i < 5 ? 'ambouli' : 'arhiba';
    const cls = `cls-${site}-2025-6eme-A`;
    const rmplDate = schoolDate('08');
    const statut = isPast(rmplDate)
      ? weightedPick([['EFFECTUE',8],['VALIDE',2]])
      : weightedPick([['PROPOSE',6],['VALIDE',4]]);
    remplacements.push([`rmpl-${i+1}`,'tenant-ambouli',`site-${site}`,null,cls,'mat-MATH',`ens-${site}-1`,`ens-${site}-${randInt(2,20)}`,rmplDate,'08:00','09:00',`Salle ${randInt(101,203)}`,statut,'Maladie',null,'user-principal-coll-amb',TS,TS]);
  }

  // Devoirs (50)
  for (let i = 0; i < 50; i++) {
    dvIdx++;
    const site = i < 25 ? 'ambouli' : 'arhiba';
    const cls = `cls-${site}-2025-6eme-A`;
    const matCode = pick(['MATH','FR','ANG','HG','PC','SVT']);
    const { dateDonne, dateRendu } = devoirDates();
    // Ensure dateDonne < dateRendu (devoirDates already guarantees this)
    // Determine statut based on whether dates are past or future relative to DEMO_NOW
    const renduPast = isPast(dateRendu);
    const donnePast = isPast(dateDonne);
    let statut;
    if (!renduPast) {
      // dateRendu is in the future: statut must be A_FAIRE or EN_COURS
      statut = donnePast ? weightedPick([['EN_COURS',6],['A_FAIRE',4]]) : 'A_FAIRE';
    } else {
      // dateRendu is in the past: statut can be RENDU or CORRIGE (or EN_COURS)
      statut = weightedPick([['CORRIGE',7],['RENDU',2],['EN_COURS',1]]);
    }
    devoirs.push([`dv-${i+1}`,'tenant-ambouli',`site-${site}`,cls,`mat-${matCode}`,`ens-${site}-${randInt(1,NB_ENSEIGNANTS_PAR_SITE)}`,`Devoir ${matCode} ${i+1}`,`Exercices sur le chapitre ${i%5+1}`,dateDonne,dateRendu,statut,TS,TS]);
  }

  // Notifications (20)
  for (let i = 0; i < 20; i++) {
    const site = i < 10 ? 'site-ambouli' : 'site-arhiba';
    const planDate = schoolDate('12');
    const statut = isPast(planDate)
      ? weightedPick([['ENVOYEE',8],['ECHEC',1],['BROUILLON',1]])
      : weightedPick([['PLANIFIEE',6],['BROUILLON',4]]);
    const nbDestinataires = randInt(50, 500);
    // Status-based counters and dates
    let nbDelivres = 0, nbLus = 0, planifieeAt = null, envoyeeAt = null;
    if (statut === 'BROUILLON') {
      nbDelivres = 0; nbLus = 0; planifieeAt = null; envoyeeAt = null;
    } else if (statut === 'PLANIFIEE') {
      planifieeAt = '2026-09-15 12:00:00'; envoyeeAt = null;
      nbDelivres = 0; nbLus = 0;
    } else if (statut === 'ENVOYEE') {
      envoyeeAt = '2025-11-15 12:00:00'; planifieeAt = null;
      nbDelivres = randInt(0, nbDestinataires);
      nbLus = randInt(0, nbDelivres);
    } else if (statut === 'ECHEC') {
      envoyeeAt = '2025-11-15 12:00:00'; planifieeAt = null;
      nbDelivres = 0; nbLus = 0;
    }
    // Ensure nbLus <= nbDelivres <= nbDestinataires
    nbLus = Math.min(nbLus, nbDelivres);
    nbDelivres = Math.min(nbDelivres, nbDestinataires);
    notifs.push([`notif-${i+1}`,'tenant-ambouli',site,`Notification ${i+1}`,`Contenu de la notification ${i+1}`,pick(['IN_APP','EMAIL','SMS','PUSH']),statut,pick(['TOUS','PARENTS','ENSEIGNANTS','ELEVES']),null,null,'user-admin-amb',nbDestinataires,nbDelivres,nbLus,planifieeAt,envoyeeAt,TS,TS]);
  }

  // Conversations + messages (10 conversations, 30 messages)
  for (let i = 0; i < 10; i++) {
    const site = i < 5 ? 'site-ambouli' : 'site-arhiba';
    const convId = `conv-${i+1}`;
    const type = pick(['DIRECT','CLASS_ANNOUNCEMENT','CLASS_DISCUSSION','ADMIN_BROADCAST','PARENT_TEACHER','STAFF_GROUP']);
    // Set isGroup and classeId consistently per type
    let isGroup = false;
    let classeId = null;
    if (type === 'DIRECT') {
      isGroup = false; classeId = null;
    } else if (type === 'PARENT_TEACHER') {
      isGroup = false; classeId = `cls-ambouli-2025-6eme-A`; // class-specific
    } else if (type === 'CLASS_ANNOUNCEMENT') {
      isGroup = true; classeId = `cls-ambouli-2025-6eme-A`; // required
    } else if (type === 'CLASS_DISCUSSION') {
      isGroup = true; classeId = `cls-ambouli-2025-6eme-A`; // required
    } else if (type === 'STAFF_GROUP') {
      isGroup = true; classeId = null;
    } else if (type === 'ADMIN_BROADCAST') {
      isGroup = true; classeId = null;
    }
    conversations.push([convId,'tenant-ambouli',`Conversation ${i+1}`,isGroup,type,classeId,site,'user-admin-amb',i%2===0,false,TS,TS]);
    convParts.push([convId,'user-admin-amb','ADMIN',TS,null]);
    if (i < 4) convParts.push([convId,`user-prof-ambouli-1`,'MEMBER',TS,null]);
    // 3 messages per conversation
    for (let m = 0; m < 3; m++) {
      messages.push([`msg-${i+1}-${m+1}`,convId,'user-admin-amb',`Message ${m+1} de la conversation ${i+1}`,'{}',null,null,null,`2025-0${randInt(1,6)}-15 12:00:00`,null,null]);
    }
  }

  // Événements (15)
  for (let i = 0; i < 15; i++) {
    const site = i < 8 ? 'site-ambouli' : 'site-arhiba';
    const type = pick(['reunion','sortie','conseil_classe','vacances']);
    // Ensure dateFin >= dateDebut: pick start month first, then end month >= start month
    const startMonth = randInt(1, 6);
    const endMonth = randInt(startMonth, 6);
    const day = randInt(1, 28);
    evenements.push([`evt-${i+1}`,'tenant-ambouli',site,`Événement ${i+1}`,`Description ${type} ${i+1}`,type,`2025-0${startMonth}-${day} 09:00:00`,`2025-0${endMonth}-${day} 17:00:00`,'Salle principale','#3b82f6','all',null,TS]);
  }

  // Cours LMS (20 cours, 2 contenus chacun)
  for (let i = 0; i < 20; i++) {
    const site = i < 10 ? 'site-ambouli' : 'site-arhiba';
    const matCode = pick(['MATH','FR','ANG','HG','PC','SVT']);
    const coursId = `cours-${i+1}`;
    cours.push([coursId,'tenant-ambouli',site,`Cours ${matCode} ${i+1}`,`Description du cours ${matCode} ${i+1}`,pick(['DEBUTANT','INTERMEDIAIRE','AVANCE']),'PUBLIE',matCode,'6ème A',`Prof ${i+1}`,null,60,randInt(10,200),randInt(5,50),TS,TS]);
    for (let c = 0; c < 2; c++) {
      contenusCours.push([`cc-${i+1}-${c+1}`,coursId,`Contenu ${c+1}`,pick(['TEXTE','VIDEO','DOCUMENT']),c,`https://example.com/content-${i+1}-${c+1}`,`Texte du contenu ${c+1}`,30,true,TS]);
    }
  }

  // Progressions élèves (50)
  for (let i = 0; i < 50; i++) {
    const site = i < 25 ? 'ambouli' : 'arhiba';
    const eleveId = pick(INSCRITS_2025_PAR_SITE[site]).eleveId;
    progressions.push([`prog-${i+1}`,'tenant-ambouli',`cours-${(i%20)+1}`,`Eleve ${i+1}`,eleveId,`{}`,randInt(0,100),rand() < 0.3 ? randInt(10,20) : null,rand() < 0.3,rand() < 0.3 ? `2025-0${randInt(1,6)}-15 00:00:00` : null,TS,TS]);
  }

  // Inventaire (40 items)
  for (let i = 0; i < 40; i++) {
    const site = i < 20 ? 'site-ambouli' : 'site-arhiba';
    // ~20% of items: quantite <= quantiteMin to generate realistic alerts
    let quantite, quantiteMin, etat;
    if (rand() < 0.20) {
      // Alert item: quantite at or below quantiteMin
      quantiteMin = randInt(3, 8);
      quantite = randInt(0, quantiteMin); // quantite <= quantiteMin
    } else {
      quantiteMin = randInt(0, 5);
      quantite = randInt(quantiteMin + 1, 50); // quantite > quantiteMin
    }
    // Some items with etat=ENDOMMAGE or HORS_SERVICE
    if (rand() < 0.10) {
      etat = pick(['ENDOMMAGE','HORS_SERVICE']);
    } else {
      etat = pick(['NEUF','BON','USE']);
    }
    inventaire.push([`inv-${i+1}`,'tenant-ambouli',site,pick(['Ordinateur','Table','Chaise','Vidéoprojecteur','Manuel','Ballon','Micro','Extincteur']),`Description item ${i+1}`,`REF-${i+1}`,pick(['INFORMATIQUE','MOBILIER','SPORTIF','PEDAGOGIQUE','AUDIOVISUEL','ENTRETIEN','SECURITE']),etat,quantite,quantiteMin,`Localisation ${i+1}`,`Fournisseur ${i%3+1}`,randInt(5000,500000),'DJF',`2024-09-01 00:00:00`,`2026-09-01 00:00:00`,`2025-09-01 00:00:00`,null,null,TS,TS]);
  }

  // Candidatures (15) — annee 2025-2026 déjà entamée, la plupart sont ADMIS/INSCRIT
  for (let i = 0; i < 15; i++) {
    const site = i < 8 ? 'site-ambouli' : 'site-arhiba';
    const statut = weightedPick([['INSCRIT',5],['ADMIS',4],['EN_EXAMEN',1],['SOUMISE',0.5]]);
    const birthYear = 2008 + randInt(0, 5);
    const birthMonth = randInt(1, 12);
    const birthDay = randInt(1, 28);
    candidatures.push([`cand-${i+1}`,'tenant-ambouli',site,pick(NOMS),pick(PRENOMS_M),`${birthYear}-${String(birthMonth).padStart(2,'0')}-${String(birthDay).padStart(2,'0')} 00:00:00`,'Djibouti','M','DJ',null,pick(['6ème','5ème','4ème','3ème','2nde']),'2025-2026',pick(NOMS),pick(PRENOMS_M),`cand-parent-${i+1}@cite-ambouli.dj`,`+253 77 ${randInt(10,99)} ${randInt(10,99)} ${randInt(10,99)}`,'PERE',statut,null,null,null,null,`'{}'::jsonb`,TS,TS]);
  }

  // Budgets (8 per site per year)
  const cats = ['FONCTIONNEMENT','PEDAGOGIE','MAINTENANCE','SALAIRES','TRANSPORT','CANTINE','EVENEMENTIEL','INVESTISSEMENT'];
  let bgIdx = 0, dpIdx2 = 0;
  for (const site of ['site-ambouli','site-arhiba']) {
    for (const annee of ['2024-2025','2025-2026']) {
      for (const cat of cats) {
        bgIdx++;
        const prevu = randInt(500000, 5000000);
        const budgetId = `bud-${bgIdx}`;
        // Generate depenses first, then calculate montantDepense as sum
        const nbDep = randInt(2, 3);
        let montantDepense = 0;
        const budgetDepenses = [];
        for (let d = 0; d < nbDep; d++) {
          dpIdx2++;
          const depMontant = Math.round(prevu / nbDep);
          montantDepense += depMontant;
          budgetDepenses.push([`dep-${dpIdx2}`,'tenant-ambouli',site,budgetId,`2025-0${randInt(1,6)}-15 00:00:00`,depMontant,'DJF',cat,`Dépense ${cat} ${d+1}`,`Description dépense`,pick(['especes','cheque','virement']),`REF-DEP-${dpIdx2}`,null,'user-accountant-ambouli',TS,TS]);
        }
        depenses.push(...budgetDepenses);
        // Set statut=DEPASSE if montantDepense > montantPrevu, otherwise VALIDE
        const budgetStatut = montantDepense > prevu ? 'DEPASSE' : 'VALIDE';
        budgets.push([budgetId,'tenant-ambouli',site,annee,cat,prevu,montantDepense,'DJF',budgetStatut,`Budget ${cat} ${annee}`,TS,TS]);
      }
    }
  }

  // Tâches (30)
  for (let i = 0; i < 30; i++) {
    const site = i < 15 ? 'site-ambouli' : 'site-arhiba';
    const assignee = i < 15 ? `user-prof-ambouli-${(i%20)+1}` : `user-prof-arhiba-${(i%20)+1}`;
    const echeance = schoolDate('00');
    const past = isPast(echeance);
    const statut = past
      ? weightedPick([['FAIT',8],['EN_COURS',1],['A_FAIRE',1]])
      : weightedPick([['A_FAIRE',6],['EN_COURS',3],['FAIT',1]]);
    const dateFaite = statut === 'FAIT' ? echeance : null;
    taches.push([`tache-${i+1}`,'tenant-ambouli',site,assignee,'user-admin-amb',`Tâche ${i+1}`,`Description tâche ${i+1}`,pick(['saisie_notes','conseil_classe','rendez_vous_parent','preparation_cours','correction_devoirs','remise_bulletins','reunion_pedagogique','autre']),pick(['BASSE','NORMALE','HAUTE','URGENTE']),statut,null,null,echeance,dateFaite,TS,TS]);
  }

  sql += batchInsert('absences_personnel', ['id','tenantId','enseignantId','date','heureDebut','heureFin','type','statut','motif','justificatif','commentaire','saisieParId','createdAt','updatedAt'], absPers) + '\n\n';
  sql += batchInsert('conges_personnel', ['id','tenantId','enseignantId','type','statut','dateDebut','dateFin','nbJours','motif','justificatif','demandeParId','approuveParId','approuveAt','commentaire','createdAt','updatedAt'], conges) + '\n\n';
  sql += batchInsert('disponibilites_enseignants', ['id','tenantId','siteId','enseignantId','jour','heureDebut','heureFin'], dispoEns) + '\n\n';
  sql += batchInsert('remplacements_cours', ['id','tenantId','siteId','emploiTempsId','classeId','matiereId','enseignantAbsentId','enseignantRemplacantId','date','heureDebut','heureFin','salle','statut','motifAbsence','notes','decideParId','createdAt','updatedAt'], remplacements) + '\n\n';
  sql += batchInsert('devoirs', ['id','tenantId','siteId','classeId','matiereId','enseignantId','titre','description','dateDonne','dateRendu','statut','createdAt','updatedAt'], devoirs) + '\n\n';
  sql += batchInsert('notifications', ['id','tenantId','siteId','titre','contenu','canal','statut','cible','classeId','niveau','envoyeParId','nbDestinataires','nbDelivres','nbLus','planifieeAt','envoyeeAt','createdAt','updatedAt'], notifs) + '\n\n';
  sql += batchInsert('conversations', ['id','tenantId','subject','isGroup','type','classeId','siteId','createdBy','readOnly','pinned','createdAt','updatedAt'], conversations) + '\n\n';
  // ConversationParticipant composite PK
  if (convParts.length > 0) {
    sql += `INSERT INTO "conversation_participants" ("conversationId","userId","role","joinedAt","lastReadAt") VALUES\n` +
      convParts.map(r => `  (${r.map(val).join(', ')})`).join(',\n') + `\nON CONFLICT ("conversationId","userId") DO NOTHING;\n\n`;
  }
  sql += batchInsert('messages', ['id','conversationId','senderId','content','readBy','replyToId','attachmentUrl','attachmentType','createdAt','editedAt','deletedAt'], messages) + '\n\n';
  sql += batchInsert('evenements', ['id','tenantId','siteId','titre','description','type','dateDebut','dateFin','lieu','couleur','cible','responsableId','createdAt'], evenements) + '\n\n';
  sql += batchInsert('cours', ['id','tenantId','siteId','titre','description','niveau','statut','matiereNom','classeNom','auteurNom','imageUrl','dureeMin','nbVues','nbInscrits','createdAt','updatedAt'], cours) + '\n\n';
  sql += batchInsert('contenus_cours', ['id','coursId','titre','type','ordre','url','texte','dureeMin','isGratuit','createdAt'], contenusCours) + '\n\n';
  sql += batchInsert('progressions_eleves', ['id','tenantId','coursId','eleveNom','eleveId','contenusVus','pctCompletion','noteFinale','isTermine','termineeAt','createdAt','updatedAt'], progressions) + '\n\n';
  sql += batchInsert('inventaire', ['id','tenantId','siteId','nom','description','reference','categorie','etat','quantite','quantiteMin','localisation','fournisseur','prixUnitaire','devise','dateAchat','dateGarantie','dateRevision','photoUrl','notes','createdAt','updatedAt'], inventaire) + '\n\n';
  sql += batchInsert('candidatures', ['id','tenantId','siteId','nom','prenom','dateNaissance','lieuNaissance','sexe','nationalite','photoUrl','classeVoulue','annee','parentNom','parentPrenom','parentEmail','parentPhone','parentLien','statut','dateExamen','noteExamen','commentaire','motifRefus','documents','createdAt','updatedAt'], candidatures) + '\n\n';
  sql += batchInsert('budgets', ['id','tenantId','siteId','annee','categorie','montantPrevu','montantDepense','devise','statut','description','createdAt','updatedAt'], budgets) + '\n\n';
  sql += batchInsert('depenses', ['id','tenantId','siteId','budgetId','date','montant','devise','categorie','libelle','description','methodePaiement','reference','justificatifUrl','enregistreParId','createdAt','updatedAt'], depenses) + '\n\n';
  sql += batchInsert('taches', ['id','tenantId','siteId','assigneeAId','creeParId','titre','description','type','priorite','statut','classeId','matiereId','echeance','dateFaite','createdAt','updatedAt'], taches) + '\n\n';

  // Gouvernance — Conseils, Membres, Réunions, Résolutions
  const conseils = [], membresConseil = [], reunions = [], resolutions = [];
  const conseilsData = [
    { nom: 'Conseil d\'administration', type: 'ADMINISTRATION', freq: 'TRIMESTRIEL' },
    { nom: 'Conseil de discipline', type: 'DISCIPLINE', freq: 'MENSUEL' },
    { nom: 'Conseil pédagogique', type: 'PEDAGOGIQUE', freq: 'TRIMESTRIEL' },
  ];
  const adminUsers = ['user-admin-amb','user-principal-coll-amb','user-principal-lycee-amb','user-principal-coll-arh','user-principal-lycee-arh'];
  conseilsData.forEach((c, i) => {
    const cId = `conseil-${i+1}`;
    conseils.push([cId,'tenant-ambouli',c.nom,c.type,`Description ${c.nom}`,c.freq,TS,TS]);
    for (let m = 0; m < 5; m++) {
      const role = m === 0 ? 'PRESIDENT' : m === 1 ? 'SECRETAIRE' : pick(['MEMBRE','OBSERVATEUR']);
      membresConseil.push([`mbr-${cId}-${m+1}`,cId,adminUsers[m % adminUsers.length],role,null,`2024-09-01 00:00:00`,null,TS]);
    }
    const nbReunions = randInt(2, 3);
    for (let r = 0; r < nbReunions; r++) {
      const rId = `reu-${cId}-${r+1}`;
      const isPastR = r < nbReunions - 1;
      const rDate = isPastR ? `2025-${String(randInt(10,12)).padStart(2,'0')}-01 00:00:00` : `2026-${String(randInt(1,3)).padStart(2,'0')}-01 00:00:00`;
      const rStatut = isPastR ? 'TERMINEE' : 'PLANIFIEE';
      reunions.push([rId,cId,`${c.nom} — Réunion ${r+1}`,rDate,`Salle de réunion ${i+1}`,`Ordre du jour point 1, point 2`,rStatut,isPastR ? `Compte-rendu de la réunion ${r+1}` : null,isPastR ? `'[]'::jsonb` : null,TS,TS]);
      if (isPastR) {
        const nbRes = randInt(1, 2);
        for (let res = 0; res < nbRes; res++) {
          const resStatut = pick(['ADOPTÉE','ADOPTÉE','REJETÉE']);
          resolutions.push([`res-${rId}-${res+1}`,'tenant-ambouli',cId,`Résolution ${res+1} — ${c.nom}`,`Description de la résolution`,resStatut,`2025-${String(randInt(10,12)).padStart(2,'0')}-15 00:00:00`,`'{"pour":5,"contre":1,"abstentions":0}'::jsonb`,`2025-${String(randInt(10,12)).padStart(2,'0')}-20 00:00:00`,null,TS,TS]);
        }
      }
    }
  });
  sql += batchInsert('conseils', ['id','tenantId','nom','type','description','frequence','createdAt','updatedAt'], conseils) + '\n\n';
  sql += batchInsert('membres_conseil', ['id','conseilId','userId','role','nomExterne','debutMandat','finMandat','createdAt'], membresConseil) + '\n\n';
  sql += batchInsert('reunions', ['id','conseilId','titre','date','lieu','ordreDuJour','statut','compteRendu','presences','createdAt','updatedAt'], reunions) + '\n\n';
  sql += batchInsert('resolutions', ['id','tenantId','conseilId','titre','description','statut','dateVote','resultats','dateEffet','dateFin','createdAt','updatedAt'], resolutions) + '\n\n';

  // Mentorat — Relations, Objectifs, Séances
  const mentorats = [], objectifsMent = [], seancesMent = [];
  const profsForMentor = [];
  for (let i = 1; i <= 10; i++) profsForMentor.push(`user-prof-ambouli-${i}`);
  for (let i = 0; i < 8; i++) {
    const mId = `mentorat-${i+1}`;
    const mentor = profsForMentor[i % profsForMentor.length];
    const mentore = i < 5 ? `user-prof-ambouli-${(i % 5) + 11}` : `user-prof-ambouli-${(i % 5) + 16}`;
    const type = pick(['ACADEMIQUE','PROFESSIONNEL','PERSONNEL']);
    const isPastM = i < 5;
    const statut = isPastM ? 'TERMINE' : 'ACTIF';
    const dateDebut = `2024-${String(randInt(9,12)).padStart(2,'0')}-01 00:00:00`;
    const dateFin = isPastM ? `2025-06-30 00:00:00` : null;
    mentorats.push([mId,'tenant-ambouli',mentor,mentore,type,statut,dateDebut,dateFin,pick(['HEBDOMADAIRE','BIHEBDOMADAIRE','MENSUEL']),`Notes mentorat ${i+1}`,TS,TS]);
    const nbObj = randInt(2, 3);
    for (let o = 0; o < nbObj; o++) {
      const objStatut = isPastM ? pick(['ATTEINT','ATTEINT','NON_ATTEINT']) : pick(['EN_COURS','EN_COURS','ABANDONNE']);
      const progression = objStatut === 'ATTEINT' ? 100 : objStatut === 'NON_ATTEINT' ? randInt(20, 60) : randInt(10, 80);
      objectifsMent.push([`obj-${mId}-${o+1}`,mId,`Objectif ${o+1}`,`Description objectif ${o+1}`,objStatut,randInt(1,5),`2025-${String(randInt(3,6)).padStart(2,'0')}-01 00:00:00`,progression,TS,TS]);
    }
    const nbSeances = randInt(3, 5);
    for (let s = 0; s < nbSeances; s++) {
      const isPastS = isPastM || s < nbSeances - 1;
      const sStatut = isPastS ? 'EFFECTUEE' : 'PLANIFIEE';
      const sDate = isPastS ? `2025-${String(randInt(1,6)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00` : `2026-${String(randInt(1,3)).padStart(2,'0')}-01 00:00:00`;
      seancesMent.push([`seance-${mId}-${s+1}`,mId,sDate,randInt(30,90),sStatut,isPastS ? `Compte-rendu séance ${s+1}` : null,pick(['Bureau','Salle de réunion','Visio']),TS,TS]);
    }
  }
  sql += batchInsert('mentorats', ['id','tenantId','mentorId','mentoreId','type','statut','dateDebut','dateFin','frequence','notes','createdAt','updatedAt'], mentorats) + '\n\n';
  sql += batchInsert('objectifs_mentorat', ['id','mentoratId','titre','description','statut','priorite','dateCible','progression','createdAt','updatedAt'], objectifsMent) + '\n\n';
  sql += batchInsert('seances_mentorat', ['id','mentoratId','date','duree','statut','compteRendu','lieu','createdAt','updatedAt'], seancesMent) + '\n\n';


  // ── Demandes de lien parent (20: 60% EN_ATTENTE, 25% VALIDE, 15% REFUSE) ──
  let dlIdx = 0;
  for (let i = 0; i < 20; i++) {
    dlIdx++;
    // Parent et élève sont volontairement tirés séparément : une demande de
    // rattachement porte justement sur un lien qui n'est pas encore établi.
    const eleveId = pick(PERSONNES_PAR_SITE.ambouli).eleveId;
    const parentId = pick(PERSONNES_PAR_SITE.ambouli).parentId;
    const statut = i < 12 ? 'EN_ATTENTE' : (i < 17 ? 'VALIDE' : 'REFUSE');
    const traitePar = statut === 'EN_ATTENTE' ? null : 'user-admin-amb';
    const traiteLe = statut === 'EN_ATTENTE' ? null : '2025-10-15 00:00:00';
    const motifRefus = statut === 'REFUSE' ? 'Lien de parenté non vérifié' : null;
    demandesLien.push([`dl-${dlIdx}`,'tenant-ambouli',parentId,eleveId,`MAT${randInt(1000,9999)}`,'2013-05-15 00:00:00',statut,traitePar,traiteLe,motifRefus,TS,TS]);
  }

  // ── Audit logs (30 entrées) ──
  let alIdx = 0;
  const auditActions = ['LOGIN','CREATE_ELEVE','UPDATE_NOTE','DELETE_NOTE','CREATE_BULLETIN','ACCESS_DOSSIER','EXPORT_DATA','CREATE_USER','DELETE_USER','CHANGE_PERMISSION'];
  for (let i = 0; i < 30; i++) {
    alIdx++;
    const action = pick(auditActions);
    const verdict = rand() < 0.85 ? 'ALLOWED' : 'DENIED';
    const userId = `user-prof-ambouli-${randInt(1,NB_ENSEIGNANTS_PAR_SITE)}`;
    auditLogs.push([`audit-${alIdx}`,'tenant-ambouli',userId,action,verdict,'eleve',PERSONNES_PAR_SITE.ambouli[0].eleveId,rand() < 0.3 ? 'Accès hors horaires' : null,null,'192.168.1.' + randInt(1,254),'Mozilla/5.0','2025-10-15 10:30:00']);
  }

  // ── Règles d'appréciation (4 contextes × 5 seuils = 20 règles) ──
  let raIdx = 0;
  const appreciations = [
    { contexte: 'NOTE_MATIERE', seuils: [[0,8,'Insuffisant'],[8,10,'Passable'],[10,12,'Assez bien'],[12,14,'Bien'],[14,21,'Très bien']] },
    { contexte: 'BULLETIN_PERIODE', seuils: [[0,8,'Insuffisant'],[8,10,'Passable'],[10,12,'Assez bien'],[12,14,'Bien'],[14,21,'Très bien']] },
    { contexte: 'BULLETIN_ANNUEL', seuils: [[0,8,'Insuffisant'],[8,10,'Passable'],[10,12,'Assez bien'],[12,14,'Bien'],[14,21,'Très bien']] },
    { contexte: 'ABSENCE', seuils: [[0,3,'Assidu'],[3,8,'A surveiller'],[8,15,'Inquiet'],[15,30,'Preoccupant'],[30,999,'Critique']] },
  ];
  for (const app of appreciations) {
    for (let i = 0; i < app.seuils.length; i++) {
      raIdx++;
      const [min, max, libelle] = app.seuils[i];
      reglesAppreciation.push([`ra-${raIdx}`,'tenant-ambouli',app.contexte,min,max,libelle,i+1,TS,TS]);
    }
  }

  // ── Remises de caisse (15: 60% CONFIRME, 25% EN_ATTENTE, 15% REJETE) ──
  let rcIdx = 0;
  for (let i = 0; i < 15; i++) {
    rcIdx++;
    const site = i < 10 ? 'site-ambouli' : 'site-arhiba';
    const caissierId = i < 5 ? 'user-caissier-ambouli-1' : (i < 10 ? 'user-caissier-ambouli-2' : (i < 12 ? 'user-caissier-arhiba-1' : 'user-caissier-arhiba-2'));
    const montant = randInt(50000, 500000);
    const statut = i < 9 ? 'CONFIRME' : (i < 12 ? 'EN_ATTENTE' : 'REJETE');
    const receveurId = statut === 'CONFIRME' ? 'user-admin-amb' : (statut === 'REJETE' ? 'user-admin-amb' : null);
    const montantRecu = statut === 'CONFIRME' ? montant : null;
    const dateReception = statut === 'CONFIRME' ? '2025-10-15 16:00:00' : null;
    const dateSaisieReception = statut === 'CONFIRME' ? '2025-10-15 16:00:00' : null;
    const commentaireReceveur = statut === 'REJETE' ? 'Montant incorrect, ecart de 5000 DJF' : null;
    const dateRemise = `2025-10-${String(randInt(1,15)).padStart(2,'0')} 15:00:00`;
    remisesCaisse.push([`rc-${rcIdx}`,'tenant-ambouli',site,caissierId,montant,dateRemise,'2025-10-15 15:00:00',receveurId,montantRecu,dateReception,dateSaisieReception,commentaireReceveur,statut,'2025-10-01 00:00:00','2025-10-15 00:00:00','DJF',TS,TS]);
  }

  sql += batchInsert('demandes_lien_parent', ['id','tenantId','parentId','eleveId','matriculeSaisi','dateNaissanceSaisie','statut','traitePar','traiteLe','motifRefus','createdAt','updatedAt'], demandesLien) + '\n\n';
  sql += batchInsert('audit_logs', ['id','tenantId','userId','action','verdict','resource','resourceId','reason','metadata','ip','userAgent','createdAt'], auditLogs) + '\n\n';
  sql += batchInsert('regles_appreciation', ['id','tenantId','contexte','seuilMin','seuilMax','libelle','ordre','createdAt','updatedAt'], reglesAppreciation) + '\n\n';
  sql += batchInsert('remises_caisse', ['id','tenantId','siteId','caissierId','montantDeclare','dateRemise','dateSaisieRemise','receveurId','montantRecu','dateReception','dateSaisieReception','commentaireReceveur','statut','periodeDebut','periodeFin','devise','createdAt','updatedAt'], remisesCaisse) + '\n\n';

  return sql;
}

// ── File 10: LEARNOS curriculum ──────────────────────────────
function genFile10() {
  let sql = `-- 10-learnos-curriculum.sql\n-- Cité Scolaire Ambouli — LEARNOS Curriculum (Chapitres, Compétences, Planifications, Seuils)\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "learnos_planification_competences" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_planification_chapitres" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_seuils_recommandation" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "_CompetencePrerequis";
DELETE FROM "learnos_competences" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_chapitres" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const chapitres = [], competences = [], planifsChap = [], planifsComp = [], seuils = [];
  const matieresCodes = ['MATH','FR','ANG','AR','HG','PC','SVT','EPS','PHILO','SES'];
  const niveaux = ['6eme','5eme','4eme','3eme','2nde','1ere','Terminale'];

  let chIdx = 0, cpIdx = 0, pcIdx = 0, pcoIdx = 0;
  for (const matCode of matieresCodes) {
    const matId = `mat-${matCode}`;
    for (const niveau of niveaux) {
      // 2 chapitres per matiere per niveau
      for (let c = 0; c < 2; c++) {
        chIdx++;
        const chId = `chap-${matCode}-${niveau}-${c+1}`;
        chapitres.push([chId,'tenant-ambouli',`site-ambouli`,matId,`Chapitre ${c+1}: ${matCode} ${niveau}`,niveau,c+1,TS,TS]);

        // 3 compétences per chapitre
        for (let k = 0; k < 3; k++) {
          cpIdx++;
          const cpId = `comp-${matCode}-${niveau}-${c+1}-${k+1}`;
          competences.push([cpId,'tenant-ambouli',`site-ambouli`,chId,`${matCode}-${niveau}-${c+1}-${k+1}`,`Compétence ${k+1}: ${matCode} ${niveau} ch${c+1}`,`Description compétence ${k+1}`,k+1,TS,TS]);
        }

        // Planification chapitre (2025-2026) — distribution: 60% TRAITE, 20% EN_COURS, 20% PREVU
        // ~20% retardés (semaineDebut > semaineDebutInitiale)
        pcIdx++;
        const planRoll = (pcIdx * 7) % 10;
        let planStatut, planTraiteLe, planSemaineDebut, planSemaineDebutInit;
        const semInit = c * 5 + 1;
        if (planRoll < 6) {
          // TRAITE
          planStatut = 'TRAITE'; planTraiteLe = '2025-01-15 00:00:00';
          planSemaineDebut = semInit; planSemaineDebutInit = semInit;
        } else if (planRoll < 8) {
          // EN_COURS
          planStatut = 'EN_COURS'; planTraiteLe = null;
          planSemaineDebut = semInit; planSemaineDebutInit = semInit;
        } else {
          // PREVU — 20% retardés
          planStatut = 'PREVU'; planTraiteLe = null;
          const isDelayed = (pcIdx % 5) === 0; // ~20%
          planSemaineDebut = isDelayed ? semInit + 2 : semInit;
          planSemaineDebutInit = semInit;
        }
        planifsChap.push([`plch-${chId}`,'tenant-ambouli',null,'annee-2025-amb',chId,null,planSemaineDebut,c*5+5,10,planStatut,planTraiteLe,TS,TS,`2024-09-15 00:00:00`,planSemaineDebutInit,c*5+5]);
      }
    }
  }

  // Planifications compétences (subset, 50)
  const allCompIds = competences.map(c => c[0]);
  for (let i = 0; i < 50 && i < allCompIds.length; i++) {
    pcoIdx++;
    const cpId = allCompIds[i];
    planifsComp.push([`plco-${i+1}`,'tenant-ambouli',null,'annee-2025-amb',cpId,null,1,3,'PREVU',TS,TS]);
  }

  // Seuils (one per niveau)
  for (const niveau of niveaux) {
    seuils.push([`seuil-${niveau}`,'tenant-ambouli',null,niveau,null,0.35,0.55,0.8,0.92,0.5,2,TS,TS,3,2]);
  }

  // ── Prérequis : chaînes logiques dans et entre chapitres ──
  // Convention Prisma: A = compétence qui requiert (dépendante), B = prérequis
  // Donc [A, B] = [dépendante, prérequis]
  const prerequisPairs = [];
  for (const matCode of matieresCodes) {
    for (let ni = 0; ni < niveaux.length; ni++) {
      const niveau = niveaux[ni];
      // 1. Dans le chapitre 1: 1-2 requiert 1-1, 1-3 requiert 1-2
      prerequisPairs.push([`comp-${matCode}-${niveau}-1-2`, `comp-${matCode}-${niveau}-1-1`]);
      prerequisPairs.push([`comp-${matCode}-${niveau}-1-3`, `comp-${matCode}-${niveau}-1-2`]);
      // 2. Dans le chapitre 2: 2-2 requiert 2-1, 2-3 requiert 2-2
      prerequisPairs.push([`comp-${matCode}-${niveau}-2-2`, `comp-${matCode}-${niveau}-2-1`]);
      prerequisPairs.push([`comp-${matCode}-${niveau}-2-3`, `comp-${matCode}-${niveau}-2-2`]);
      // 3. Entre chapitres: 2-1 requiert 1-3 (dernière du chapitre précédent)
      prerequisPairs.push([`comp-${matCode}-${niveau}-2-1`, `comp-${matCode}-${niveau}-1-3`]);
      // 4. Entre niveaux: première comp du niveau requiert dernière comp du niveau précédent
      if (ni > 0) {
        const prevNiveau = niveaux[ni - 1];
        prerequisPairs.push([`comp-${matCode}-${niveau}-1-1`, `comp-${matCode}-${prevNiveau}-2-3`]);
      }
    }
  }

  // 5. Inter-matières: Maths→Physique, Français→Philo, Maths→SES, Français→HG
  const interMatiere = [
    ['PC', 'MATH'], ['PHILO', 'FR'], ['SES', 'MATH'], ['HG', 'FR'],
  ];
  for (const [dependent, prerequisite] of interMatiere) {
    if (!matieresCodes.includes(dependent) || !matieresCodes.includes(prerequisite)) continue;
    for (const niveau of niveaux) {
      // La première compétence de PC dépend de la dernière de MATH au même niveau
      prerequisPairs.push([`comp-${dependent}-${niveau}-1-1`, `comp-${prerequisite}-${niveau}-2-3`]);
    }
  }
  let prerequisSql = '';
  if (prerequisPairs.length > 0) {
    const values = prerequisPairs.map(([a, b]) => `  ('${a}', '${b}')`).join(`\n`);
    prerequisSql = `INSERT INTO "_CompetencePrerequis" ("A", "B") VALUES
${values}
ON CONFLICT DO NOTHING;

`;
  }

  sql += batchInsert('learnos_chapitres', ['id','tenantId','siteId','matiereId','nom','niveau','ordre','createdAt','updatedAt'], chapitres) + '\n\n';
  sql += batchInsert('learnos_competences', ['id','tenantId','siteId','chapitreId','code','libelle','description','ordre','createdAt','updatedAt'], competences) + '\n\n';
  sql += prerequisSql;
  sql += batchInsert('learnos_planification_chapitres', ['id','tenantId','siteId','anneeId','chapitreId','classeId','semaineDebut','semaineFin','heuresPrevues','statut','traiteLe','createdAt','updatedAt','demarreLe','semaineDebutInitiale','semaineFinInitiale'], planifsChap) + '\n\n';
  sql += batchInsert('learnos_planification_competences', ['id','tenantId','siteId','anneeId','competenceId','classeId','semaineDebut','semaineFin','statut','createdAt','updatedAt'], planifsComp) + '\n\n';
  sql += batchInsert('learnos_seuils_recommandation', ['id','tenantId','siteId','niveau','matiereId','seuilCritique','seuilFragile','seuilConsolide','seuilAvance','confianceMinimale','prerequisBloquantsMin','createdAt','updatedAt','declenchementPlanAvances','declenchementPlanCritiques'], seuils) + '\n\n';

  return sql;
}

// ── File 11: LEARNOS apprentissage ───────────────────────────
// DONNÉES LOGIQUEMENT COHÉRENTES — pas aléatoires :
// - Les evidences suivent une trajectoire d'apprentissage (initial → oubli → récupération)
// - Les profils sont calculés à partir des evidences (moyenne + tendance réelle)
// - Les élèves faibles échouent aussi les compétences dépendantes (respect du graphe prerequis)
// - Les interventions COMPLETED ont masteryBefore < masteryAfter (amélioration mesurée)
// - Les plans TERMINE ont masteryAvant < masteryApres (efficacité mesurable)
// - Les recommandations OBLIGATOIRE non résolues alimentent la simulation de remédiation
// - Les types d'intervention varient pour permettre la comparaison d'efficacité
// - Les responsables varient pour permettre le classement des enseignants
function genFile11() {
  let sql = `-- 11-learnos-apprentissage.sql\n-- Cité Scolaire Ambouli — LEARNOS Apprentissage (Evidences, Profils, Recommandations, Interventions, Plans)\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "learnos_etapes_plan" WHERE "planId" IN (SELECT id FROM "learnos_plans_progression" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "learnos_plans_progression" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_student_interventions" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_recommandations" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_student_learning_profiles" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_learning_evidences" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_evaluation_competences" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const evidences = [], interventions = [], plans = [], etapes = [], evalComps = [];

  // Un profil d'apprentissage et une recommandation portent sur un couple
  // (élève, compétence) — le schéma l'impose (`@@unique([eleveId, competenceId])`),
  // et c'est bien un état COURANT, pas un instantané annuel. Un redoublant
  // refait le même niveau, donc la même chaîne de compétences : les émettre
  // par inscription produisait deux lignes pour le même couple. On les indexe
  // donc, et l'année la plus récente — parcourue en dernier — l'emporte.
  const profils = new Map();
  const recommandations = new Map();

  // On parcourt les INSCRIPTIONS, pas les élèves. Un élève présent les deux
  // ans doit produire une chaîne de preuves par année, au niveau qui était le
  // sien cette année-là : indexer par `eleveId` seul ferait écraser son année
  // de 6ème par celle de 5ème, et daterait ses preuves de collège sur la
  // mauvaise année. C'est la chaîne temporelle N-1 → N qui en dépend.
  const inscriptionsAmbouli = ALL_ELEVES.filter(e => e.siteName === 'ambouli');
  const parcoursLearnos = [
    ...inscriptionsAmbouli.filter(e => e.anneeYear === '2024'), // année N-1
    ...inscriptionsAmbouli.filter(e => e.anneeYear === '2025'), // année N
  ];

  /// Année et niveau de chaque preuve — relus par la compilation plus bas,
  /// qui ne peut plus les redemander à l'élève seul.
  const evidenceMeta = new Map();

  // Multi-subject competence chains per niveau
  // Each subject has a 6-competence chain: 1-1 → 1-2 → 1-3 → 2-1 → 2-2 → 2-3
  const sujets = ['MATH', 'FR', 'ANG', 'HG', 'PC', 'SVT'];
  function compChainFor(sujet, niveau) {
    return [
      `comp-${sujet}-${niveau}-1-1`, `comp-${sujet}-${niveau}-1-2`, `comp-${sujet}-${niveau}-1-3`,
      `comp-${sujet}-${niveau}-2-1`, `comp-${sujet}-${niveau}-2-2`, `comp-${sujet}-${niveau}-2-3`,
    ];
  }

  // 5 temporal points per school year (courbe d'oubli complète)
  // Sep: initial learning, Nov: consolidation, Jan: after winter break (forgetting),
  // Mar: relearning, May: recovery
  // Deux jeux de dates: N-1 (2024-2025) et N (2025-2026)
  const evidenceDatesByYear = {
    '2024': [
      { date: '2024-09-15 00:00:00', periode: 't1' },
      { date: '2024-11-15 00:00:00', periode: 't1' },
      { date: '2025-01-15 00:00:00', periode: 't2' },
      { date: '2025-03-15 00:00:00', periode: 't2' },
      { date: '2025-05-15 00:00:00', periode: 't3' },
    ],
    '2025': [
      { date: '2025-09-15 00:00:00', periode: 't1' },
      { date: '2025-11-15 00:00:00', periode: 't1' },
      { date: '2026-01-15 00:00:00', periode: 't2' },
      { date: '2026-03-15 00:00:00', periode: 't2' },
      { date: '2026-05-15 00:00:00', periode: 't3' },
    ],
  };

  let evIdx = 0, prIdx = 0, rcIdx = 0, ivIdx = 0, plIdx = 0, etIdx = 0, ecIdx = 0;

  for (const insc of parcoursLearnos) {
    const eleveId = insc.eleveId;
    // ── 1. Deterministic student profile (uniform hash) ──
    const profileHash = (parseInt(eleveId.slice(-4)) * 37) % 100;
    let profileType, masteryBase;
    // Distribution: excellent 15%, good 25%, average 35%, weak 15%, veryWeak 10%
    if (profileHash < 15) { profileType = 'excellent'; masteryBase = 0.82 + rand() * 0.15; }
    else if (profileHash < 40) { profileType = 'good'; masteryBase = 0.62 + rand() * 0.18; }
    else if (profileHash < 75) { profileType = 'average'; masteryBase = 0.42 + rand() * 0.18; }
    else if (profileHash < 90) { profileType = 'weak'; masteryBase = 0.22 + rand() * 0.16; }
    else { profileType = 'veryWeak'; masteryBase = 0.08 + rand() * 0.12; }
    const niveau = insc.niveau;
    const anneeYear = insc.anneeYear;
    const evidenceDates = evidenceDatesByYear[anneeYear] || evidenceDatesByYear['2024'];

    // ── 2. Evidences + Profiles per competence (multi-subject) ──
    // LOGIQUE: Si un élève échoue un prérequis, il échoue aussi les compétences dépendantes
    // This creates the correlation needed for validerPrerequisEmpiriquement (CONFIRME verdict)
    for (const sujet of sujets) {
      const compChain = compChainFor(sujet, niveau);
      const matId = `mat-${sujet}`;
    for (let ci = 0; ci < compChain.length; ci++) {
      const cpId = compChain[ci];

      // Prerequisite cascade effect: dependent competences are harder if prereq was failed
      let competenceBase = masteryBase;
      if (ci > 0) {
        if (profileType === 'veryWeak') {
          competenceBase = Math.max(0.03, masteryBase - 0.12 * ci);
        } else if (profileType === 'weak') {
          competenceBase = Math.max(0.08, masteryBase - 0.08 * ci);
        } else if (profileType === 'average') {
          competenceBase = Math.max(0.25, masteryBase - 0.03 * ci);
        }
      }

      // Generate 5 evidences with forgetting/relearning pattern
      // Pattern: E1 (Sep: initial) → E2 (Nov: consolidation) → E3 (Jan: after break — forgetting)
      //          → E4 (Mar: relearning) → E5 (May: recovery)
      const scores = [];
      const forgettingRate = profileType === 'veryWeak' ? 0.20 :
                             profileType === 'weak' ? 0.15 :
                             profileType === 'average' ? 0.10 :
                             profileType === 'good' ? 0.05 : 0.03;
      const recoveryRate = profileType === 'veryWeak' ? 0.05 :
                           profileType === 'weak' ? 0.08 :
                           profileType === 'average' ? 0.10 :
                           profileType === 'good' ? 0.04 : 0.02;
      for (let e = 0; e < evidenceDates.length; e++) {
        evIdx++;
        let score;
        if (e === 0) {
          // Sep: initial learning
          score = competenceBase;
        } else if (e === 1) {
          // Nov: consolidation (slight improvement)
          score = Math.min(1, competenceBase + 0.03);
        } else if (e === 2) {
          // Jan: after winter break — forgetting
          score = Math.max(0, competenceBase - forgettingRate);
        } else if (e === 3) {
          // Mar: relearning (partial recovery)
          score = Math.max(0, competenceBase - forgettingRate * 0.5);
        } else {
          // May: recovery
          score = Math.min(1, competenceBase - forgettingRate * 0.2 + recoveryRate);
        }
        score = Math.round(score * 100) / 100;
        scores.push(score);

        const clsId = insc.classeId;
        const evalId = `eval-${clsId}-${sujet}-per-y${anneeYear}-${evidenceDates[e].periode}-amb-0`;
        const isError = profileType === 'weak' || profileType === 'veryWeak';
        const errorType = isError ? pick(['CONCEPTUAL_ERROR','PROCEDURAL_ERROR','CALCULATION_ERROR']) : null;
        const errorConf = isError ? 0.7 : null;

        evidences.push([`ev-${evIdx}`,'tenant-ambouli',null,eleveId,cpId,matId,'note',
          `note-${evIdx}`,null,evalId,'DEVOIR',
          Math.round(score * 20 * 100) / 100, 20, score, 0.8, 1,
          errorType, errorConf, null,
          evidenceDates[e].date, evidenceDates[e].date]);
        evidenceMeta.set(`ev-${evIdx}`, { anneeYear, niveau });
      }

      // Generate StudentLearningProfile from evidence scores (logically derived)
      prIdx++;
      const avgScore = Math.round((scores.reduce((a,b) => a+b, 0) / scores.length) * 100) / 100;
      const trendDelta = scores[scores.length-1] - scores[0];
      const trend = trendDelta > 0.03 ? 'hausse' :
                    trendDelta < -0.03 ? 'baisse' : 'stable';
      let status = 'UNKNOWN';
      if (avgScore >= 0.8) status = 'MASTERED';
      else if (avgScore >= 0.55) status = 'PROFICIENT';
      else if (avgScore >= 0.35) status = 'DEVELOPING';
      else status = 'EMERGING';

      profils.set(`${eleveId}|${cpId}`, [`prof-${prIdx}`,'tenant-ambouli',null,eleveId,cpId,
        avgScore, 0.8, status, scores.length, evidenceDates[evidenceDates.length-1].date, trend,
        null, null, null, TS, TS]);
    } // end for each competence in chain
    } // end for each sujet

    // ── 3. Remediation workflow for weak/very weak students (MATH only) ──
    if (profileType === 'weak' || profileType === 'veryWeak') {
      const compChain = compChainFor('MATH', niveau);
      const cpId = compChain[0];
      const baseMastery = Math.round((masteryBase) * 100) / 100;

      // 3a. Recommandation — couvrir les 5 statuts + 5 niveaux
      rcIdx++;
      const recNiveau = profileType === 'veryWeak' ? 'CRITIQUE' : 'FRAGILE';
      // Distribution: 40% OBLIGATOIRE, 20% RECOMMANDEE, 15% PROPOSEE, 15% ACCEPTEE, 10% ECARTEE
      const recRoll = profileHash % 10;
      let recStatut, recDecidePar, recDecideeLe, recResolueLe;
      if (recRoll < 4) { recStatut = 'OBLIGATOIRE'; recDecidePar = null; recDecideeLe = null; recResolueLe = null; }
      else if (recRoll < 6) { recStatut = 'RECOMMANDEE'; recDecidePar = null; recDecideeLe = null; recResolueLe = null; }
      else if (recRoll < 8) { recStatut = 'PROPOSEE'; recDecidePar = null; recDecideeLe = null; recResolueLe = null; }
      else if (recRoll < 9) { recStatut = 'ACCEPTEE'; recDecidePar = 'user-admin-amb'; recDecideeLe = '2025-02-01 00:00:00'; recResolueLe = '2025-04-15 00:00:00'; }
      else { recStatut = 'ECARTEE'; recDecidePar = 'user-admin-amb'; recDecideeLe = '2025-02-01 00:00:00'; recResolueLe = null; }
      recommandations.set(`${eleveId}|${cpId}`, [`rec-${rcIdx}`,'tenant-ambouli',null,eleveId,cpId,
        recNiveau, recStatut,
        `Compétence ${cpId} nécessite un soutien`,
        'seuil_critique', 'Séance de remédiation',
        null, 0,
        recDecidePar, recDecideeLe, recResolueLe,
        TS, TS, null]);

      // 3b. Intervention — distribution: PROPOSED 20%, ACTIVE 20%, COMPLETED 55%, REJECTED 5%
      ivIdx++;
      const interventionType = pick(['remediation', 'retest', 'prerequisite_review']);
      const interventionDelta =
        interventionType === 'remediation' ? 0.20 + rand() * 0.10 :
        interventionType === 'prerequisite_review' ? 0.15 + rand() * 0.10 :
        0.08 + rand() * 0.07;
      const masteryAfter = Math.min(1, Math.round((baseMastery + interventionDelta) * 100) / 100);
      const ivRoll = profileHash % 20;
      let ivStatus, ivStartDate, ivReviewDate, ivOutcome, ivMasteryAfter, ivApprovedBy, ivApprovedAt;
      if (ivRoll < 4) {
        // PROPOSED — pas encore approuvée
        ivStatus = 'PROPOSED'; ivStartDate = null; ivReviewDate = null;
        ivOutcome = null; ivMasteryAfter = null; ivApprovedBy = null; ivApprovedAt = null;
      } else if (ivRoll < 8) {
        // ACTIVE — en cours
        ivStatus = 'ACTIVE'; ivStartDate = '2025-03-01 00:00:00'; ivReviewDate = '2025-05-15 00:00:00';
        ivOutcome = null; ivMasteryAfter = null; ivApprovedBy = 'user-admin-amb'; ivApprovedAt = '2025-02-25 00:00:00';
      } else if (ivRoll < 11) {
        // REJECTED — refusée
        ivStatus = 'REJECTED'; ivStartDate = null; ivReviewDate = null;
        ivOutcome = 'REJECTED'; ivMasteryAfter = null; ivApprovedBy = 'user-admin-amb'; ivApprovedAt = '2024-11-12 00:00:00';
      } else {
        // COMPLETED — terminée avec mesure before/after
        ivStatus = 'COMPLETED'; ivStartDate = '2024-11-15 00:00:00'; ivReviewDate = '2025-02-15 00:00:00';
        ivOutcome = interventionDelta > 0.15 ? 'SUCCESS' : 'PARTIAL';
        ivMasteryAfter = masteryAfter; ivApprovedBy = 'user-admin-amb'; ivApprovedAt = '2024-11-10 00:00:00';
      }
      interventions.push([`iv-${ivIdx}`,'tenant-ambouli',null,eleveId,cpId,
        `Maîtrise insuffisante sur ${cpId}`,
        "'{}'::text[]",
        interventionType,
        `Séance de ${interventionType === 'remediation' ? 'soutien individualisée' : interventionType === 'retest' ? 'réévaluation' : 'revue des prérequis'}`,
        `user-prof-ambouli-${randInt(1,NB_ENSEIGNANTS_PAR_SITE)}`,
        ivStatus, ivStartDate, ivReviewDate, ivOutcome,
        baseMastery, ivMasteryAfter,
        TRUE, ivApprovedBy, ivApprovedAt,
        TS, TS]);

      // 3c. Plan de progression — distribution: TERMINE 55%, ACTIF 20%, EN_REVUE 10%, ABANDONNE 10%, PROPOSE 5%
      plIdx++;
      const planId = `plan-${plIdx}`;
      const planDelta = 0.12 + rand() * 0.18;
      const masteryApres = Math.min(1, Math.round((baseMastery + planDelta) * 100) / 100);
      const responsableUserId = `user-prof-ambouli-${randInt(1,NB_ENSEIGNANTS_PAR_SITE)}`;
      const planRoll = profileHash % 20;
      let planStatut, planValidePar, planValideLe, planDateFin, planMasteryApres, planResultat, planParentInforme;
      if (planRoll < 11) {
        // TERMINE — avec mesure avant/après
        planStatut = 'TERMINE'; planValidePar = 'user-admin-amb'; planValideLe = '2025-03-20 00:00:00';
        planDateFin = '2025-03-15 00:00:00'; planMasteryApres = masteryApres;
        planResultat = masteryApres >= 0.55 ? 'SUCCES' : 'PARTIEL'; planParentInforme = TRUE;
      } else if (planRoll < 15) {
        // ACTIF — en cours
        planStatut = 'ACTIF'; planValidePar = 'user-admin-amb'; planValideLe = '2025-01-20 00:00:00';
        planDateFin = null; planMasteryApres = null; planResultat = null; planParentInforme = TRUE;
      } else if (planRoll < 17) {
        // EN_REVUE — en révision
        planStatut = 'EN_REVUE'; planValidePar = null; planValideLe = null;
        planDateFin = null; planMasteryApres = null; planResultat = null; planParentInforme = FALSE;
      } else if (planRoll < 19) {
        // ABANDONNE — abandonné
        planStatut = 'ABANDONNE'; planValidePar = 'user-admin-amb'; planValideLe = '2025-01-20 00:00:00';
        planDateFin = '2025-02-15 00:00:00'; planMasteryApres = baseMastery;
        planResultat = 'ECHEC'; planParentInforme = TRUE;
      } else {
        // PROPOSE — proposé non encore validé
        planStatut = 'PROPOSE'; planValidePar = null; planValideLe = null;
        planDateFin = null; planMasteryApres = null; planResultat = null; planParentInforme = FALSE;
      }
      plans.push([planId,'tenant-ambouli',null,eleveId,'remediation','automatique',planStatut,
        `Plan de remédiation pour ${cpId}`,
        'declenchement_plan_critiques',
        responsableUserId,
        planValidePar, planValideLe,
        '2024-11-01 00:00:00', '2025-01-15 00:00:00', planDateFin,
        planParentInforme, baseMastery, planMasteryApres,
        planResultat,
        TS, TS, 'mat-MATH', null]);

      // 3d. Etapes du plan — statut dérivé du plan
      for (let et = 0; et < 2; et++) {
        etIdx++;
        const etapeCpId = compChain[et];
        const echeance = et === 0 ? '2024-12-15 00:00:00' : '2025-02-15 00:00:00';
        // Statut dérivé du plan: TERMINE→VALIDE/FAIT, ACTIF→EN_COURS/FAIT, ABANDONNE→ECHOUE, PROPOSE→A_FAIRE
        let etapeStatut;
        if (planStatut === 'TERMINE') etapeStatut = et === 0 ? 'VALIDE' : (rand() < 0.85 ? 'VALIDE' : 'FAIT');
        else if (planStatut === 'ACTIF') etapeStatut = et === 0 ? 'FAIT' : 'EN_COURS';
        else if (planStatut === 'EN_REVUE') etapeStatut = et === 0 ? 'FAIT' : 'EN_COURS';
        else if (planStatut === 'ABANDONNE') etapeStatut = et === 0 ? 'FAIT' : 'ECHOUE';
        else etapeStatut = 'A_FAIRE'; // PROPOSE
        generatedEtapeIds.push(`etape-${etIdx}`);
        etapes.push([`etape-${etIdx}`,planId,etapeCpId,et+1,
          `Étape ${et+1}: revoir ${etapeCpId}`,
          'enseignant', echeance, etapeStatut, null, null,
          (etapeStatut === 'VALIDE' || etapeStatut === 'FAIT') ? echeance : null, TS, TS]);
      }
    }
  }

  // ── 4. Additional PROPOSE plans for current year (not yet started) ──
  for (let i = 0; i < 10; i++) {
    plIdx++;
    const eleveId = pick(INSCRITS_6EME_AMBOULI).eleveId;
    const cpId = `comp-MATH-6eme-1-${randInt(1,3)}`;
    plans.push([`plan-${plIdx}`,'tenant-ambouli',null,eleveId,'remediation','automatique','PROPOSE',
      `Plan de remédiation proposé pour ${cpId}`,
      'declenchement_plan_critiques',
      null, null, null,
      '2025-09-15 00:00:00', null, null,
      FALSE, 0.25, null, null, TS, TS, 'mat-MATH', null]);
  }

  // ── 5. EvaluationCompetence — link evaluations to competences ──
  const evalClassSuffixes = {
    '6eme': ['A','B','C'], '5eme': ['A','B','C'], '4eme': ['A','B','C'], '3eme': ['A','B','C'],
    '2nde': ['A','B','C','D'], '1ere': ['S','ES','L'], 'Terminale': ['S','ES','L']
  };
  const evalPeriods = {
    '2024': ['per-y2024-t1-amb','per-y2024-t2-amb','per-y2024-t3-amb'],
    '2025': ['per-y2025-t1-amb','per-y2025-t2-amb','per-y2025-t3-amb']
  };
  for (const site of ['ambouli','arhiba']) {
    for (const anneeYear of ['2024','2025']) {
      for (const niveau of ALL_NIVEAUX) {
        for (const suffix of evalClassSuffixes[niveau]) {
          const clsId = `cls-${site}-${anneeYear}-${niveau}-${suffix}`;
          for (const periodeId of evalPeriods[anneeYear]) {
            for (const matCode of ['MATH','FR','ANG','AR']) {
              const evalId = `eval-${clsId}-${matCode}-${periodeId}-0`;
              const nbComp = randInt(1, 2);
              const seenCp = new Set();
              for (let k = 0; k < nbComp; k++) {
                const cpId = `comp-${matCode}-${niveau}-${randInt(1,2)}-${randInt(1,3)}`;
                if (seenCp.has(cpId)) continue; // deduplicate (evaluationId, competenceId)
                seenCp.add(cpId);
                ecIdx++;
                evalComps.push([`evcp-${ecIdx}`,'tenant-ambouli',null,evalId,cpId,1,TS]);
              }
            }
          }
        }
      }
    }
  }

  sql += batchInsert('learnos_learning_evidences', ['id','tenantId','siteId','eleveId','competenceId','matiereId','sourceType','sourceId','noteId','evaluationId','evidenceType','rawScore','maxScore','masterySignal','confidence','weight','errorType','errorConfidence','metadata','createdAt','occurredAt'], evidences) + '\n\n';
  sql += batchInsert('learnos_student_learning_profiles', ['id','tenantId','siteId','eleveId','competenceId','masteryScore','confidenceScore','masteryStatus','evidenceCount','lastEvidenceAt','trend','errorPatterns','prerequisiteStatus','recommendedAction','computedAt','updatedAt'], [...profils.values()]) + '\n\n';
  sql += batchInsert('learnos_recommandations', ['id','tenantId','siteId','eleveId','competenceId','niveau','statut','motif','regleDeclenchee','actionProposee','prerequisManquants','competencesBloquees','decideParId','decideeLe','resolueLe','createdAt','updatedAt','motifParams'], [...recommandations.values()]) + '\n\n';
  sql += batchInsert('learnos_student_interventions', ['id','tenantId','siteId','eleveId','competenceId','reason','evidenceRefs','interventionType','recommendedAction','responsibleUserId','status','startDate','reviewDate','outcome','masteryBefore','masteryAfter','createdByAi','approvedBy','approvedAt','createdAt','updatedAt'], interventions) + '\n\n';
  sql += batchInsert('learnos_plans_progression', ['id','tenantId','siteId','eleveId','type','origine','statut','motif','regleDeclenchee','responsableUserId','valideParId','valideLe','dateDebut','dateRevue','dateFin','parentInforme','masteryAvant','masteryApres','resultat','createdAt','updatedAt','matiereId','motifParams'], plans) + '\n\n';
  sql += batchInsert('learnos_etapes_plan', ['id','planId','competenceId','ordre','action','responsable','echeance','statut','evaluationJalonId','evidenceValidanteId','valideeLe','createdAt','updatedAt'], etapes) + '\n\n';
  sql += batchInsert('learnos_evaluation_competences', ['id','tenantId','siteId','evaluationId','competenceId','poids','createdAt'], evalComps) + '\n\n';

  // ── Compilation des evidences pour genFile13 (chaîne temporelle) ──
  // Structure: evidenceCompilation[anneeYear][niveau][matCode] = { avgMastery, count, trendSum }
  // Cette compilation alimente les prédictions de l'année SUIVANTE
  // N-1 (2024) compile → N (2025) prédit sur N-1 → N compile → N+1 (2026) prédit sur N (cumul N-1)
  for (const ev of evidences) {
    // ev = [id, tenantId, siteId, eleveId, competenceId, matiereId, sourceType, noteId, ...]
    const eleveId = ev[3];
    const cpId = ev[4];
    const matId = ev[5];
    // masterySignal (index 13) — score de maîtrise sur 0–1.
    // ATTENTION : l'index 12 est `maxScore`, constant à 20. Le lire ici
    // faisait remonter une « maîtrise » de 20 sur une échelle 0–1, ce qui
    // saturait masteryAvant/masteryApres, portait l'écart des prédictions à
    // 19,05 (predictionCorrecte faux partout, 3 % de justesse affichée) et
    // produisait des seuils de calibration mélangeant les deux échelles
    // (19,8 / 19,95 / 0,85 / 0,95). Cf. l'ordre des colonnes du batchInsert
    // de `learnos_learning_evidences` plus bas.
    const score = ev[13];
    const meta = evidenceMeta.get(ev[0]);
    if (!meta) continue;
    const yr = meta.anneeYear;
    const nv = meta.niveau;
    const matCode = matId.replace('mat-', '');
    if (!evidenceCompilation[yr]) evidenceCompilation[yr] = {};
    if (!evidenceCompilation[yr][nv]) evidenceCompilation[yr][nv] = {};
    if (!evidenceCompilation[yr][nv][matCode]) evidenceCompilation[yr][nv][matCode] = { scores: [], count: 0 };
    evidenceCompilation[yr][nv][matCode].scores.push(score);
    evidenceCompilation[yr][nv][matCode].count++;
  }
  // Calculer les moyennes
  for (const yr of Object.keys(evidenceCompilation)) {
    for (const nv of Object.keys(evidenceCompilation[yr])) {
      for (const matCode of Object.keys(evidenceCompilation[yr][nv])) {
        const c = evidenceCompilation[yr][nv][matCode];
        c.avgMastery = Math.round((c.scores.reduce((a, b) => a + b, 0) / c.scores.length) * 100) / 100;
      }
    }
  }
  console.log(`  [genFile11] Compilation: 2024=${Object.keys(evidenceCompilation['2024'] || {}).length} niveaux, 2025=${Object.keys(evidenceCompilation['2025'] || {}).length} niveaux`);

  // ── Assertions de distribution ──
  const profileCounts = { excellent: 0, good: 0, average: 0, weak: 0, veryWeak: 0 };
  for (const insc of parcoursLearnos) {
    const ph = (parseInt(insc.eleveId.slice(-4)) * 37) % 100;
    if (ph < 15) profileCounts.excellent++;
    else if (ph < 40) profileCounts.good++;
    else if (ph < 75) profileCounts.average++;
    else if (ph < 90) profileCounts.weak++;
    else profileCounts.veryWeak++;
  }
  const total = parcoursLearnos.length;
  console.log(`  [genFile11] Distribution: excellent=${profileCounts.excellent} (${Math.round(profileCounts.excellent/total*100)}%), good=${profileCounts.good} (${Math.round(profileCounts.good/total*100)}%), average=${profileCounts.average} (${Math.round(profileCounts.average/total*100)}%), weak=${profileCounts.weak} (${Math.round(profileCounts.weak/total*100)}%), veryWeak=${profileCounts.veryWeak} (${Math.round(profileCounts.veryWeak/total*100)}%)`);

  // Compter les profils dans la bande fragile 0.35-0.70 (pour alertes OubliVacances)
  const fragileCount = [...profils.values()].filter(p => p[5] >= 0.35 && p[5] <= 0.70).length;
  console.log(`  [genFile11] Profils bande fragile (0.35-0.70): ${fragileCount} (cible >= 60)`);
  if (fragileCount < 60) {
    console.warn(`  [genFile11] ATTENTION: seulement ${fragileCount} profils dans la bande fragile (cible >= 60)`);
  }

  return sql;
}
// ── File 12: LEARNOS exercices ───────────────────────────────
function genFile12() {
  let sql = `-- 12-learnos-exercices.sql\n-- Cité Scolaire Ambouli — LEARNOS Exercices (Questions, Feuilles, Exercices assignés, Réponses)\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "learnos_exercices_reponses" WHERE "exerciceAssigneId" IN (SELECT id FROM "learnos_exercices_assignes" WHERE "feuilleId" IN (SELECT id FROM "learnos_feuilles_exercices" WHERE "tenantId"='tenant-ambouli'));\nDELETE FROM "learnos_exercices_assignes" WHERE "feuilleId" IN (SELECT id FROM "learnos_feuilles_exercices" WHERE "tenantId"='tenant-ambouli');\nDELETE FROM "learnos_feuilles_exercices" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_questions" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const questions = [], feuilles = [], exercices = [], reponses = [];
  const compIds = [];
  for (const matCode of ['MATH','FR','ANG']) {
    for (const niveau of ['6eme','5eme']) {
      for (let c = 0; c < 2; c++) {
        for (let k = 0; k < 3; k++) {
          compIds.push(`comp-${matCode}-${niveau}-${c+1}-${k+1}`);
        }
      }
    }
  }

  // Questions (5 per competence, 3 paliers)
  const paliers = ['RESTITUTION','APPLICATION','CONSOLIDATION','TRANSFERT','OUVERTURE'];
  let qIdx = 0;
  for (const cpId of compIds) {
    for (let q = 0; q < 5; q++) {
      qIdx++;
      const palier = paliers[q % paliers.length];
      const isIa = rand() < 0.60;
      const origine = isIa ? 'ia' : 'humain';
      const isReviewed = isIa && rand() < 0.40;
      const relueParId = isReviewed ? `user-prof-ambouli-${randInt(1,NB_ENSEIGNANTS_PAR_SITE)}` : null;
      const relueLe = isReviewed ? `2025-${String(randInt(9,12)).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00` : null;
      questions.push([`q-${qIdx}`,'tenant-ambouli',null,cpId,palier,`Question ${q+1} pour ${cpId}`,`Corrigé: réponse attendue`,1,origine,TRUE,TS,TS,pick(['CHOIX_UNIQUE','SAISIE_COURTE','SAISIE_LIBRE','APPARIEMENT']),`'{"propositions":["A","B","C","D"],"bonne":"A"}'::jsonb`,relueLe,relueParId]);
    }
  }

  // Feuilles + exercices pour 50 élèves
  const eleveIds = PERSONNES_PAR_SITE.ambouli.slice(0, 50).map(p => p.eleveId);

  let fIdx = 0, exIdx = 0, rIdx = 0;
  // Etape IDs collected from genFile11 (shared via module-level variable)
  // Link some feuilles to existing etape plan steps
  const knownEtapeIds = generatedEtapeIds;
  for (const eleveId of eleveIds) {
    fIdx++;
    const fId = `feuille-${fIdx}`;
    const assignDate = schoolDate('00');
    const feuilleStatut = isPast(assignDate)
      ? weightedPick([['TERMINEE',7],['EN_COURS',2],['ASSIGNEE',1]])
      : 'ASSIGNEE';
    const termineeLe = feuilleStatut === 'TERMINEE' ? assignDate : null;
    // Link every 5th feuille to an existing etape plan step
    const etapePlanId = (fIdx % 5 === 0 && knownEtapeIds.length > 0) ? knownEtapeIds[(fIdx % knownEtapeIds.length)] : null;
    feuilles.push([fId,'tenant-ambouli',null,eleveId,'mat-MATH','entrainement',feuilleStatut,etapePlanId,null,null,assignDate,termineeLe,TS,TS,null]);

    // 5 exercices per feuille
    for (let e = 0; e < 5; e++) {
      exIdx++;
      const qId = `q-${((fIdx-1)*5+e) % qIdx + 1}`;
      const cpId = compIds[e % compIds.length];
      exercices.push([`ex-${exIdx}`,fId,qId,cpId,null,e+1,paliers[e%paliers.length],'exercice_soutien',null,e+1,TS]);

      // Réponse (80% completed if feuille is TERMINEE or EN_COURS)
      if (feuilleStatut !== 'ASSIGNEE' && rand() < 0.80) {
        rIdx++;
        const score = rand() < 0.5 ? 1 : 0;
        // Set evidenceId to null — let the system create evidence records
        reponses.push([`rep-${rIdx}`,`ex-${exIdx}`,score === 1 ? 'A' : 'B',score,1,null,null,null,assignDate,assignDate,randInt(30000,300000),null,randInt(1,3)]);
      }
    }
  }

  sql += batchInsert('learnos_questions', ['id','tenantId','siteId','competenceId','palier','enonce','corrige','bareme','origine','actif','createdAt','updatedAt','format','structure','relueLe','relueParId'], questions) + '\n\n';
  sql += batchInsert('learnos_feuilles_exercices', ['id','tenantId','siteId','eleveId','matiereId','type','statut','etapePlanId','valideParId','valideeLe','assigneeLe','termineeLe','createdAt','updatedAt','competenceAttesteeId'], feuilles) + '\n\n';
  sql += batchInsert('learnos_exercices_assignes', ['id','feuilleId','questionId','competenceId','competenceViseeId','ordre','palier','regleDeclenchee','motifParams','priorite','createdAt'], exercices) + '\n\n';
  sql += batchInsert('learnos_exercices_reponses', ['id','exerciceAssigneId','reponse','score','maxScore','corrigeParId','corrigeeLe','evidenceId','repondueLe','updatedAt','dureeMs','etapes','tentatives'], reponses) + '\n\n';

  return sql;
}

// ── File 13: LEARNOS intelligence ────────────────────────────
function genFile13() {
  let sql = `-- 13-learnos-intelligence.sql\n-- Cité Scolaire Ambouli — LEARNOS Intelligence (Patterns, Prédictions, Calibrations, Journal, KPIs, Bot parent, IA)\n\n`;
  sql += `-- Nettoyage\nDELETE FROM "learnos_ai_cache" WHERE "cacheKey" LIKE 'ambouli-%';\nDELETE FROM "learnos_ai_decision_logs" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_rubriques_evaluation" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_plans_lecon" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_echanges_parent" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_alertes_parent" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_kpi_snapshots" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_journal_apprentissage" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_calibration_seuils" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_predictions" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_patterns_pedago" WHERE "tenantId"='tenant-ambouli';\nDELETE FROM "learnos_events" WHERE "tenantId"='tenant-ambouli';\n\n`;

  const patterns = [], predictions = [], calibrations = [], journal = [], kpis = [];
  const alertes = [], echanges = [], plansLecon = [], rubriques = [], aiLogs = [], aiCache = [], events = [];

  const niveaux = ['6eme','5eme','4eme','3eme','2nde','1ere','Terminale'];
  const matieresCodes = ['MATH','FR','ANG','HG','PC','SVT'];
  const compIds = [];
  for (const matCode of ['MATH','FR','ANG']) {
    for (const niveau of ['6eme','5eme']) {
      for (let c = 0; c < 2; c++) {
        for (let k = 0; k < 3; k++) {
          compIds.push(`comp-${matCode}-${niveau}-${c+1}-${k+1}`);
        }
      }
    }
  }

  // ── Motifs pédagogiques, dérivés des preuves réellement générées ──
  //
  // Ces motifs sont l'argument « le système apprend de VOTRE établissement » :
  // une génération par année, la seconde cumulant les deux cohortes. Deux
  // choses les rendaient indémontrables auparavant :
  //   — `masteryMoyenne`, `ecartType` et `tauxEchec` étaient tirés au hasard,
  //     sans lien avec les preuves ; un directeur qui recoupait un motif avec
  //     les notes de sa classe ne retrouvait rien.
  //   — `anneesCouvertes` valait 1 sur toutes les lignes, y compris celles
  //     censées cumuler N-1 et N : l'accumulation ne se voyait nulle part.
  //
  // On repart donc de `evidenceCompilation`, qui porte les scores de maîtrise
  // réels par année/niveau/matière (cf. le correctif d'index plus haut).
  let ptIdx = 0, pdIdx = 0, calIdx = 0, jnIdx = 0, kpIdx = 0, alIdx = 0, ecIdx = 0, plIdx = 0, rbIdx = 0, alLogIdx = 0, acIdx = 0, evIdx = 0;

  /** Moyenne, écart-type et taux d'échec d'une liste de scores 0–1. */
  const statsScores = (scores) => {
    const n = scores.length;
    const moyenne = scores.reduce((a, b) => a + b, 0) / n;
    const variance = scores.reduce((a, b) => a + (b - moyenne) ** 2, 0) / n;
    return {
      moyenne: Math.round(moyenne * 1000) / 1000,
      ecartType: Math.round(Math.sqrt(variance) * 1000) / 1000,
      // Échec = maîtrise sous le seuil critique de référence (0,35).
      tauxEchec: Math.round((scores.filter((s) => s < 0.35).length / n) * 1000) / 1000,
      effectif: n,
    };
  };

  // Génération 1 : N-1 seule. Génération 2 : N-1 + N cumulées.
  const generationsMotifs = [
    { annees: ['2024'], couvertes: 1, debut: '2024-09-01 00:00:00', fin: '2025-06-30 00:00:00', ts: TS },
    { annees: ['2024', '2025'], couvertes: 2, debut: '2024-09-01 00:00:00', fin: '2026-06-30 00:00:00', ts: TS2 },
  ];

  for (const gen of generationsMotifs) {
    for (const niveau of niveaux) {
      for (const matCode of matieresCodes.slice(0, 3)) {
        const scores = [];
        for (const yr of gen.annees) {
          const c = evidenceCompilation[yr]?.[niveau]?.[matCode];
          if (c?.scores?.length) scores.push(...c.scores);
        }
        if (!scores.length) continue; // pas de preuve : pas de motif inventé
        const s = statsScores(scores);
        ptIdx++;
        patterns.push([
          `pat-${ptIdx}`, 'tenant-ambouli', null, niveau, `mat-${matCode}`, null,
          s.moyenne,
          // La confiance croît avec le volume observé, et plafonne à 0,92.
          Math.round(Math.min(0.92, 0.45 + Math.log10(1 + s.effectif) * 0.14) * 1000) / 1000,
          s.effectif, s.ecartType, s.tauxEchec,
          gen.debut, gen.fin, gen.couvertes, randInt(1, 36), gen.ts, gen.ts,
        ]);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  // CHAÎNE TEMPORELLE CUMULATIVE
  // ════════════════════════════════════════════════════════════════
  // N-1 (2024-2025): Evidences → Compilation → Calibrations initiales
  // N   (2025-2026): Prédictions basées sur N-1 → Evidences → Compilation mise à jour + calibrage
  // N+1 (2026-2027): Prédictions basées sur N (qui cumule N-1) → ...
  //
  // Les prédictions pour l'année N sont émises au début de N (septembre)
  // en utilisant la compilation de N-1. Elles sont vérifiées en cours/fin de N.
  // Les calibrations de N sont mises à jour avec les evidences de N (cumul N-1).

  // Récupérer les élèves des deux cohortes
  const eleveIds2024 = [];
  const eleveIds2025 = [];
  for (const e of ALL_ELEVES) {
    if (e.siteName === 'ambouli') {
      if (e.anneeYear === '2024') eleveIds2024.push(e.eleveId);
      if (e.anneeYear === '2025') eleveIds2025.push(e.eleveId);
    }
  }

  // ── Phase 1: Calibrations initiales (N-1 = 2024-2025) ──
  // Basées sur la compilation des evidences de 2024
  // Si pas de données compilées, utiliser des valeurs par défaut
  for (const niveau of niveaux) {
    calIdx++;
    const comp2024 = evidenceCompilation['2024']?.[niveau];
    let seuilCritique = 0.3, seuilFragile = 0.5, seuilConsolide = 0.75, seuilAvance = 0.9;
    let echantillon = randInt(50, 200);
    let gainPrecision = randInt(2, 8);
    // Ajuster les seuils si on a des données compilées
    if (comp2024) {
      const allScores = Object.values(comp2024).map(c => c.avgMastery);
      if (allScores.length > 0) {
        const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        // Ajuster les seuils autour de la moyenne observée
        seuilCritique = Math.max(0.15, Math.round((avg - 0.2) * 100) / 100);
        seuilFragile = Math.max(0.25, Math.round((avg - 0.05) * 100) / 100);
        seuilConsolide = Math.min(0.85, Math.round((avg + 0.2) * 100) / 100);
        seuilAvance = Math.min(0.95, Math.round((avg + 0.35) * 100) / 100);
        echantillon = Object.values(comp2024).reduce((s, c) => s + c.count, 0);
        gainPrecision = Math.min(12, Math.round(echantillon / 50));
      }
    }
    calibrations.push([`cal-${calIdx}`,'tenant-ambouli',null,niveau,null,
      seuilCritique, seuilFragile, seuilConsolide, seuilAvance, 0.45,
      echantillon, TRUE, gainPrecision, '2024-09-15 12:00:00', '2025-06-30 12:00:00']);
  }

  // ── Phase 2: Prédictions pour N (2025-2026) basées sur compilation N-1 (2024) ──
  // Émises en septembre 2025, vérifiées en cours d'année 2025-2026
  // La probaReussite est dérivée de la mastery moyenne observée en N-1
  for (const eleveId of eleveIds2024.slice(0, 80)) {
    const profileHash = (parseInt(eleveId.slice(-4)) * 37) % 100;
    let profileType;
    if (profileHash < 15) profileType = 'excellent';
    else if (profileHash < 40) profileType = 'good';
    else if (profileHash < 75) profileType = 'average';
    else if (profileHash < 90) profileType = 'weak';
    else profileType = 'veryWeak';

    // 2 prédictions par élève, sur 2 compétences différentes
    for (let p = 0; p < 2; p++) {
      pdIdx++;
      const cpId = compIds[pdIdx % compIds.length];
      const cpParts = cpId.split('-');
      const matCode = cpParts[1];
      const niveau = cpParts[2];
      const chapNum = randInt(1, 2);
      const chapitreId = `chap-${matCode}-${niveau}-${chapNum}`;

      // masteryAvant = compilation N-1 pour ce niveau/matière
      const compN1 = evidenceCompilation['2024']?.[niveau]?.[matCode];
      const masteryAvant = compN1 ? compN1.avgMastery : 0.4;

      // probaReussite basée sur masteryAvant + ajustement selon profil
      let proba = masteryAvant;
      if (profileType === 'excellent') proba += 0.10;
      else if (profileType === 'good') proba += 0.05;
      else if (profileType === 'average') proba -= 0.05;
      else if (profileType === 'weak') proba -= 0.15;
      else proba -= 0.25;
      // Ajouter bruit (la prédiction n'est jamais parfaite)
      const isAccurate = rand() < 0.70;
      if (!isAccurate) {
        const direction = proba < 0.5 ? 1 : -1;
        proba += direction * (0.15 + rand() * 0.15);
      }
      proba = Math.max(0.05, Math.min(0.95, Math.round(proba * 100) / 100));

      // masteryApres = résultat réel observé en N (compilation N si disponible, sinon approximation)
      const compN = evidenceCompilation['2025']?.[niveau]?.[matCode];
      const masteryApres = compN ? compN.avgMastery : Math.max(0.05, Math.min(1, Math.round((proba + (rand() * 0.20 - 0.10)) * 100) / 100));

      // L'écart est arrondi au centième avant d'être jugé, puisque c'est cette
      // valeur arrondie qui est écrite : la juger sur la valeur pleine laissait
      // passer des lignes où `ecart = 0.15` est marqué correct alors que la
      // règle est `< 0.15`. La ligne se contredisait elle-même.
      const ecart = Math.round(Math.abs(proba - masteryApres) * 100) / 100;
      const predictionCorrecte = ecart < 0.15;
      const diff = proba >= 0.7 ? 'FACILE' : (proba >= 0.5 ? 'MODERE' : (proba >= 0.3 ? 'DIFFICILE' : 'CRITIQUE'));
      const prerequisManquants = masteryAvant < 0.35 ? randInt(2, 4) : (masteryAvant < 0.55 ? randInt(1, 2) : (masteryAvant < 0.75 ? randInt(0, 1) : 0));

      // Émise en septembre 2025, vérifiée en cours d'année 2025-2026
      const verifMonth = rand() < 0.5 ? randInt(9, 12) : randInt(1, 6);
      const verifYear = verifMonth >= 9 ? 2025 : 2026;
      const verifieeLe = `${verifYear}-${String(verifMonth).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')} 00:00:00`;

      predictions.push([`pred-${pdIdx}`,'tenant-ambouli',null,eleveId,cpId,chapitreId,'annee-2025-amb',
        proba, diff, masteryAvant, 0.7, prerequisManquants, masteryApres,
        predictionCorrecte, ecart,
        '2025-09-01 00:00:00', verifieeLe]);
    }
  }

  // ── Phase 3: Calibrations mises à jour pour N (2025-2026) ──
  // Cumulent les données de N-1 et N (échantillon plus large, gain de précision)
  for (const niveau of niveaux) {
    calIdx++;
    const comp2024 = evidenceCompilation['2024']?.[niveau];
    const comp2025 = evidenceCompilation['2025']?.[niveau];
    let seuilCritique = 0.3, seuilFragile = 0.5, seuilConsolide = 0.75, seuilAvance = 0.9;
    let echantillon = 0, gainPrecision = 0;
    // Cumul N-1 + N
    const allScores = [];
    if (comp2024) for (const c of Object.values(comp2024)) { allScores.push(c.avgMastery); echantillon += c.count; }
    if (comp2025) for (const c of Object.values(comp2025)) { allScores.push(c.avgMastery); echantillon += c.count; }
    if (allScores.length > 0) {
      const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
      seuilCritique = Math.max(0.15, Math.round((avg - 0.2) * 100) / 100);
      seuilFragile = Math.max(0.25, Math.round((avg - 0.05) * 100) / 100);
      seuilConsolide = Math.min(0.85, Math.round((avg + 0.2) * 100) / 100);
      seuilAvance = Math.min(0.95, Math.round((avg + 0.35) * 100) / 100);
      gainPrecision = Math.min(15, Math.round(echantillon / 40));
    } else {
      echantillon = randInt(100, 300);
      gainPrecision = randInt(4, 10);
    }
    calibrations.push([`cal-${calIdx}`,'tenant-ambouli',null,niveau,null,
      seuilCritique, seuilFragile, seuilConsolide, seuilAvance, 0.45,
      echantillon, TRUE, gainPrecision, '2025-09-15 12:00:00', '2026-06-30 12:00:00']);
  }

  // ── Phase 4: Prédictions pour N+1 (2026-2027) basées sur compilation N (cumul N-1) ──
  // Émises en septembre 2026, NON vérifiées (l'année n'a pas encore eu lieu)
  // anneeId = annee-2026-amb (année courante dans la démo)
  for (const eleveId of eleveIds2025.slice(0, 80)) {
    const profileHash = (parseInt(eleveId.slice(-4)) * 37) % 100;
    let profileType;
    if (profileHash < 15) profileType = 'excellent';
    else if (profileHash < 40) profileType = 'good';
    else if (profileHash < 75) profileType = 'average';
    else if (profileHash < 90) profileType = 'weak';
    else profileType = 'veryWeak';

    for (let p = 0; p < 2; p++) {
      pdIdx++;
      const cpId = compIds[pdIdx % compIds.length];
      const cpParts = cpId.split('-');
      const matCode = cpParts[1];
      const niveau = cpParts[2];
      const chapNum = randInt(1, 2);
      const chapitreId = `chap-${matCode}-${niveau}-${chapNum}`;

      // masteryAvant = compilation cumulée N-1 + N
      const compN = evidenceCompilation['2025']?.[niveau]?.[matCode];
      const compN1 = evidenceCompilation['2024']?.[niveau]?.[matCode];
      let masteryAvant = 0.4;
      if (compN && compN1) masteryAvant = Math.round(((compN.avgMastery + compN1.avgMastery) / 2) * 100) / 100;
      else if (compN) masteryAvant = compN.avgMastery;
      else if (compN1) masteryAvant = compN1.avgMastery;

      // probaReussite basée sur masteryAvant cumulé + ajustement profil
      let proba = masteryAvant;
      if (profileType === 'excellent') proba += 0.10;
      else if (profileType === 'good') proba += 0.05;
      else if (profileType === 'average') proba -= 0.05;
      else if (profileType === 'weak') proba -= 0.15;
      else proba -= 0.25;
      proba = Math.max(0.05, Math.min(0.95, Math.round(proba * 100) / 100));

      // NON vérifiée — l'année 2026-2027 n'a pas encore eu lieu
      const diff = proba >= 0.7 ? 'FACILE' : (proba >= 0.5 ? 'MODERE' : (proba >= 0.3 ? 'DIFFICILE' : 'CRITIQUE'));
      const prerequisManquants = masteryAvant < 0.35 ? randInt(2, 4) : (masteryAvant < 0.55 ? randInt(1, 2) : (masteryAvant < 0.75 ? randInt(0, 1) : 0));

      predictions.push([`pred-${pdIdx}`,'tenant-ambouli',null,eleveId,cpId,chapitreId,'annee-2026-amb',
        proba, diff, masteryAvant, 0.7, prerequisManquants, null,
        null, null,
        '2026-09-01 00:00:00', null]);
    }
  }

  console.log(`  [genFile13] Prédictions: N(2025)=${predictions.filter(p => p[6] === 'annee-2025-amb').length}, N+1(2026)=${predictions.filter(p => p[6] === 'annee-2026-amb').length}`);
  console.log(`  [genFile13] Calibrations: N-1(2024)=7, N(2025 cumulatif)=7`);

  // Journal (20)
  for (let i = 0; i < 20; i++) {
    jnIdx++;
    journal.push([`jr-${jnIdx}`,'tenant-ambouli',null,pick(['pattern_detection','prediction','calibration']),`Analyse ${jnIdx}: détection de patterns sur ${niveaux[i%niveaux.length]}`,`Détail technique analyse ${jnIdx}`,randInt(50,500),niveaux[i%niveaux.length],TS]);
  }

  // KPIs (20)
  const kpiKeys = ['learnos.kpi.couverture_curriculum','learnos.kpi.maitrise_moyenne','learnos.kpi.recommandations_actives','learnos.kpi.plans_actifs','learnos.kpi.interventions_en_cours','learnos.kpi.precision_predictions','learnos.kpi.alertes_envoyees','learnos.kpi.eleves_critiques','learnos.kpi.eleves_avances','learnos.kpi.exercices_completes'];
  for (let i = 0; i < 20; i++) {
    kpIdx++;
    const site = i < 10 ? 'site-ambouli' : 'site-arhiba';
    kpis.push([`kpi-${kpIdx}`,'tenant-ambouli',site,pick(['PRINCIPAL','ENSEIGNANT','TENANT_ADMIN']),kpiKeys[i%kpiKeys.length],rand()*100,75,`2025-0${randInt(1,6)}-01 00:00:00`,TS]);
  }

  // Alertes parent (30)
  for (let i = 0; i < 30; i++) {
    alIdx++;
    const site = i < 15 ? 'site-ambouli' : 'site-arhiba';
    const cible = PERSONNES_PAR_SITE.ambouli[i % 50];
    const eleveId = cible.eleveId;
    const parentId = cible.parentId;
    const alertDate = schoolDate('00');
    const statut = isPast(alertDate)
      ? weightedPick([['ENVOYEE',8],['ECHOUEE',1],['EN_ATTENTE',1]])
      : 'EN_ATTENTE';
    alertes.push([`alp-${alIdx}`,'tenant-ambouli',site,eleveId,parentId,pick(['INFO','ATTENTION','URGENT']),'learnos.alertes.difficulte',`'{"competence":"comp-MATH-6eme-1-1"}'::jsonb`,'whatsapp',statut,null,alertDate,null,`empreinte-${alIdx}`,TS,TS]);
  }

  // Échanges parent (15)
  for (let i = 0; i < 15; i++) {
    ecIdx++;
    const site = i < 8 ? 'site-ambouli' : 'site-arhiba';
    const cible = PERSONNES_PAR_SITE.ambouli[i % 50];
    const parentId = cible.parentId;
    const eleveId = cible.eleveId;
    echanges.push([`ech-${ecIdx}`,'tenant-ambouli',site,parentId,eleveId,'whatsapp',`Comment va mon enfant en mathématiques ?`,pick(['progression','difficultes','aider','assiduite','solde','inconnue']),`Votre enfant progresse bien en mathématiques, moyenne actuelle: 12/20.`,null,TS]);
  }

  // Plans de leçon (15) — workflow complet: PROPOSE → AJUSTE → VALIDE | REJETE
  const planStatuts = [
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'AJUSTE', ap: 'user-prof-ambouli-1', al: '2025-10-10 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-2', s: 'AJUSTE', ap: 'user-prof-ambouli-2', al: '2025-10-12 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-3', s: 'AJUSTE', ap: 'user-prof-ambouli-3', al: '2025-10-15 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'VALIDE', ap: 'user-prof-ambouli-1', al: '2025-10-10 00:00:00', vp: 'user-admin-amb', vl: '2025-10-20 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-2', s: 'VALIDE', ap: 'user-prof-ambouli-2', al: '2025-10-12 00:00:00', vp: 'user-admin-amb', vl: '2025-10-22 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-3', s: 'VALIDE', ap: 'user-prof-ambouli-3', al: '2025-10-15 00:00:00', vp: 'user-admin-amb', vl: '2025-10-25 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-4', s: 'VALIDE', ap: 'user-prof-ambouli-4', al: '2025-10-18 00:00:00', vp: 'user-admin-amb', vl: '2025-10-28 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-5', s: 'VALIDE', ap: 'user-prof-ambouli-5', al: '2025-10-20 00:00:00', vp: 'user-admin-amb', vl: '2025-11-01 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-1', s: 'REJETE', ap: null, al: null, vp: null, vl: null, mr: 'Objectifs trop ambitieux pour le niveau 6ème' },
    { pp: 'user-prof-ambouli-6', s: 'REJETE', ap: 'user-prof-ambouli-6', al: '2025-10-08 00:00:00', vp: null, vl: null, mr: 'Étapes mal structurées, manque de progression logique' },
    { pp: 'user-prof-ambouli-7', s: 'VALIDE', ap: 'user-prof-ambouli-7', al: '2025-11-01 00:00:00', vp: 'user-admin-amb', vl: '2025-11-10 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
  ];
  for (let i = 0; i < planStatuts.length; i++) {
    plIdx++;
    const cpId = compIds[i % compIds.length];
    const ps = planStatuts[i];
    plansLecon.push([`pl-${plIdx}`,'tenant-ambouli',null,cpId,'6eme',60,
      `Plan de leçon ${i+1}: ${cpId}`,
      `'["Comprendre les fractions","Manipuler les fractions","Comparer les fractions"]'::jsonb`,
      `'[{"nom":"Introduction","duree":15,"description":"Rappel sur les nombres décimaux"},{"nom":"Exercices","duree":30,"description":"Manipulation de fractions"},{"nom":"Synthèse","duree":15,"description":"Récapitulatif"}]'::jsonb`,
      `'["Manuel","Tableau","Calculatrices"]'::jsonb`,
      'QCM final avec 5 questions',
      'Adaptation: exercices simplifiés pour élèves en difficulté, exercices avancés pour les autres',
      ps.s, ps.pp || null, ps.ap, ps.al, ps.vp, ps.vl, ps.mr,
      'gpt-4', FALSE, TS, TS]);
  }

  // Rubriques (15) — même workflow que plans de leçon
  const rubStatuts = [
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'AJUSTE', ap: 'user-prof-ambouli-1', al: '2025-10-10 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-2', s: 'AJUSTE', ap: 'user-prof-ambouli-2', al: '2025-10-12 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-1', s: 'VALIDE', ap: 'user-prof-ambouli-1', al: '2025-10-10 00:00:00', vp: 'user-admin-amb', vl: '2025-10-20 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-2', s: 'VALIDE', ap: 'user-prof-ambouli-2', al: '2025-10-12 00:00:00', vp: 'user-admin-amb', vl: '2025-10-22 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-3', s: 'VALIDE', ap: 'user-prof-ambouli-3', al: '2025-10-15 00:00:00', vp: 'user-admin-amb', vl: '2025-10-25 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-4', s: 'VALIDE', ap: 'user-prof-ambouli-4', al: '2025-10-18 00:00:00', vp: 'user-admin-amb', vl: '2025-10-28 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-1', s: 'REJETE', ap: null, al: null, vp: null, vl: null, mr: 'Barème non cohérent avec les coefficients de la matière' },
    { pp: 'user-prof-ambouli-5', s: 'REJETE', ap: 'user-prof-ambouli-5', al: '2025-10-08 00:00:00', vp: null, vl: null, mr: 'Critères trop vagues, manque de descripteurs par niveau' },
    { pp: 'user-prof-ambouli-6', s: 'VALIDE', ap: 'user-prof-ambouli-6', al: '2025-11-01 00:00:00', vp: 'user-admin-amb', vl: '2025-11-10 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-7', s: 'AJUSTE', ap: 'user-prof-ambouli-7', al: '2025-11-05 00:00:00', vp: null, vl: null, mr: null },
    { pp: 'user-prof-ambouli-8', s: 'VALIDE', ap: 'user-prof-ambouli-8', al: '2025-11-08 00:00:00', vp: 'user-admin-amb', vl: '2025-11-15 00:00:00', mr: null },
    { pp: 'user-prof-ambouli-1', s: 'PROPOSE', ap: null, al: null, vp: null, vl: null, mr: null },
  ];
  for (let i = 0; i < rubStatuts.length; i++) {
    rbIdx++;
    const cpId = compIds[i % compIds.length];
    const rs = rubStatuts[i];
    rubriques.push([`rb-${rbIdx}`,'tenant-ambouli',null,cpId,'6eme',20,
      `Grille d'évaluation ${i+1}: ${cpId}`,
      `'[{"nom":"Compréhension","points":5,"niveaux":{"excellent":5,"satisfaisant":3,"fragile":2,"insuffisant":0}},{"nom":"Application","points":10,"niveaux":{"excellent":10,"satisfaisant":7,"fragile":4,"insuffisant":0}},{"nom":"Présentation","points":5,"niveaux":{"excellent":5,"satisfaisant":3,"fragile":2,"insuffisant":0}}]'::jsonb`,
      rs.s, rs.pp || null, rs.ap, rs.al, rs.vp, rs.vl, rs.mr,
      'gpt-4', FALSE, TS, TS]);
  }

  // AI Decision Logs (20)
  for (let i = 0; i < 20; i++) {
    alLogIdx++;
    aiLogs.push([`ail-${alLogIdx}`,'tenant-ambouli',null,pick(['AI','USER']),null,pick(['evidence.classify','twin.recompute','intervention.propose','plan.generate']),null,`'{"result":"ok"}'::jsonb`,0.85,'openai','gpt-4','2024-12-01','1.0',null,null,null,TS]);
  }

  // AI Cache (5)
  for (let i = 0; i < 5; i++) {
    acIdx++;
    aiCache.push([`ac-${acIdx}`,`ambouli-cache-${i+1}`,`'{"response":"generated"}'::jsonb`,`2026-01-01 00:00:00`,TS]);
  }

  // Learnos Events (30) — ~80% processed, ~20% pending
  for (let i = 0; i < 30; i++) {
    evIdx++;
    const site = i < 15 ? 'site-ambouli' : 'site-arhiba';
    const occurredAt = `2025-0${randInt(1,6)}-15 00:00:00`;
    // 80% of events are processed (processedAt set after occurredAt), 20% pending (NULL)
    let processedAt = null;
    if (rand() < 0.80) {
      // processedAt: a few days after occurredAt
      const occParts = occurredAt.slice(0, 10).split('-');
      const procDate = new Date(parseInt(occParts[0]), parseInt(occParts[1]) - 1, parseInt(occParts[2]) + randInt(1, 7));
      processedAt = `${procDate.getFullYear()}-${String(procDate.getMonth()+1).padStart(2,'0')}-${String(procDate.getDate()).padStart(2,'0')} 00:00:00`;
    }
    events.push([`lke-${evIdx}`,'tenant-ambouli',site,pick(['note.recorded','evaluation.completed','evidence.classified']),pick(['note','evaluation','evidence']),`agg-${evIdx}`,`'{"data":"snapshot"}'::jsonb`,occurredAt,processedAt,0,null]);
  }

  sql += batchInsert('learnos_events', ['id','tenantId','siteId','eventType','aggregateType','aggregateId','payload','occurredAt','processedAt','attempts','lastError'], events) + '\n\n';
  sql += batchInsert('learnos_patterns_pedago', ['id','tenantId','siteId','niveau','matiereId','competenceId','masteryMoyenne','confidenceMoyenne','effectif','ecartType','tauxEchec','periodeDebut','periodeFin','anneesCouvertes','semaineChapitre','createdAt','updatedAt'], patterns) + '\n\n';
  sql += batchInsert('learnos_predictions', ['id','tenantId','siteId','eleveId','competenceId','chapitreId','anneeId','probaReussite','difficultePredite','masteryAvant','confidenceAvant','prerequisManquants','masteryApres','predictionCorrecte','ecart','emiseLe','verifieeLe'], predictions) + '\n\n';
  sql += batchInsert('learnos_calibration_seuils', ['id','tenantId','siteId','niveau','matiereId','seuilCritique','seuilFragile','seuilConsolide','seuilAvance','confianceMinimale','echantillon','ameliorationMesuree','gainPrecision','createdAt','updatedAt'], calibrations) + '\n\n';
  sql += batchInsert('learnos_journal_apprentissage', ['id','tenantId','siteId','typeAnalyse','resume','detail','echantillon','perimetre','createdAt'], journal) + '\n\n';
  sql += batchInsert('learnos_kpi_snapshots', ['id','tenantId','siteId','role','kpiKey','valeur','cible','periode','createdAt'], kpis) + '\n\n';
  sql += batchInsert('learnos_alertes_parent', ['id','tenantId','siteId','eleveId','parentId','niveau','cle','params','canal','statut','motifSuppression','envoyeeLe','erreur','empreinte','createdAt','updatedAt'], alertes, 'empreinte') + '\n\n';
  sql += batchInsert('learnos_echanges_parent', ['id','tenantId','siteId','parentId','eleveId','canal','question','intention','reponse','modele','createdAt'], echanges) + '\n\n';
  sql += batchInsert('learnos_plans_lecon', ['id','tenantId','siteId','competenceId','niveauScolaire','dureeTotale','titre','objectifs','etapes','materiel','evaluation','differentiation','statut','proposeParId','ajusteParId','ajusteLe','valideParId','valideLe','motifRejet','modeleIa','cachedIa','createdAt','updatedAt'], plansLecon) + '\n\n';
  sql += batchInsert('learnos_rubriques_evaluation', ['id','tenantId','siteId','competenceId','niveauScolaire','totalPoints','titre','criteres','statut','proposeParId','ajusteParId','ajusteLe','valideParId','valideLe','motifRejet','modeleIa','cachedIa','createdAt','updatedAt'], rubriques) + '\n\n';
  sql += batchInsert('learnos_ai_decision_logs', ['id','tenantId','siteId','actorType','actorId','action','inputRef','output','confidence','providerName','modelName','modelVersion','promptVersion','approvedBy','approvedAt','rejectedAt','createdAt'], aiLogs) + '\n\n';
  sql += batchInsert('learnos_ai_cache', ['id','cacheKey','response','expiresAt','createdAt'], aiCache) + '\n\n';

  return sql;
}

// Add files 09-13
const files2 = {
  '09-rh-communication-gouvernance-divers.sql': genFile09(),
  '10-learnos-curriculum.sql': genFile10(),
  '11-learnos-apprentissage.sql': genFile11(),
  '12-learnos-exercices.sql': genFile12(),
  '13-learnos-intelligence.sql': genFile13(),
};

for (const [filename, content] of Object.entries(files2)) {
  splitAndWrite(filename, content);
}

console.log('\nDone! All files 04-13 generated.');
