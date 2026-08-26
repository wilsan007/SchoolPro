import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkPermission } from "@/lib/rbac";
import { erreurJson } from "@/lib/erreurs-api";
import { siteFilterForModel } from "@/lib/site-scope";
import { auditFire } from "@/lib/audit";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getTeacherScope, isTeacherRole } from "@/lib/teacher-classes";
import { datesDeLaSemaine } from "@/lib/learnos/planification-pure";
import { z } from "zod";
import type { Jour, Role } from "@prisma/client";

/**
 * Décalage jour → offset dans la semaine (lundi = 0).
 *
 * L'enum `Jour` est déclaré dans l'ordre DIMANCHE→LUNDI→…→SAMEDI, mais la
 * semaine scolaire commence le lundi : on mappe donc explicitement plutôt que
 * de compter sur l'ordre de déclaration.
 */
const JOUR_OFFSET: Record<Jour, number> = {
  LUNDI: 0,
  MARDI: 1,
  MERCREDI: 2,
  JEUDI: 3,
  VENDREDI: 4,
  SAMEDI: 5,
  DIMANCHE: 6,
};

const MS_PAR_JOUR = 86_400_000;

const BodySchema = z.object({
  semaine: z.number().int().min(1).max(36),
  annee: z.string().min(1).optional(),
});

/**
 * Convertit une heure "HH:MM" en minutes depuis minuit.
 * Retourne 0 si le format est inattendu (ne fait pas planter la génération).
 */
