import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { genererModeleExcel, MODELES_IMPORT, type TypeModele } from "@/lib/import-modeles";

/**
 * GET /api/import/modele/[type]
 * Télécharge un modèle Excel vide pour le type d'import demandé.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { type } = await params;
  const typesValides = Object.keys(MODELES_IMPORT) as TypeModele[];

  if (!typesValides.includes(type as TypeModele)) {
    return NextResponse.json(
      { error: `Type de modèle invalide: ${type}. Types valides: ${typesValides.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const buffer = await genererModeleExcel(type as TypeModele);
    const def = MODELES_IMPORT[type as TypeModele];

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${def.nomFichier}.xlsx"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    console.error("[API/import/modele] GET", e);
    return NextResponse.json({ error: "Erreur lors de la génération du modèle" }, { status: 500 });
  }
}
