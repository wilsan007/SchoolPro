import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { siteFilterForModel } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { getDemoNow } from "@/lib/demo-now";

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


  const classeFilter = siteFilterForModel("classe", session.user);
  const eleveFilter = siteFilterForModel("eleve", session.user);
  const anneeCourante = await getAnneeCouranteLibelle(session.user.tenantId);
  const [classe, eleves, tenant] = await Promise.all([
    prisma.classe.findFirst({
      where: { id: classeId, tenantId: session.user.tenantId, ...classeFilter, ...(anneeCourante ? { annee: anneeCourante } : {}) },
      include: { profPrincipal: { include: { user: { select: { name: true } } } } },
    }),
    prisma.eleve.findMany({
      where: { classeId, tenantId: session.user.tenantId, ...eleveFilter, statut: "ACTIF", ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}) },
      select: { id: true, nom: true, prenom: true, matricule: true, sexe: true },
      orderBy: { nom: "asc" },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { name: true, city: true, currentYear: true },
    }),
  ]);

  if (!classe || !tenant) {
    return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
  }

  const today = format(await getDemoNow(), "dd MMMM yyyy", { locale: fr });
  const profNom = classe.profPrincipal?.user.name ?? "—";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Feuille de Présence — ${classe.nom}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
  .ecole { font-weight: bold; font-size: 14px; }
  .title { text-align: center; font-size: 18px; font-weight: bold; margin: 10px 0; }
  .info { margin: 10px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: center; }
  th { background: #f0f0f0; font-weight: bold; }
  .nom { text-align: left; font-weight: 500; }
  .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; }
</style>
</head>
<body>
  <div class="header">
    <div class="ecole">${tenant.name}</div>
    <div style="text-align:right; font-size:11px">
      Année scolaire: ${tenant.currentYear}<br/>
      Date: ${today}
    </div>
  </div>
  <div class="title">FEUILLE DE PRÉSENCE</div>
  <div class="info">
    <strong>Classe :</strong> ${classe.nom} &nbsp;&nbsp; <strong>Niveau :</strong> ${classe.niveau} &nbsp;&nbsp; <strong>Prof. Principal :</strong> ${profNom} &nbsp;&nbsp; <strong>Effectif :</strong> ${eleves.length}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">N°</th>
        <th style="width:100px">Matricule</th>
        <th class="nom" style="width:200px">Nom & Prénom</th>
        <th style="width:50px">Sexe</th>
        ${Array.from({ length: 10 }, (_, i) => `<th style="width:40px">${format(new Date(Date.now() + i * 86400000), "dd/MM", { locale: fr })}</th>`).join("")}
        <th style="width:60px">Total Abs.</th>
      </tr>
    </thead>
    <tbody>
      ${eleves.map((e, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${e.matricule}</td>
          <td class="nom">${e.nom} ${e.prenom}</td>
          <td>${e.sexe}</td>
          ${Array.from({ length: 10 }, () => '<td></td>').join("")}
          <td></td>
        </tr>
      `).join("")}
    </tbody>
  </table>
  <div class="footer">
    <div>Signature du Professeur: ____________________</div>
    <div>Visa du Directeur: ____________________</div>
  </div>
</body>
</html>`;

  return NextResponse.json({ html });
}
