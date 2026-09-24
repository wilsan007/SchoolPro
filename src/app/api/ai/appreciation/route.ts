import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { generateCompletion, AiConfigError } from "@/lib/ai/glm-client";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { SEUILS_PAR_DEFAUT, type Seuils } from "@/lib/learnos/recommendation-engine";

const Schema = z.object({
  eleveId: z.string().min(1),
  periodeId: z.string().min(1),
});

/** Classifie une moyenne /20 contre les seuils calibrés du niveau × matière. */
function niveauMaitrise(scoreSur20: number, seuils: Seuils): string {
  const s = scoreSur20 / 20;
  if (s < seuils.seuilCritique) return "très en difficulté";
  if (s < seuils.seuilFragile) return "fragile";
  if (s < seuils.seuilConsolide) return "en progrès";
  if (s < seuils.seuilAvance) return "consolidé";
  return "avancé";
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = await checkPermission(session.user.role, "ai:teacher");
    if (denied) return denied;

    const ip = getClientIP(req);
    const rl = rateLimit({ max: 30, windowSec: 60, key: `ai-appreciation:${session.user.id}:${ip}` });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    const { eleveId, periodeId } = parsed.data;
    const tenantId = session.user.tenantId;
    const anneeCourante = await getAnneeCouranteLibelle(tenantId);

    const eleve = await prisma.eleve.findFirst({
      where: { id: eleveId, tenantId, ...siteFilterForModel("eleve", session.user) },
      select: {
        nom: true,
        prenom: true,
        classe: { select: { nom: true, niveau: true } },
      },
    });
    if (!eleve) {
      return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
    }

    const bulletin = await prisma.bulletin.findFirst({
      where: {
        eleveId,
        periodeId,
        tenantId,
        ...siteFilterForModel("bulletin", session.user),
        ...(anneeCourante ? { periode: { annee: { libelle: anneeCourante } } } : {}),
      },
      include: {
        // Les lignes de matières appartiennent au bulletin retourné, lui-même déjà
        // borné au tenant et au périmètre de sites : l'isolation est portée par la
        // relation. (BulletinMatiere n'a par ailleurs aucun chemin propre vers le
        // site : son rattachement passe uniquement par ce bulletin.)
        // eslint-disable-next-line ecolpro/require-site-filter
        matieres: { include: { matiere: true } },
        periode: true,
      },
    });
    if (!bulletin) {
      return NextResponse.json(
        { error: "Bulletin introuvable — générez d'abord les bulletins de la classe" },
        { status: 404 }
      );
    }

    const absences = await prisma.absence.count({
      where: { tenantId, ...siteFilterForModel("absence", session.user),
        eleveId,
        date: { gte: bulletin.periode.dateDebut, lte: bulletin.periode.dateFin },
      },
    });

    // Seuils calibrés par niveau × matière (LEARNOS) : ils traduisent la
    // performance attendue réelle de ce niveau, apprise des prédictions
    // vérifiées — là où une note brute ne dit pas si un 11/20 est dans la
    // norme du niveau ou en dessous.
    const niveau = eleve.classe?.niveau ?? null;
    const calibrations = niveau
      ? await prisma.calibrationSeuil.findMany({
          where: { tenantId, niveau, ...siteFilterForModel("calibrationSeuil", session.user) },
        })
      : [];
    const calibrationParMatiere = new Map(calibrations.map((c) => [c.matiereId, c]));
    const calibrationNiveau = calibrations.find((c) => c.matiereId === null) ?? null;
    const seuilsPourMatiere = (matiereId: string): Seuils => {
      const c = calibrationParMatiere.get(matiereId) ?? calibrationNiveau;
      if (!c) return SEUILS_PAR_DEFAUT;
      return {
        seuilCritique: c.seuilCritique,
        seuilFragile: c.seuilFragile,
        seuilConsolide: c.seuilConsolide,
        seuilAvance: c.seuilAvance,
        confianceMinimale: c.confianceMinimale,
        prerequisBloquantsMin: SEUILS_PAR_DEFAUT.prerequisBloquantsMin,
        declenchementPlanCritiques: SEUILS_PAR_DEFAUT.declenchementPlanCritiques,
        declenchementPlanAvances: SEUILS_PAR_DEFAUT.declenchementPlanAvances,
      };
    };

    const matieresEnDifficulte: string[] = [];
    const matieresLignes = bulletin.matieres
      .map((m) => {
        const maitrise =
          m.moyenneEleve !== null ? niveauMaitrise(m.moyenneEleve, seuilsPourMatiere(m.matiereId)) : null;
        if (maitrise === "très en difficulté" || maitrise === "fragile") {
          matieresEnDifficulte.push(m.matiere.nom);
        }
        return (
          `- ${m.matiere.nom} : ${m.moyenneEleve !== null ? m.moyenneEleve.toFixed(2) : "N/A"}/20${
            m.rang ? ` (rang ${m.rang})` : ""
          }${maitrise ? ` [${maitrise}]` : ""}`
        );
      })
      .join("\n");

    const prompt = `Rédige une appréciation générale de bulletin scolaire pour cet élève, en français, 2 à 3 phrases maximum, bienveillante mais honnête et constructive.

Élève : ${eleve.prenom} ${eleve.nom} — Classe ${eleve.classe?.nom ?? "N/A"} (${eleve.classe?.niveau ?? ""})
Moyenne générale : ${bulletin.moyenneGenerale !== null ? bulletin.moyenneGenerale.toFixed(2) : "N/A"}/20
Rang : ${bulletin.rang ?? "N/A"}
Absences sur la période : ${absences}
Résultats par matière (entre crochets : le niveau de maîtrise attendu pour ce niveau scolaire) :
${matieresLignes || "(aucune note enregistrée)"}
${matieresEnDifficulte.length > 0 ? `\nMatières sous le seuil attendu pour ce niveau : ${matieresEnDifficulte.join(", ")} — invite explicitement à un effort ciblé sur ces matières.` : ""}

Réponds uniquement avec le texte de l'appréciation, sans guillemets ni préambule.`;

    const appreciation = await generateCompletion(
      [
        {
          role: "system",
          content:
            "Tu es un enseignant expérimenté qui rédige des appréciations de bulletin scolaire concises, professionnelles et constructives en français.",
        },
        { role: "user", content: prompt },
      ],
      { temperature: 0.6, maxTokens: 220 }
    );

    return NextResponse.json({ appreciation });
  } catch (error) {
    console.error("[API/ai/appreciation]", error);
    if (error instanceof AiConfigError) {
      return NextResponse.json({ error: "IA non configurée" }, { status: 503 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
