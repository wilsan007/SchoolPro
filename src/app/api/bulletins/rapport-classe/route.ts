import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");
  const periodeId = searchParams.get("periodeId");

  if (!classeId || !periodeId) {
    return NextResponse.json({ error: "classeId et periodeId requis" }, { status: 400 });
  }


  const bulletins = await prisma.bulletin.findMany({
    where: {
      eleve: { classeId, tenantId: session.user.tenantId },
      periodeId,
      tenantId: session.user.tenantId,
      // Cette route ne vérifie AUCUNE permission : tout compte authentifié —
      // donc aussi un PARENT ou un élève — l'atteint. Et pour ces deux rôles le
      // filtre de site est neutre par construction (périmètre relationnel,
      // cf. site-scope.ts) : le rapport de classe nominatif (moyennes, rangs,
      // décisions, appréciations) était lisible pour n'importe quelle classe.
      // `personalScopeFilter` est le seul filtre qui les isole ; il ne change
      // rien pour le personnel.
      ...mergeFilters(
        siteFilterForModel("bulletin", session.user),
        personalScopeFilter(session.user, "eleve")
      ),
    },
    include: {
      eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
      // Les lignes de matière suivent le bulletin parent, déjà borné au tenant
      // et au périmètre de sites : elles ne peuvent appartenir qu'à un bulletin
      // autorisé. `BulletinMatiere` n'a pas de chemin de site propre (elle
      // passe par le bulletin, qui ne porte pas de colonne `siteId`).
      // eslint-disable-next-line ecolpro/require-site-filter
      matieres: { include: { matiere: { select: { nom: true, code: true } } } },
    },
    orderBy: { rang: "asc" },
  });

  if (bulletins.length === 0) {
    return NextResponse.json({ rows: [], matieres: [] });
  }

  const matiereSet = new Map<string, string>();
  for (const b of bulletins) {
    for (const bm of b.matieres) {
      matiereSet.set(bm.matiere.code, bm.matiere.nom);
    }
  }
  const matieres = Array.from(matiereSet.entries()).map(([code, nom]) => ({ code, nom }));

  const rows = bulletins.map((b) => {
    const row: Record<string, any> = {
      matricule: b.eleve.matricule,
      nom: `${b.eleve.nom} ${b.eleve.prenom}`,
      moyenneGenerale: b.moyenneGenerale,
      rang: b.rang,
      decision: b.decision,
      appreciation: b.appreciation,
    };
    for (const bm of b.matieres) {
      row[bm.matiere.code] = bm.moyenneEleve;
    }
    return row;
  });

  return NextResponse.json({ rows, matieres });
}
