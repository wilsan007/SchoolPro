// ============================================================
// CŒUR PARTAGÉ — génération des factures de scolarité d'un mois
// ============================================================
//
// POURQUOI CE MODULE EXISTE
// La même génération devait tourner de deux façons : à la demande (action
// serveur, depuis Paramètres → Facturation) et automatiquement le 1er du mois
// (tâche planifiée du répartiteur cron). Dupliquer la logique aurait créé deux
// vérités pour un même montant — exactement ce qu'on cherche à éviter sur des
// données financières. Le cœur vit donc ici, sans session ni permission : ses
// appelants apportent l'autorisation, il apporte la règle.
//
// CE QU'IL GARANTIT
//   • rapprochement année de classe ↔ cycle de la grille (`choisirTarif`) ;
//   • tarif du site de l'élève, jamais celui d'un autre site ;
//   • élèves ARCHIVÉS (soft delete) et non actifs jamais facturés ;
//   • échéance au dernier jour du bon mois, en UTC (déterministe serveur) ;
//   • idempotence atomique : une violation de l'index partiel
//     `factures_unicite_mensuelle` (Prisma P2002) est comptée « déjà facturé »
//     et n'interrompt pas le lot.

import prisma from "@/lib/prisma";
import { mergeFilters, siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { choisirTarif, montantMensuel } from "@/lib/domain/tarifs";
import { estViolationUnicite } from "@/lib/cron-idempotence";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export interface ResultatGenerationMensualites {
  generated: number;
  skipped: number;
}

/**
 * Réclamations de périmètre d'une génération.
 *
 *   • une action de session passe `session.user` → le filtre de site est celui
 *     de l'utilisateur (un secrétaire de site ne facture que son site) ;
 *   • la tâche planifiée passe `PORTEE_SYSTEME` → rôle tenant-wide SANS site
 *     sélectionné, donc `siteFilterForModel` renvoie `{}` : tous les sites de
 *     l'établissement. C'est le même idiome que les autres tâches du
 *     répartiteur cron, et le choix reste VISIBLE ici plutôt que caché dans un
 *     paramètre opaque.
 */
export const PORTEE_SYSTEME: SessionSiteClaims = { role: "TENANT_ADMIN", siteId: null };

export interface OptionsGenerationMensualites {
  tenantId: string;
  /** Libellé de l'année scolaire, ex. « 2025-2026 ». */
  annee: string;
  /** Mois facturé, 1-12. */
  mois: number;
  inclureCantine?: boolean;
  inclureTransport?: boolean;
  /** Périmètre : `session.user`, ou `PORTEE_SYSTEME` (défaut). */
  portee?: SessionSiteClaims;
  /** Auteur de la facture. `null` pour une génération automatique. */
  createdById?: string | null;
}

/** « Scolarité Octobre 2025-2026 » — libellé de la facture. */
export function libelleMensualite(mois: number, annee: string): string {
  const nom = MOIS_NOMS[mois - 1] ?? `Mois ${mois}`;
  return `Scolarité ${nom} ${annee}`;
}

/** Clé de mois stockée en base : « 2026-01 ». Porte l'année CALENDAIRE. */
export function cleMois(anneeScolaire: string, mois: number): string {
  const calendaire = anneeCalendaireDuMois(mois, null, anneeScolaire);
  return `${calendaire}-${String(mois).padStart(2, "0")}`;
}

/**
 * Année calendaire d'un mois de l'année scolaire.
 *
 * POURQUOI CE N'EST PAS TRIVIAL
 * L'ancien calcul — `new Date(2025, mois, 0)` — plaçait l'échéance de JANVIER
 * au 31 janvier **2025** pour une année scolaire « 2025-2026 » : la mensualité
 * de janvier naissait avec une échéance dépassée, donc immédiatement « en
 * retard » et bonne à relancer. Le défaut est resté invisible parce que neuf
 * mois sur dix tombent dans la bonne année, et que les jeux de démonstration
 * ne facturent que octobre-décembre.
 *
 * On se fie d'abord aux vraies bornes de l'année scolaire (`dateDebut`), avec
 * un repli sur le libellé « AAAA-AAAA » si elles manquent.
 */
export function anneeCalendaireDuMois(
  mois: number,
  dateDebut: Date | null | undefined,
  libelleAnnee: string
): number {
  if (dateDebut) {
    const moisDebut = dateDebut.getUTCMonth() + 1;
    const anneeDebut = dateDebut.getUTCFullYear();
    return mois >= moisDebut ? anneeDebut : anneeDebut + 1;
  }
  const debut = parseInt(libelleAnnee.split("-")[0], 10);
  if (!Number.isFinite(debut)) {
    throw new Error(`Année scolaire illisible : « ${libelleAnnee} »`);
  }
  return mois >= 9 ? debut : debut + 1;
}

/**
 * Dernier jour du mois facturé, à minuit UTC.
 *
 * UTC et non l'heure locale : l'échéance ne doit pas dépendre du fuseau du
 * serveur (un conteneur en UTC et un poste à Paris donnaient deux jours
 * différents pour la même facture).
 */
export function echeanceDuMois(mois: number, anneeCalendaire: number): Date {
  return new Date(Date.UTC(anneeCalendaire, mois, 0));
}

/**
 * Génère les factures de scolarité d'un mois pour UN établissement.
 *
 * @returns `generated` = factures créées, `skipped` = élèves déjà facturés,
 *          sans tarif applicable, ou en conflit avec l'index d'unicité.
 */
export async function genererMensualitesPourTenant(
  options: OptionsGenerationMensualites
): Promise<ResultatGenerationMensualites> {
  const {
    tenantId,
    annee,
    mois,
    inclureCantine = false,
    inclureTransport = false,
    portee = PORTEE_SYSTEME,
    createdById = null,
  } = options;

  // Filtres de site résolus ICI, à partir des réclamations de l'appelant :
  // visibles dans le code, et vérifiables par la règle ESLint
  // `require-site-filter` (un filtre passé en paramètre opaque ne l'était pas).
  // `PORTEE_SYSTEME` (rôle tenant-wide sans site) donne `{}` : tous les sites.
  const filtreEleve = siteFilterForModel("eleve", portee);
  const filtreFacture = siteFilterForModel("facture", portee);

  // Bornes réelles de l'année scolaire : elles déterminent l'année calendaire
  // de l'échéance (voir anneeCalendaireDuMois).
  const anneeRecord = await prisma.anneesScolaires.findFirst({
    where: { tenantId, libelle: annee },
    select: { id: true, dateDebut: true },
  });

  const anneeCalendaire = anneeCalendaireDuMois(
    mois,
    anneeRecord?.dateDebut ?? null,
    annee
  );
  const libelle = libelleMensualite(mois, annee);
  const moisCle = cleMois(annee, mois);
  const echeance = echeanceDuMois(mois, anneeCalendaire);

  // `deletedAt: null` : un élève archivé ne doit plus être facturé. Le filtre
  // manquait, et la génération devient automatique — un élève supprimé en
  // cours d'année aurait continué à recevoir des factures.
  const eleves = await prisma.eleve.findMany({
    where: mergeFilters(
      { tenantId, statut: "ACTIF", deletedAt: null },
      filtreEleve
    ),
    include: { classe: { select: { niveau: true, nom: true } } },
  });

  const tarifs = await prisma.tarifNiveau.findMany({
    where: { tenantId, annee, actif: true },
  });

  let generated = 0;
  let skipped = 0;

  for (const eleve of eleves) {
    // Le niveau de la classe est une ANNÉE (« 6ème », « Terminale A ») quand la
    // grille est libellée par CYCLE (« Collège », « Lycée ») : `choisirTarif`
    // fait le rapprochement et retient le tarif du SITE de l'élève.
    const niveau = eleve.classe?.niveau ?? "Inconnu";
    const choix = choisirTarif(tarifs, eleve.siteId, niveau);
    if (!choix) {
      skipped++;
      continue;
    }

    const existing = await prisma.facture.findFirst({
      where: mergeFilters(
        { tenantId, eleveId: eleve.id, libelle, ...(anneeRecord ? { anneeId: anneeRecord.id } : {}) },
        filtreFacture
      ),
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const montant = montantMensuel(choix.tarif, {
      cantine: inclureCantine,
      transport: inclureTransport,
    });

    // Compteur de numérotation volontairement tenant-wide (voir facture.ts) :
    // « numero » ne porte aucune contrainte d'unicité en base et préserve une
    // séquence globale continue entre sites plutôt que de la fragmenter.
    // eslint-disable-next-line ecolpro/require-site-filter
    const factureCount = await prisma.facture.count({ where: { tenantId } });
    const numero = `FAC-${anneeCalendaire}-${String(factureCount + 1).padStart(5, "0")}`;

    try {
      await prisma.facture.create({
        data: {
          tenantId,
          siteId: eleve.siteId,
          eleveId: eleve.id,
          anneeId: anneeRecord?.id ?? null,
          numero,
          libelle,
          montant,
          devise: choix.tarif.devise,
          statut: "EN_ATTENTE",
          echeance,
          type: "MENSUALITE",
          mois: moisCle,
          createdById,
        },
      });
      generated++;
    } catch (e) {
      if (estViolationUnicite(e)) {
        // Index partiel `factures_unicite_mensuelle` : entre notre lecture et
        // notre écriture, un autre passage (second onglet, seconde instance,
        // ou la tâche planifiée) a facturé ce mois. C'est le comportement
        // voulu ; on compte « déjà facturé » et on poursuit le lot.
        skipped++;
        continue;
      }
      throw e;
    }
  }

  return { generated, skipped };
}

export interface ResultatCronMensualites extends ResultatGenerationMensualites {
  mois: number;
  tenants: number;
  /** Établissements sans année scolaire active : aucun tarif, donc rien à faire. */
  sansAnnee: string[];
}

/**
 * Tâche planifiée : génère les mensualités du mois pour toutes les écoles
 * actives. Appelée par le répartiteur cron, le 1er du mois.
 *
 * FUSEAU — la tâche est déclenchée à 02:00 UTC, soit 05:00 à Djibouti (UTC+3,
 * sans heure d'été). Les deux horodatages tombent donc dans le même mois
 * calendaire, ce qui rend `getUTCMonth()` correct pour le mois à facturer.
 * Un établissement situé dans un autre fuseau reste facturé selon l'horloge de
 * Djibouti : c'est le calendrier de référence du produit (cf. AGENTS.md).
 */
export async function genererMensualitesDuMois(
  now: Date = new Date()
): Promise<ResultatCronMensualites> {
  const mois = now.getUTCMonth() + 1;

  const tenants = await prisma.tenant.findMany({
    // Un établissement en essai ou suspendu n'est pas facturé automatiquement :
    // le secrétariat peut toujours lancer la génération à la main.
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let generated = 0;
  let skipped = 0;
  const sansAnnee: string[] = [];

  for (const tenant of tenants) {
    // Année active de l'établissement (Time Machine respectée).
    const annee = await getAnneeCouranteLibelle(tenant.id);
    if (!annee) {
      sansAnnee.push(tenant.name);
      continue;
    }
    const resultat = await genererMensualitesPourTenant({
      tenantId: tenant.id,
      annee,
      mois,
    });
    generated += resultat.generated;
    skipped += resultat.skipped;
  }

  return { mois, tenants: tenants.length, generated, skipped, sansAnnee };
}

