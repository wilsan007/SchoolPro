import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { generateCompletion, AiConfigError } from "@/lib/ai/glm-client";
import { siteFilterForModel } from "@/lib/site-scope";

const Schema = z.object({
  eleveId: z.string().min(1),
  periodeId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "ai:teacher");
    if (denied) return denied;

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
    const { eleveId, periodeId } = parsed.data;
    const tenantId = session.user.tenantId;

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

    const matieresLignes = bulletin.matieres
      .map(
        (m) =>
          `- ${m.matiere.nom} : ${m.moyenneEleve !== null ? m.moyenneEleve.toFixed(2) : "N/A"}/20${
            m.rang ? ` (rang ${m.rang})` : ""
          }`
      )
      .join("\n");

    const prompt = `Rédige une appréciation générale de bulletin scolaire pour cet élève, en français, 2 à 3 phrases maximum, bienveillante mais honnête et constructive.

Élève : ${eleve.prenom} ${eleve.nom} — Classe ${eleve.classe?.nom ?? "N/A"} (${eleve.classe?.niveau ?? ""})
Moyenne générale : ${bulletin.moyenneGenerale !== null ? bulletin.moyenneGenerale.toFixed(2) : "N/A"}/20
Rang : ${bulletin.rang ?? "N/A"}
Absences sur la période : ${absences}
Résultats par matière :
${matieresLignes || "(aucune note enregistrée)"}

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
