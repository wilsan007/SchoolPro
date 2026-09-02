/**
 * EcolPro / LEARNOS — Alertes proactives vers les familles
 * ========================================================
 *
 * LE RISQUE PRINCIPAL N'EST PAS DE MANQUER UNE ALERTE
 * ---------------------------------------------------
 * C'est d'en envoyer trop. Une famille qui reçoit quatre messages par semaine
 * coupe les notifications — et l'établissement perd le canal au moment précis
 * où il en aurait besoin. Trois garde-fous, dans cet ordre :
 *
 *   1. **Idempotence** — `empreinte` unique par déclencheur. Le cron passe
 *      plusieurs fois ; la même absence ne produit qu'un message, jamais un
 *      par passage.
 *   2. **Consentement et seuil** — le parent choisit s'il reçoit, et à partir
 *      de quelle gravité.
 *   3. **Plafond hebdomadaire** — même si tout est légitime, on s'arrête.
 *
 * Une alerte écartée n'est pas supprimée : elle est marquée `SUPPRIMEE` avec
 * son motif. C'est ce qui permet de répondre à « pourquoi ne m'a-t-on pas
 * prévenu ? » — question à laquelle un enregistrement effacé ne répond pas.
 *
 * DÉTECTION ENTIÈREMENT DÉTERMINISTE — AUCUN APPEL DE MODÈLE.
 */

import { createHash } from "node:crypto";
import type { NiveauAlerteParent } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { traducteurPour } from "@/lib/learnos/traducteur";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/** Absences injustifiées, sur la fenêtre ci-dessous, déclenchant `ATTENTION`. */
const ABSENCES_POUR_ALERTE = 3;
const FENETRE_ABSENCES_JOURS = 7;

/** Un parcours dont la revue est dépassée de tant de jours passe en `URGENT`. */
const JOURS_RETARD_PARCOURS = 21;

/** Ordre de gravité, pour comparer au seuil choisi par la famille. */
const GRAVITE: Record<NiveauAlerteParent, number> = {
  INFO: 0,
  ATTENTION: 1,
  URGENT: 2,
};

interface AlerteDetectee {
  tenantId: string;
  siteId: string | null;
  eleveId: string;
  parentId: string;
  niveau: NiveauAlerteParent;
  cle: string;
  params: Record<string, string | number>;
  /** Ce qui rend l'alerte unique — sert de clé d'idempotence. */
  signature: string;
}

/** Empreinte stable : deux détections du même fait produisent la même valeur. */
export function empreinteDe(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 32);
}

/**
 * Balaie un tenant et met en file les alertes détectées.
 *
 * Tâche système : elle traverse volontairement tous les sites, puisqu'elle
 * n'agit pour le compte d'aucun utilisateur.
 */
export async function detecterAlertes(
  tenantId: string,
  maintenant: Date = new Date(),
  anneeCourante?: string | null
): Promise<{ detectees: number; nouvelles: number }> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const detectees = [
    ...(await absencesRepetees(tenantId, maintenant, annee)),
    ...(await parcoursAlArret(tenantId, maintenant)),
    ...(await jalonsAtteints(tenantId, maintenant)),
  ];

  let nouvelles = 0;
  for (const a of detectees) {
    const empreinte = empreinteDe(a.signature);
    // `createMany` + `skipDuplicates` plutôt qu'un `findFirst` préalable :
    // c'est la contrainte d'unicité qui arbitre, sans course possible entre
    // deux passages du cron.
    const { count } = await prisma.alerteParent.createMany({
      data: [
        {
          tenantId: a.tenantId,
          siteId: a.siteId,
          eleveId: a.eleveId,
          parentId: a.parentId,
          niveau: a.niveau,
          cle: a.cle,
          params: a.params,
          empreinte,
        },
      ],
      skipDuplicates: true,
    });
    nouvelles += count;
  }

  return { detectees: detectees.length, nouvelles };
}

/** Absences injustifiées répétées sur une semaine. */
async function absencesRepetees(
  tenantId: string,
  maintenant: Date,
  anneeCourante?: string | null
): Promise<AlerteDetectee[]> {
  const annee = anneeCourante ?? await getAnneeCouranteLibelle(tenantId);
  const depuis = new Date(maintenant.getTime() - FENETRE_ABSENCES_JOURS * 86_400_000);

  // eslint-disable-next-line ecolpro/require-site-filter
  const groupes = await prisma.absence.groupBy({
    by: ["eleveId"],
    where: {
      tenantId, statut: "INJUSTIFIEE", date: { gte: depuis },
      ...(annee ? { eleve: { classe: { annee: annee } } } : {}),
    },
    _count: { eleveId: true },
    having: { eleveId: { _count: { gte: ABSENCES_POUR_ALERTE } } },
  });
  if (groupes.length === 0) return [];

  const parEleve = new Map(groupes.map((g) => [g.eleveId, g._count.eleveId]));
  const cibles = await gardiensDe(tenantId, [...parEleve.keys()]);

  // La semaine ISO entre dans la signature : trois absences cette semaine et
  // trois la suivante sont deux faits distincts, qui méritent deux messages.
  const semaine = cleSemaine(maintenant);

  return cibles.map((c) => ({
    tenantId,
    siteId: c.siteId,
    eleveId: c.eleveId,
    parentId: c.parentId,
    niveau: "ATTENTION" as NiveauAlerteParent,
    cle: "absences",
    params: { prenom: c.prenom, n: parEleve.get(c.eleveId) ?? 0, jours: FENETRE_ABSENCES_JOURS },
    signature: `absences|${c.eleveId}|${c.parentId}|${semaine}`,
  }));
}

