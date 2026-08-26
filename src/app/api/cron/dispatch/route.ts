import { NextRequest, NextResponse } from "next/server";
import { drainEvents } from "@/lib/learnos/event-bus";
import { passerEnRevueLesPlansEchus } from "@/lib/learnos/plan-engine";
import prisma from "@/lib/prisma";
import { kpisDirection, enregistrerSnapshot } from "@/lib/learnos/kpi";
import {
  detecterAlertes,
  envoyerAlertesEnAttente,
} from "@/lib/learnos/alertes-parent";
import { envoyerRelancesAutomatiques } from "@/lib/relances-auto";
import { detecterDevoirsEnRetard } from "@/lib/learnos/devoirs-retard-check";

/**
 * Cron unique — répartiteur des tâches planifiées.
 *
 * POURQUOI UN SEUL POINT D'ENTRÉE
 * Vercel plafonne le nombre de tâches planifiées selon le palier. Déclarer un
 * cron par traitement épuise ce quota au bout de deux ou trois fonctions, et
 * bloque tout ajout ultérieur. Un répartiteur unique lève la contrainte
 * définitivement : ajouter un traitement ne consomme plus de quota, il suffit
 * de l'inscrire dans le tableau ci-dessous.
 *
 *   GET /api/cron/dispatch          → exécute les tâches dues à cette heure
 *   GET /api/cron/dispatch?force=…  → force une tâche, hors de son créneau
 *
 * Protégé par CRON_SECRET, comme les autres tâches planifiées.
 */

interface Tache {
  nom: string;
  /** Heures UTC d'exécution. `null` = à chaque passage. */
  heures: number[] | null;
  executer: () => Promise<unknown>;
}

const TACHES: Tache[] = [
  {
    // Le drainage LEARNOS tourne à chaque passage : c'est lui qui transforme
    // les notes saisies en profils de maîtrise, et le retard se voit à l'écran.
    nom: "learnos-events",
    heures: null,
    executer: () => drainEvents(200),
  },
  {
    // Un indicateur affiché seul ne dit rien : c'est la variation qui déclenche
    // une action, et elle exige une photographie quotidienne.
    nom: "learnos-kpi",
    heures: [1],
    executer: async () => {
      // Tâche système : elle balaie délibérément tous les tenants.
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      // Périmètre tenant complet : le cron n'a pas de session, et la
      // photographie porte sur l'établissement entier.
      const claims = { role: "TENANT_ADMIN" as const };
      for (const t of tenants) {
        await enregistrerSnapshot(t.id, "DIRECTION", await kpisDirection(t.id, claims));
      }
      return { tenants: tenants.length };
    },
  },
  {
    // Sans ce passage, `dateRevue` serait un rendez-vous que personne n'honore :
    // un parcours resterait actif toute l'année sans qu'on se demande s'il sert.
    nom: "learnos-revue-plans",
    heures: [2],
    executer: async () => ({ passesEnRevue: await passerEnRevueLesPlansEchus() }),
  },
  {
    // Détection et envoi séparés du même créneau, mais dans cet ordre : une
    // alerte détectée entre en file, elle n'est envoyée qu'après passage par
    // les préférences et le plafond de la famille.
    //
    // 6 h UTC = 9 h à Djibouti. Une alerte d'absence arrivant en pleine nuit
    // serait lue comme une urgence qu'elle n'est pas.
    nom: "learnos-alertes-parent",
    heures: [6],
    executer: async () => {
      // Tâche système : elle balaie délibérément tous les tenants.
      // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      let nouvelles = 0;
      for (const t of tenants) {
        nouvelles += (await detecterAlertes(t.id)).nouvelles;
      }
      return { nouvelles, ...(await envoyerAlertesEnAttente()) };
    },
  },
  {
    // 8 h UTC = 11 h à Djibouti. Les relances partent en milieu de matinée,
    // pas en pleine nuit : un rappel de facture à 3 h du matin s'apparente
    // à une urgence qu'elle n'est pas.
    nom: "relances-auto",
    heures: [8],
    executer: () => envoyerRelancesAutomatiques(),
  },
  {
    // 9 h UTC = 12 h à Djibouti. Détection des devoirs en retard : un devoir
    // dont la date de rendu est dépassée sans avoir été rendu ou corrigé
    // déclenche un événement `devoir.enretard` pour LEARNOS. L'alerte ne se
    // répète pas : un événement par devoir, vérifié par idempotence.
    nom: "devoirs-retard-check",
    heures: [9],
    executer: () => detecterDevoirsEnRetard(),
  },
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forcee = new URL(req.url).searchParams.get("force");
  const heure = new Date().getUTCHours();

  const aExecuter = forcee
    ? TACHES.filter((t) => t.nom === forcee)
    : TACHES.filter((t) => t.heures === null || t.heures.includes(heure));

  if (forcee && aExecuter.length === 0) {
    return NextResponse.json({ error: `Tâche inconnue : ${forcee}` }, { status: 400 });
  }

  const resultats: Record<string, unknown> = {};

  for (const tache of aExecuter) {
    try {
      resultats[tache.nom] = await tache.executer();
    } catch (error) {
      // Une tâche en échec ne doit pas empêcher les suivantes : le répartiteur
      // rend compte de chacune séparément plutôt que d'abandonner le passage.
      resultats[tache.nom] = {
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(`[cron/dispatch] tâche « ${tache.nom} » en échec`, error);
    }
  }

  return NextResponse.json({ success: true, heure, resultats });
}
