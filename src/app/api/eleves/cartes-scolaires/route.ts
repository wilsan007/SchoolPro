import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classeId = searchParams.get("classeId");

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  const [classe, eleves, tenant] = await Promise.all([
    prisma.classe.findFirst({
      where: { id: classeId, tenantId: session.user.tenantId },
    }),
    prisma.eleve.findMany({
      where: { classeId, tenantId: session.user.tenantId, statut: "ACTIF" },
      select: { id: true, nom: true, prenom: true, matricule: true, dateNaissance: true, photoUrl: true },
      orderBy: { nom: "asc" },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, city: true, currentYear: true, logoUrl: true, address: true, phone: true },
    }),
  ]);

  if (!classe || !tenant) {
    return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
  }

  const cartes = eleves.map((e) => {
    const dateNaissance = e.dateNaissance ? format(new Date(e.dateNaissance), "dd/MM/yyyy", { locale: fr }) : "—";
    return `
    <div class="carte">
      <div class="recto">
        <div class="header-carte">
          ${tenant.logoUrl ? `<img src="${tenant.logoUrl}" class="logo" />` : ""}
          <div class="ecole-name">${tenant.name}</div>
        </div>
        <div class="photo-area">
          ${e.photoUrl ? `<img src="${e.photoUrl}" class="photo" />` : '<div class="photo-placeholder">PHOTO</div>'}
        </div>
        <div class="eleve-info">
          <div class="nom">${e.nom} ${e.prenom}</div>
          <div class="matricule">N° ${e.matricule}</div>
          <div class="classe">${classe.nom} — ${classe.niveau}</div>
        </div>
        <div class="annee">Année ${tenant.currentYear}</div>
      </div>
      <div class="verso">
        <div class="verso-info">
          <p><strong>Né(e) le :</strong> ${dateNaissance}</p>
          <p><strong>Établissement :</strong> ${tenant.name}</p>
          <p><strong>Adresse :</strong> ${tenant.address ?? "—"}</p>
          <p><strong>Tél :</strong> ${tenant.phone ?? "—"}</p>
        </div>
        <div class="qr-placeholder">QR / Matricule: ${e.matricule}</div>
      </div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Cartes Scolaires — ${classe.nom}</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #1a1a1a; margin: 0; padding: 10px; }
  .cartes { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .carte { width: 85mm; height: 54mm; border: 2px solid #333; border-radius: 6px; overflow: hidden; display: flex; }
  .recto, .verso { width: 50%; padding: 4px; box-sizing: border-box; display: flex; flex-direction: column; }
  .recto { border-right: 1px dashed #ccc; }
  .header-carte { display: flex; align-items: center; gap: 4px; }
  .logo { width: 20px; height: 20px; object-fit: contain; }
  .ecole-name { font-size: 8px; font-weight: bold; }
  .photo-area { display: flex; justify-content: center; margin: 4px 0; }
  .photo, .photo-placeholder { width: 50px; height: 60px; object-fit: cover; border: 1px solid #999; }
  .photo-placeholder { display: flex; align-items: center; justify-content: center; background: #f0f0f0; font-size: 8px; color: #999; }
  .eleve-info { text-align: center; }
  .nom { font-weight: bold; font-size: 9px; }
  .matricule { font-size: 8px; color: #555; }
  .classe { font-size: 8px; }
  .annee { text-align: center; font-size: 7px; color: #777; margin-top: auto; }
  .verso-info { font-size: 7px; line-height: 1.4; }
  .verso-info p { margin: 2px 0; }
  .qr-placeholder { margin-top: auto; text-align: center; font-size: 7px; border: 1px solid #ccc; padding: 4px; }
</style>
</head>
<body>
  <div class="cartes">${cartes}</div>
</body>
</html>`;

  return NextResponse.json({ html });
}