/** Parcours actif dont la date de revue est dépassée depuis trop longtemps. */
async function parcoursAlArret(
  tenantId: string,
  maintenant: Date
): Promise<AlerteDetectee[]> {
  const limite = new Date(maintenant.getTime() - JOURS_RETARD_PARCOURS * 86_400_000);

  // eslint-disable-next-line ecolpro/require-site-filter
  const plans = await prisma.planProgression.findMany({
    where: {
      tenantId,
      statut: { in: ["ACTIF", "EN_REVUE"] },
      dateRevue: { lt: limite },
    },
    select: {
      id: true,
      eleveId: true,
      siteId: true,
      dateRevue: true,
      matiere: { select: { nom: true } },
    },
  });
  if (plans.length === 0) return [];

  const cibles = await gardiensDe(tenantId, plans.map((p) => p.eleveId));
  const parEleve = new Map(plans.map((p) => [p.eleveId, p]));

  return cibles.flatMap((c) => {
    const plan = parEleve.get(c.eleveId);
    if (!plan) return [];
    return [
      {
        tenantId,
        siteId: plan.siteId,
        eleveId: c.eleveId,
        parentId: c.parentId,
        niveau: "URGENT" as NiveauAlerteParent,
        cle: "parcoursArret",
        params: { prenom: c.prenom, matiere: plan.matiere?.nom ?? "—" },
        // L'identifiant du plan suffit : un même parcours ne réalerte pas.
        signature: `parcoursArret|${plan.id}|${c.parentId}`,
      },
    ];
  });
}

/** Étape de parcours validée depuis le dernier passage — la bonne nouvelle. */
async function jalonsAtteints(
  tenantId: string,
  maintenant: Date
): Promise<AlerteDetectee[]> {
  // Fenêtre volontairement large (une semaine) : mieux vaut annoncer un
  // progrès avec deux jours de retard que de le manquer si le cron a sauté.
  const depuis = new Date(maintenant.getTime() - 7 * 86_400_000);

  // Détection exécutée par le cron d'alertes : aucune session, et par
  // construction tous les sites du tenant doivent être balayés — un parent d'un
  // site donné ne recevrait rien si la détection était bornée au périmètre d'un
  // appelant qui n'existe pas. L'isolation est faite à l'ENVOI, où chaque alerte
  // est adressée au parent rattaché à l'élève (`plan.siteId` est conservé pour
  // horodater l'alerte sur le bon site).
  // eslint-disable-next-line ecolpro/require-site-filter -- cron d'alertes, balayage tenant volontaire, cf. ci-dessus
  const etapes = await prisma.etapePlan.findMany({
    where: {
      valideeLe: { gte: depuis },
      plan: { tenantId, statut: { in: ["ACTIF", "EN_REVUE", "TERMINE"] } },
    },
    select: {
      id: true,
      competence: { select: { libelle: true } },
      plan: { select: { eleveId: true, siteId: true } },
    },
  });
  if (etapes.length === 0) return [];

  const cibles = await gardiensDe(tenantId, etapes.map((e) => e.plan.eleveId));
  const parEleve = new Map<string, (typeof etapes)[number]>();
  for (const e of etapes) parEleve.set(e.plan.eleveId, e);

  return cibles.flatMap((c) => {
    const etape = parEleve.get(c.eleveId);
    if (!etape) return [];
    return [
      {
        tenantId,
        siteId: etape.plan.siteId,
        eleveId: c.eleveId,
        parentId: c.parentId,
        niveau: "INFO" as NiveauAlerteParent,
        cle: "jalonAtteint",
        params: { prenom: c.prenom, competence: etape.competence.libelle },
        signature: `jalon|${etape.id}|${c.parentId}`,
      },
    ];
  });
}

/**
 * Parents à prévenir pour ces élèves.
 *
 * Le tuteur légal principal (`isGardien`) est privilégié quand il existe :
 * envoyer le même message aux deux parents double le volume et, dans les
 * familles séparées, transforme une information scolaire en sujet de conflit.
 */
