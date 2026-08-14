/**
 * EcolPro / LEARNOS — Bot parent : questions à la demande
 * =======================================================
 *
 * LE PARTAGE DES RÔLES, QUI EST TOUT LE SUJET
 * -------------------------------------------
 * Le modèle **ne produit jamais de contenu**. Sa seule tâche est de ramener
 * une question libre à une **intention prise dans un ensemble fermé** — un
 * mot parmi sept. Les chiffres, les prénoms, les dates viennent tous de
 * requêtes SQL, et la phrase finale d'un gabarit traduit.
 *
 * Ce n'est pas de la prudence excessive. Un modèle à qui l'on demande de
 * rédiger « la réponse au parent » finira par écrire « Amina a 12 de moyenne »
 * là où la base dit 11,4 — et l'établissement devra défendre un chiffre qu'il
 * n'a pas produit. En bornant la sortie du modèle à une étiquette, l'erreur
 * maximale devient « on a mal compris la question », ce qui se rattrape.
 *
 * Et l'appel au modèle n'a lieu que si les mots-clés échouent : la majorité
 * des questions parentales sont courtes et stéréotypées.
 *
 * ISOLATION
 * ---------
 * L'identification se fait par **numéro de téléphone**, sans session : c'est
 * le numéro qui détermine le tenant. Un numéro inconnu ne reçoit aucune
 * réponse — jamais de message d'erreur détaillé, qui confirmerait l'existence
 * d'un établissement ou d'un élève.
 */

import prisma from "@/lib/prisma";
import { routeAi } from "@/lib/ai/router";
import { AiAllProvidersFailedError } from "@/lib/ai/provider";
import { dossierEleve, type DossierEleve } from "@/lib/learnos/dossier-eleve";
import type { SessionSiteClaims } from "@/lib/site-scope";

/** Ensemble fermé des intentions. Le modèle ne peut rien produire d'autre. */
export const INTENTIONS = [
  "progression",
  "difficultes",
  "aider",
  "assiduite",
  "solde",
  "plan",
  "aide",
] as const;

export type Intention = (typeof INTENTIONS)[number] | "inconnue";

/**
 * Mots-clés par intention, en français, somali et arabe — les trois langues
 * réellement écrites par les familles à Djibouti. L'accentuation et la casse
 * sont normalisées avant comparaison : personne n'écrit « élève » avec
 * l'accent sur un clavier de téléphone.
 */
const MOTS_CLES: Record<(typeof INTENTIONS)[number], string[]> = {
  progression: [
    "progres", "progresse", "avance", "niveau", "resultat",
    "resultats", "note", "notes", "moyenne", "bulletin",
    // Formulations du menu : elles DOIVENT retomber sur l'intention promise,
    // sans quoi le bot contredit ses propres instructions.
    "ca se passe", "comment va", "comment ca va", "il va bien", "elle va bien",
    "horumar", "natiijo", "heer", "sidee tahay",
    "تقدم", "نتيجة", "مستوى",
  ],
  difficultes: [
    "difficulte", "difficultes", "probleme", "bloque", "faible", "echec",
    "rate", "mauvais", "pas bien",
    "dhib", "adag", "liita",
    "صعوبة", "مشكلة", "ضعيف",
  ],
  // « comment » seul est délibérément absent : il ouvre aussi bien « comment
  // ça se passe » que « comment l'aider », et le capturer ici détournerait la
  // première question vers la mauvaise réponse.
  aider: [
    "aider", "quoi faire", "que faire", "reviser", "travailler",
    "maison", "exercice", "devoir", "devoirs",
    "caawi", "caawin", "sameeyo", "guriga",
    "مساعدة", "أساعد", "مراجعة",
  ],
  assiduite: [
    "absence", "absences", "absent", "retard", "presence", "manque",
    "maqan", "daahitaan",
    "غياب", "تأخر",
  ],
  solde: [
    "solde", "facture", "paiement", "payer", "scolarite", "frais", "argent",
    "reste", "impaye",
    "lacag", "bixin", "kharash",
    "رسوم", "دفع", "فاتورة",
  ],
  plan: [
    "plan", "parcours", "etape", "programme", "suivi", "accompagnement",
    "qorshe", "tallaabo",
    "خطة", "برنامج",
  ],
  aide: [
    "aide moi", "menu", "options", "que peux tu", "bonjour", "salut", "salam",
    "asc", "iska warran",
    "مرحبا", "السلام",
  ],
};

