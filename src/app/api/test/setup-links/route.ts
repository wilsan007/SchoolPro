import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { siteFilterForModel } from "@/lib/site-scope";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  // Get first 3 active students
  const siteFilter = siteFilterForModel("eleve", session.user);
  const eleves = await prisma.eleve.findMany({
    where: { tenantId, ...siteFilter, statut: "ACTIF" },
    take: 3,
    orderBy: { nom: "asc" },
    select: { id: true, nom: true, prenom: true, matricule: true },
  });

  // Get or create a parent
  let parent = await prisma.parent.findFirst({
    where: { tenantId, ...siteFilterForModel("parent", session.user) },
    orderBy: { createdAt: "desc" },
  });

  if (!parent) {
    parent = await prisma.parent.create({
      data: {
        tenantId,
        nom: "Ndiaye",
        prenom: "Fatou",
        phone: "779876543",
        email: "fatou.ndiaye@lycee-demo.ecolpro.app",
      },
    });
  }

  // Link each student to this parent if not already linked
  const results: string[] = [];
  for (const eleve of eleves) {
    const existing = await prisma.eleveParent.findUnique({
      where: { eleveId_parentId: { eleveId: eleve.id, parentId: parent.id } },
    });
    if (!existing) {
      await prisma.eleveParent.create({
        data: {
          eleveId: eleve.id,
          parentId: parent.id,
          lien: "TUTEUR",
          isGardien: true,
        },
      });
      results.push(`✅ ${eleve.prenom} ${eleve.nom} lié à ${parent.prenom} ${parent.nom}`);
    } else {
      results.push(`⏭️ ${eleve.prenom} ${eleve.nom} déjà lié à ${parent.prenom} ${parent.nom}`);
    }
  }

  // Return eleve IDs and parent info for the test
  return NextResponse.json({
    parent: { id: parent.id, nom: parent.nom, prenom: parent.prenom, phone: parent.phone, email: parent.email },
    eleves: eleves.map((e) => ({ id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.matricule })),
    links: results,
  });
}