async function gardiensDe(
  tenantId: string,
  eleveIds: string[]
): Promise<{ eleveId: string; parentId: string; prenom: string; siteId: string | null }[]> {
  if (eleveIds.length === 0) return [];

  // Tâche système, sans session : il n'y a pas de site « courant » à opposer.
  // Le périmètre est posé autrement — les élèves viennent de requêtes déjà
  // bornées au tenant, et les deux relations le revérifient ci-dessous.
  // eslint-disable-next-line ecolpro/require-site-filter
  const liens = await prisma.eleveParent.findMany({
    where: {
      eleveId: { in: [...new Set(eleveIds)] },
      parent: { tenantId },
      eleve: { tenantId, statut: "ACTIF", deletedAt: null },
    },
    select: {
      eleveId: true,
      parentId: true,
      isGardien: true,
      eleve: { select: { prenom: true, siteId: true } },
    },
  });

  const parEleve = new Map<string, (typeof liens)[number][]>();
  for (const l of liens) {
    if (!parEleve.has(l.eleveId)) parEleve.set(l.eleveId, []);
    parEleve.get(l.eleveId)!.push(l);
  }

  const retenus: { eleveId: string; parentId: string; prenom: string; siteId: string | null }[] = [];
  for (const [eleveId, candidats] of parEleve) {
    const gardien = candidats.find((c) => c.isGardien) ?? candidats[0];
    if (!gardien) continue;
    retenus.push({
      eleveId,
      parentId: gardien.parentId,
      prenom: gardien.eleve.prenom,
      siteId: gardien.eleve.siteId,
    });
  }
  return retenus;
}

/** Clé « année-semaine ISO », pour distinguer deux semaines consécutives. */
export function cleSemaine(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Jeudi de la semaine courante : définition ISO 8601 de la semaine.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${semaine}`;
}

export interface DecisionEnvoi {
  envoyer: boolean;
  motif?: "desinscrit" | "sousLeSeuil" | "plafondAtteint";
}

/**
 * Faut-il envoyer cette alerte ? Fonction pure — c'est elle qui porte la
 * politique, et c'est elle qu'on teste.
 */
export function deciderEnvoi(
  niveau: NiveauAlerteParent,
  preferences: {
    alertesActives: boolean;
    niveauMinimal: NiveauAlerteParent;
    plafondHebdomadaire: number;
  },
  envoyeesCetteSemaine: number
): DecisionEnvoi {
  if (!preferences.alertesActives) return { envoyer: false, motif: "desinscrit" };
  if (GRAVITE[niveau] < GRAVITE[preferences.niveauMinimal]) {
    return { envoyer: false, motif: "sousLeSeuil" };
  }
  if (envoyeesCetteSemaine >= preferences.plafondHebdomadaire) {
    return { envoyer: false, motif: "plafondAtteint" };
  }
  return { envoyer: true };
}

/** Préférences par défaut d'une famille qui n'en a jamais réglé. */
export const PREFERENCES_PAR_DEFAUT = {
  alertesActives: true,
  niveauMinimal: "INFO" as NiveauAlerteParent,
  plafondHebdomadaire: 3,
  langue: null as string | null,
};

/**
 * Vide la file d'attente : envoie ce qui doit l'être, marque le reste.
 */
export async function envoyerAlertesEnAttente(
  limite = 100,
  maintenant: Date = new Date()
): Promise<{ envoyees: number; supprimees: number; echouees: number }> {
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
  const enAttente = await prisma.alerteParent.findMany({
    where: { statut: "EN_ATTENTE" },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: {
      id: true,
      niveau: true,
      cle: true,
      params: true,
      parentId: true,
      parent: {
        select: {
          phone: true,
          learnosPreferences: {
            select: {
              alertesActives: true,
              niveauMinimal: true,
              plafondHebdomadaire: true,
              langue: true,
            },
          },
        },
      },
    },
  });

  let envoyees = 0;
  let supprimees = 0;
  let echouees = 0;
  const debutSemaine = new Date(maintenant.getTime() - 7 * 86_400_000);

  for (const alerte of enAttente) {
    const prefs = alerte.parent.learnosPreferences ?? PREFERENCES_PAR_DEFAUT;

    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
    const dejaEnvoyees = await prisma.alerteParent.count({
      where: {
        parentId: alerte.parentId,
        statut: "ENVOYEE",
        envoyeeLe: { gte: debutSemaine },
      },
    });

    const decision = deciderEnvoi(alerte.niveau, prefs, dejaEnvoyees);
    if (!decision.envoyer) {
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
      await prisma.alerteParent.update({
        where: { id: alerte.id },
        data: { statut: "SUPPRIMEE", motifSuppression: decision.motif },
      });
      supprimees++;
      continue;
    }

    // La langue est celle de la FAMILLE destinataire, pas celle d'un cookie :
    // le cron n'a pas d'appelant humain.
    const t = await traducteurPour(prefs.langue, "learnos.alertes");
    const params = (alerte.params ?? {}) as Record<string, string | number>;
    const texte = t(alerte.cle, params);

    const resultat = await sendWhatsAppMessage(alerte.parent.phone, texte);

    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
    await prisma.alerteParent.update({
      where: { id: alerte.id },
      data: resultat.success
        ? { statut: "ENVOYEE", envoyeeLe: new Date(), erreur: null }
        : { statut: "ECHOUEE", erreur: resultat.error ?? "envoi refusé" },
    });

    if (resultat.success) envoyees++;
    else echouees++;
  }

  return { envoyees, supprimees, echouees };
}