/** Retire accents, ponctuation et casse : la comparaison porte sur le fond. */
export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Détection par mots-clés. `null` signifie « je ne sais pas » — surtout pas
 * une intention par défaut : répondre à côté est pire que de demander à
 * reformuler.
 *
 * Quand plusieurs intentions matchent, celle dont le mot-clé est le plus long
 * l'emporte : « comment l'aider » doit gagner sur « comment », qui n'est
 * qu'un fragment.
 */
export function detecterIntention(texte: string): Intention | null {
  const t = normaliser(texte);
  if (!t) return null;

  let meilleure: Intention | null = null;
  let longueur = 0;

  for (const intention of INTENTIONS) {
    for (const mot of MOTS_CLES[intention]) {
      const cle = normaliser(mot);
      if (t.includes(cle) && cle.length > longueur) {
        meilleure = intention;
        longueur = cle.length;
      }
    }
  }
  return meilleure;
}

/**
 * Classement par le modèle, en dernier recours.
 *
 * La sortie attendue est **un mot**, validé contre l'ensemble fermé. Toute
 * autre production — une phrase, un chiffre, une explication — est rejetée et
 * traitée comme « inconnue ». C'est cette validation, et non le prompt, qui
 * garantit qu'aucun texte du modèle n'atteint la famille.
 */
export async function classerAvecModele(
  texte: string,
  tenantId: string,
  siteId?: string | null
): Promise<{ intention: Intention; modele: string | null }> {
  try {
    const resultat = await routeAi(
      {
        complexity: "simple",
        promptVersion: "bot-parent-intent-v1",
        action: "bot.parent.intent",
        tenantId,
        siteId,
      },
      [
        {
          role: "system",
          content:
            "Tu classes la question d'un parent d'élève. Réponds par UN SEUL mot " +
            `parmi : ${INTENTIONS.join(", ")}, inconnue. ` +
            "Aucune phrase, aucune explication, aucun chiffre.",
        },
        { role: "user", content: texte.slice(0, 500) },
      ],
      { temperature: 0, maxTokens: 8 }
    );

    // `content` peut être nul quand le fournisseur n'a produit que des appels
    // d'outil — cas impossible ici, mais un `null` non traité planterait le
    // webhook, donc l'établissement, pour une question de parent.
    const mot = normaliser(resultat.content ?? "").split(" ")[0];
    const valide = (INTENTIONS as readonly string[]).includes(mot);
    return {
      intention: valide ? (mot as Intention) : "inconnue",
      modele: resultat.meta.modelName,
    };
  } catch (error) {
    // Aucun fournisseur disponible : le bot doit continuer à fonctionner en
    // mode mots-clés. Un service IA en panne ne rend pas l'établissement muet.
    if (!(error instanceof AiAllProvidersFailedError)) {
      console.error("[bot-parent] classement par modèle échoué", error);
    }
    return { intention: "inconnue", modele: null };
  }
}

export interface ParentIdentifie {
  id: string;
  tenantId: string;
  prenom: string;
  nom: string;
  langue: string | null;
  enfants: { id: string; prenom: string; nom: string; siteId: string | null }[];
}

/**
 * Retrouve un parent par son numéro.
 *
 * Recherche nécessairement inter-tenants : un webhook entrant n'a ni session
 * ni tenant connu. Un numéro rattaché à deux établissements est une situation
 * ambiguë que l'on tranche par le premier trouvé — et que l'on signale.
 */