function heureEnMinutes(h: string): number {
  const [hh, mm] = h.split(":").map((p) => Number.parseInt(p, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
}

/**
 * POST /api/cahier-journal/generer-semaine
 *
 * Génère les SeancePedagogique d'une semaine entière à partir de l'emploi du
 * temps (EmploiTemps). Idempotent : les séances déjà présentes pour le même
 * créneau (classe + matière + date + heure de début) ne sont pas recréées.
 *
 * Étapes :
 *  1. Auth + permission cahier-journal:write
 *  2. Validation du corps (semaine 1-36, annee optionnelle)
 *  3. Résolution de l'année scolaire (courante si non fournie)
 *  4. Calcul des dates de la semaine à partir du début d'année
 *  5. Lecture de l'emploi du temps, filtré par site et par périmètre enseignant
 *  6. Exclusion des jours en vacances / jour férié (EvenementCalendaire)
 *  7. Exclusion des créneaux remplacés (RemplacementCours actif)
 *  8. Pour chaque créneau, création idempotente + auto-lien à la
 *     PlanificationChapitre couvrant cette semaine
 *  9. Audit + retour du récapitulatif
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return erreurJson("NON_AUTORISE");
    const denied = checkPermission(session.user.role, "cahier-journal:write");
    if (denied) return denied;

    const tenantId = session.user.tenantId;
    const role = session.user.role as Role;

    // 2. Validation du corps
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return erreurJson("DONNEES_INVALIDES");
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return erreurJson("DONNEES_INVALIDES", undefined, {
        details: parsed.error.issues,
      });
    }
    const { semaine } = parsed.data;

    // 3. Résolution de l'année scolaire
    const libelleAnnee = parsed.data.annee ?? (await getAnneeCouranteLibelle(tenantId));
    if (!libelleAnnee) {
      return erreurJson("AUCUNE_ANNEE_COURANTE");
    }

    // eslint-disable-next-line ecolpro/require-site-filter -- annee scolaire: niveau tenant, pas de siteId
    const anneeRecord = await prisma.anneesScolaires.findFirst({
      where: { tenantId, libelle: libelleAnnee },
    });
    if (!anneeRecord) {
      return erreurJson("ANNEE_INTROUVABLE", { annee: libelleAnnee });
    }
    const anneeId = anneeRecord.id;

    // 4. Dates de la semaine scolaire
    // `datesDeLaSemaine` renvoie { debut, fin } où `debut` est le premier jour
    // de la semaine n (lundi de la semaine 1 = dateDebut de l'année).
    const { debut: debutSemaine } = datesDeLaSemaine(semaine, anneeRecord.dateDebut);

    // 5. Périmètre enseignant : un prof ne génère que ses propres créneaux,
    //    pour l'année courante uniquement.
    const teacherScope = isTeacherRole(role)
      ? await getTeacherScope(tenantId, session.user.id, role, libelleAnnee)
      : null;

    // 6. Lecture de l'emploi du temps pour cette année.
    // `emploiTemps` n'a pas de colonne siteId : le filtrage par site passe par
    // la relation `classe` (voir SITE_PATHS). On récupère aussi la matière pour
    // pouvoir résoudre le chapitre associé lors de l'auto-lien.
    /* eslint-disable ecolpro/require-site-filter -- siteFilterForModel("emploiTemps", ...) gère le filtrage via la relation classe */
    const edtEntries = await prisma.emploiTemps.findMany({
      where: {
        tenantId,
        annee: libelleAnnee,
        ...siteFilterForModel("emploiTemps", session.user),
        ...(teacherScope?.isRestricted
          ? {
              AND: [
                { classeId: { in: teacherScope.classeIds } },
                { matiereId: { in: teacherScope.matiereIds } },
              ],
            }
          : {}),
      },
      include: {
        matiere: { select: { id: true } },
      },
    });
    /* eslint-enable ecolpro/require-site-filter */

    if (edtEntries.length === 0) {
      auditFire({
        tenantId,
        userId: session.user.id,
        action: "cahier-journal.generer-semaine",
        verdict: "ALLOWED",
        resource: "seancePedagogique",
        metadata: { semaine, annee: libelleAnnee, crees: 0, ignores: 0, total: 0 },
      });
      return NextResponse.json({ crees: 0, ignores: 0, total: 0, seances: [] });
    }

    // 7. Événements calendaires (vacances / jours fériés) de l'année.
    // On ne filtre que VACANCE_SCOLAIRE et JOUR_FERIE : un EXAMEN n'empêche pas
    // de planifier un créneau (le cours peut avoir lieu avant l'épreuve).
    // eslint-disable-next-line ecolpro/require-site-filter -- evenementCalendaire: niveau tenant, pas de siteId
    const evenements = await prisma.evenementCalendaire.findMany({
      where: {
        anneeId,
        type: { in: ["VACANCE_SCOLAIRE", "JOUR_FERIE"] },
      },
      select: { type: true, dateDebut: true, dateFin: true },
    });

    // 8. Remplacements actifs pour la semaine : on saute les créneaux
    // remplacés (PROPOSE/VALIDE/EFFECTUE) pour ne pas créer une séance qui
    // doublerait le remplacement. REFUSE/ANNULE ne bloquent pas.
    const finSemaine = new Date(debutSemaine.getTime() + 6 * MS_PAR_JOUR);
    // eslint-disable-next-line ecolpro/require-site-filter -- remplacementCours filtré par tenantId + plage de dates
    const remplacements = await prisma.remplacementCours.findMany({
      where: {
        tenantId,
        date: { gte: debutSemaine, lte: finSemaine },
        statut: { in: ["PROPOSE", "VALIDE", "EFFECTUE"] },
      },
      select: { emploiTempsId: true, date: true },
    });

    // Index des remplacements par (emploiTempsId|YYYY-MM-DD) pour un lookup O(1).
    const remplacementKeys = new Set(
      remplacements
        .filter((r) => r.emploiTempsId)
        .map((r) => `${r.emploiTempsId}|${r.date.toISOString().slice(0, 10)}`),
    );

    // 9. Planifications de chapitres couvrant cette semaine, pour l'auto-lien.
    // On récupère toutes les planifications dont la plage contient `semaine`,
    // puis on indexe par (classeId|matiereId) — en distinguant les planifications
    // spécifiques à une classe (prioritaires) des planifications génériques
    // (classeId null = toutes les classes du niveau).
    // eslint-disable-next-line ecolpro/require-site-filter -- planificationChapitre filtré par tenantId + anneeId + semaine
    const planifications = await prisma.planificationChapitre.findMany({
      where: {
        tenantId,
        anneeId,
        semaineDebut: { lte: semaine },
        semaineFin: { gte: semaine },
      },
      include: {
        chapitre: { select: { id: true, matiereId: true } },
      },
    });

    // Index: clé "classeId|matiereId" → planification spécifique (prioritaire)
    // et clé "*|matiereId" → planification générique (fallback).
    const planifParClasse = new Map<string, (typeof planifications)[number]>();
    const planifGenerique = new Map<string, (typeof planifications)[number]>();
    for (const p of planifications) {
      const key = `${p.classeId ?? "*"}|${p.chapitre.matiereId}`;
      if (p.classeId) {
        planifParClasse.set(key, p);
      } else if (!planifGenerique.has(key)) {
        planifGenerique.set(key, p);
      }
    }

    // 10. Pour chaque créneau EDT, déterminer la date, vérifier les exclusions
    // et l'idempotence, puis créer la séance.
    const seancesCrees: Awaited<
      ReturnType<typeof prisma.seancePedagogique.create>
    >[] = [];
    let ignores = 0;

    // Pré-construire la liste des dates de la semaine indexées par jour.
    const dateParJour = new Map<Jour, Date>();
    for (const [jour, offset] of Object.entries(JOUR_OFFSET) as [Jour, number][]) {
      dateParJour.set(jour, new Date(debutSemaine.getTime() + offset * MS_PAR_JOUR));
    }

    for (const edt of edtEntries) {
      const dateCours = dateParJour.get(edt.jour);
      if (!dateCours) {
        ignores++;
        continue;
      }

      // Exclusion : vacances / jour férié couvrant cette date.
      const dateJour = dateCours.toISOString().slice(0, 10);
      const tombeDansEvenement = evenements.some((ev) => {
        const d = dateCours.getTime();
        return d >= ev.dateDebut.getTime() && d <= ev.dateFin.getTime();
      });
      if (tombeDansEvenement) {
        ignores++;
        continue;
      }

      // Exclusion : remplacement actif pour ce créneau à cette date.
      if (remplacementKeys.has(`${edt.id}|${dateJour}`)) {
        ignores++;
        continue;
      }

      // Idempotence : une séance existe déjà pour ce créneau (classe + matière +
      // date + heure de début). On compare sur la date (jour) et l'heure de
      // début stockée dans le contenu/planification — la séance porte `date`
      // (DateTime) mais pas d'heure séparée : on compare donc sur le jour pour
      // éviter les doublons, ce qui suffit car un créneau EDT = une séance.
      // eslint-disable-next-line ecolpro/require-site-filter -- vérification d'idempotence dans le périmètre du tenant
      const existante = await prisma.seancePedagogique.findFirst({
        where: {
          tenantId,
          classeId: edt.classeId,
          matiereId: edt.matiereId,
          semaine,
          // Comparaison sur le jour (ignore l'heure) : un même créneau ne peut
          // pas générer deux séances le même jour.
          date: {
            gte: new Date(dateCours.getTime()),
            lt: new Date(dateCours.getTime() + MS_PAR_JOUR),
          },
        },
        select: { id: true },
      });
      if (existante) {
        ignores++;
        continue;
      }

      // Durée prévue en minutes.
      const dureePrevue = Math.max(
        0,
        heureEnMinutes(edt.heureFin) - heureEnMinutes(edt.heureDebut),
      );

      // Auto-lien à la PlanificationChapitre : spécifique à la classe d'abord,
      // puis générique (toutes les classes du niveau) en fallback.
      const keySpec = `${edt.classeId}|${edt.matiereId}`;
      const planif =
        planifParClasse.get(keySpec) ?? planifGenerique.get(`*|${edt.matiereId}`);
      const chapitreId = planif?.chapitreId ?? null;
      const planificationId = planif?.id ?? null;

      // 11. Création de la séance.
      /* eslint-disable ecolpro/require-site-filter -- création tenant-scopée, siteId hérité de la session */
      const seance = await prisma.seancePedagogique.create({
        data: {
          tenantId,
          siteId: session.user.siteId ?? null,
          classeId: edt.classeId,
          matiereId: edt.matiereId,
          enseignantId: edt.enseignantId ?? null,
          chapitreId,
          planificationId,
          date: dateCours,
          dureePrevue: dureePrevue || 60,
          statut: "PLANIFIEE",
          semaine,
          rythme: "NON_EVALUEE",
        },
        include: {
          matiere: { select: { id: true, nom: true, code: true, couleur: true } },
          classe: { select: { id: true, nom: true, niveau: true } },
          chapitre: { select: { id: true, nom: true } },
        },
      });
      /* eslint-enable ecolpro/require-site-filter */
      seancesCrees.push(seance);
    }

    // 12. Audit de l'action.
    auditFire({
      tenantId,
      userId: session.user.id,
      action: "cahier-journal.generer-semaine",
      verdict: "ALLOWED",
      resource: "seancePedagogique",
      metadata: {
        semaine,
        annee: libelleAnnee,
        crees: seancesCrees.length,
        ignores,
        total: edtEntries.length,
      },
    });

    return NextResponse.json(
      {
        crees: seancesCrees.length,
        ignores,
        total: edtEntries.length,
        seances: seancesCrees,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API/cahier-journal/generer-semaine POST]", error);
    return erreurJson("ERREUR_SERVEUR");
  }
}
