import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { eleveScopeFilter, mergeFilters } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";

/**
 * Justification d'une absence par un parent.
 *
 * Le rôle PARENT n'a pas `absences:write` dans la matrice RBAC — et à juste
 * titre : un parent ne *saisit* pas d'absence, il justifie celle de son enfant.
 * Cette route est donc un cas dédié : elle vérifie que l'absence appartient à
 * l'un des enfants du parent connecté (`eleveScopeFilter`), puis met à jour
 * le statut et le justificatif.
 */
const JustifierSchema = z.object({
  absenceId: z.string().min(1, "L'identifiant de l'absence est requis"),
  motif: z.enum(["MALADIE", "FAMILIALE", "TRANSPORT", "AUTRE"]),
  justificatif: z.string().optional(),
  commentaire: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Réservé au parent : un personnel utilise les écrans vie scolaire.
  if (session.user.role !== "PARENT") {
    return NextResponse.json(
      { error: "Accès refusé : réservé aux parents" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = JustifierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { absenceId, motif, justificatif, commentaire } = parsed.data;
  const tenantId = session.user.tenantId;

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  if (!anneeCourante) {
    return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });
  }

  // Vérifier que l'absence appartient à l'un des enfants du parent.
  // `eleveScopeFilter` borne au périmètre relationnel (ses enfants uniquement).
  const anneeFilter = { AND: [{ eleve: { classe: { annee: anneeCourante } } }] };
  const absence = await prisma.absence.findFirst({
    where: mergeFilters(
      { id: absenceId, tenantId },
      eleveScopeFilter(session.user, "eleve"),
      anneeFilter
    ),
    select: { id: true, statut: true, eleveId: true },
  });

  if (!absence) {
    return NextResponse.json(
      { error: "Absence introuvable ou non rattachée à votre enfant" },
      { status: 404 }
    );
  }

  const updated = await prisma.absence.update({
    where: { id: absenceId },
    data: {
      statut: "JUSTIFIEE",
      motif,
      justificatif: justificatif || null,
      commentaire: commentaire || null,
    },
    select: { id: true, statut: true, motif: true },
  });

  return NextResponse.json({ absence: updated });
}