export async function identifierParent(
  telephone: string
): Promise<ParentIdentifie | null> {
  const brut = telephone.replace(/[\s\-().]/g, "");
  const sans = brut.startsWith("+") ? brut.slice(1) : brut;
  const variantes = [sans, `+${sans}`, `00${sans}`];

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const parent = await prisma.parent.findFirst({
    where: {
      OR: [{ phone: { in: variantes } }, { phone2: { in: variantes } }],
    },
    select: {
      id: true,
      tenantId: true,
      prenom: true,
      nom: true,
      learnosPreferences: { select: { langue: true } },
      enfants: {
        where: { eleve: { statut: "ACTIF", deletedAt: null } },
        select: {
          eleve: { select: { id: true, prenom: true, nom: true, siteId: true } },
        },
      },
    },
  });
  if (!parent) return null;

  return {
    id: parent.id,
    tenantId: parent.tenantId,
    prenom: parent.prenom,
    nom: parent.nom,
    langue: parent.learnosPreferences?.langue ?? null,
    enfants: parent.enfants.map((e) => e.eleve),
  };
}

/**
 * Désambiguïsation d'une fratrie.
 *
 * Un parent de trois enfants qui demande « comment ça va ? » doit se voir
 * demander duquel il parle. Répondre pour l'aîné par défaut produirait un
 * conseil appliqué au mauvais enfant — l'erreur la plus coûteuse du dispositif.
 */
export function choisirEnfant(
  parent: ParentIdentifie,
  question: string
): { eleve: ParentIdentifie["enfants"][number] | null; ambigu: boolean } {
  if (parent.enfants.length === 0) return { eleve: null, ambigu: false };
  if (parent.enfants.length === 1) return { eleve: parent.enfants[0], ambigu: false };

  const t = normaliser(question);
  const cites = parent.enfants.filter((e) => t.includes(normaliser(e.prenom)));

  if (cites.length === 1) return { eleve: cites[0], ambigu: false };
  return { eleve: null, ambigu: true };
}

/** Traducteur minimal — celui de next-intl convient. */
export type TraducteurBot = (
  cle: string,
  params?: Record<string, string | number>
) => string;

/**
 * Compose la réponse à partir du dossier. Aucune génération : chaque phrase
 * est un gabarit traduit, chaque valeur vient de la base.
 */
export function composerReponse(
  intention: Intention,
  dossier: DossierEleve,
  t: TraducteurBot
): string {
  const prenom = dossier.eleve.prenom;

  switch (intention) {
    case "progression": {
      const lignes = [t("progression_entete", { prenom })];
      if (dossier.acquis.length > 0) {
        lignes.push(
          t("progression_acquis", {
            n: dossier.acquis.length,
            liste: dossier.acquis.slice(0, 3).map((c) => c.libelle).join(", "),
          })
        );
      }
      if (dossier.enCours.length > 0) {
        lignes.push(
          t("progression_enCours", {
            liste: dossier.enCours.slice(0, 3).map((c) => c.libelle).join(", "),
          })
        );
      }
      lignes.push(t(`progression_tendance_${dossier.tendance}`, { prenom }));
      return lignes.join("\n");
    }

    case "difficultes": {
      if (dossier.aReprendre.length === 0) {
        return t("difficultes_aucune", { prenom });
      }
      const bloquantes = dossier.aReprendre.filter((c) => c.bloquante);
      const lignes = [
        t("difficultes_entete", {
          prenom,
          liste: dossier.aReprendre.slice(0, 3).map((c) => c.libelle).join(", "),
        }),
      ];
      if (bloquantes.length > 0) {
        lignes.push(t("difficultes_bloquante", { libelle: bloquantes[0].libelle }));
      }
      return lignes.join("\n");
    }

    case "aider": {
      if (!dossier.prochaineAction) return t("aider_rien", { prenom });
      const a = dossier.prochaineAction;
      const lignes = [
        t("aider_entete", { prenom, competence: a.competence, action: a.action }),
      ];
      if (a.echeance) {
        lignes.push(
          t("aider_echeance", { date: a.echeance.toISOString().slice(0, 10) })
        );
      }
      return lignes.join("\n");
    }

    case "assiduite":
      return t("assiduite", {
        prenom,
        n: dossier.assiduite.absencesInjustifiees,
        jours: dossier.assiduite.fenetreJours,
      });

    case "solde":
      if (!dossier.finance || dossier.finance.facturesEnRetard === 0) {
        return t("solde_ajour");
      }
      return t("solde_du", {
        montant: dossier.finance.montantDu,
        n: dossier.finance.facturesEnRetard,
      });

    case "plan": {
      if (dossier.plans.length === 0) return t("plan_aucun", { prenom });
      const plan = dossier.plans[0];
      const lignes = [
        t("plan_entete", { prenom, matiere: plan.matiere ?? "—" }),
      ];
      plan.etapes.slice(0, 3).forEach((e, i) => {
        lignes.push(t("plan_etape", { i: i + 1, competence: e.competence, action: e.action }));
      });
      if (plan.dateRevue) {
        lignes.push(
          t("plan_revue", { date: plan.dateRevue.toISOString().slice(0, 10) })
        );
      }
      return lignes.join("\n");
    }

    case "aide":
    case "inconnue":
    default:
      return t("menu");
  }
}

/**
 * Périmètre de lecture du bot pour un enfant donné.
 *
 * POURQUOI PAS `role: "PARENT"`
 * Le périmètre relationnel se résout par `userId` — or beaucoup de parents
 * n'ont aucun compte applicatif : ils écrivent depuis leur téléphone, un
 * point c'est tout. Passer `PARENT` sans identité déclencherait le
 * fail-closed et le bot ne répondrait jamais.
 *
 * L'autorisation a déjà eu lieu en amont : l'enfant vient de `EleveParent`
 * pour le numéro qui écrit. Ce qui reste à borner est le **site**, et c'est
 * celui de l'enfant. Un tenant mono-site (`siteId` nul) déclare
 * `tenantHasSites: false`, sans quoi la liste vide serait lue comme
 * « aucun accès ».
 */
export function claimsPourEnfant(eleve: { siteId: string | null }): SessionSiteClaims {
  return eleve.siteId
    ? { role: "BOT_PARENT", siteIds: [eleve.siteId], tenantHasSites: true }
    : { role: "BOT_PARENT", siteIds: [], tenantHasSites: false };
}

export interface ReponseBot {
  intention: Intention;
  texte: string;
  eleveId: string | null;
  modele: string | null;
}

/**
 * Traite une question entrante de bout en bout.
 *
 * Renvoie `null` pour un parent sans enfant actif : mieux vaut ne rien dire
 * que d'expliquer pourquoi, ce qui renseignerait un tiers sur le contenu de
 * la base.
 */
export async function traiterQuestion(
  parent: ParentIdentifie,
  question: string,
  t: TraducteurBot
): Promise<ReponseBot | null> {
  const { eleve, ambigu } = choisirEnfant(parent, question);

  if (ambigu) {
    return {
      intention: "aide",
      texte: t("ambigu", {
        enfants: parent.enfants.map((e) => e.prenom).join(", "),
      }),
      eleveId: null,
      modele: null,
    };
  }
  if (!eleve) return null;

  let intention = detecterIntention(question);
  let modele: string | null = null;

  if (!intention) {
    const classement = await classerAvecModele(question, parent.tenantId, eleve.siteId);
    intention = classement.intention;
    modele = classement.modele;
  }

  const dossier = await dossierEleve(parent.tenantId, eleve.id, claimsPourEnfant(eleve), {
    pourResponsable: "parent",
    avecFinance: intention === "solde",
  });
  if (!dossier) return null;

  return {
    intention,
    texte: composerReponse(intention, dossier, t),
    eleveId: eleve.id,
    modele,
  };
}
