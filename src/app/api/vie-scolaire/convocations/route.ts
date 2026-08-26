import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { siteFilterForModel } from "@/lib/site-scope";
import { erreurJson } from "@/lib/erreurs-api";
import { getDemoNow } from "@/lib/demo-now";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  const body = await req.json();
  const { eleveId, motif, motifDetail, dateConvocation } = body;

  if (!eleveId) {
    return erreurJson("DONNEES_INVALIDES");
  }


  const siteFilter = siteFilterForModel("eleve", session.user);
  const eleve = await prisma.eleve.findFirst({
    where: { id: eleveId, tenantId: session.user.tenantId, ...siteFilter },
    include: {
      classe: true,
      parents: { where: siteFilterForModel("eleveParent", session.user), include: { parent: true } },
    },
  });

  if (!eleve) {
    return erreurJson("ELEVE_INTROUVABLE");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.user.tenantId },
    select: { name: true, city: true, address: true, phone: true, email: true, logoUrl: true, chefEtablissement: true, currentYear: true },
  });

  if (!tenant) {
    return erreurJson("ETABLISSEMENT_INTROUVABLE");
  }

  const parent = eleve.parents[0]?.parent;
  const dateStr = dateConvocation ? format(new Date(dateConvocation), "dd MMMM yyyy à HH:mm", { locale: fr }) : "Date à confirmer";
  const todayStr = format(await getDemoNow(), "dd MMMM yyyy", { locale: fr });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Convocation des Parents — ${eleve.nom} ${eleve.prenom}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Times New Roman', serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
  .ecole-info { text-align: right; font-size: 11px; line-height: 1.4; }
  .ecole-info .name { font-size: 16px; font-weight: bold; }
  .title { text-align: center; font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 20px 0; letter-spacing: 1px; }
  .body { text-align: justify; font-size: 14px; line-height: 1.8; margin: 30px auto; max-width: 170mm; }
  .info-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px 20px; margin: 20px auto; max-width: 170mm; font-size: 13px; }
  .info-box table { width: 100%; }
  .info-box td { padding: 4px 8px; }
  .info-box .label { font-weight: bold; color: #555; width: 140px; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 60px; }
  .signature { text-align: center; font-size: 12px; }
  .signature .name { border-top: 1px solid #333; padding-top: 4px; margin-top: 8px; font-weight: bold; }
</style>
</head>
<body>
  <div class="header">
    <div style="width:80px"></div>
    <div class="ecole-info">
      <div class="name">${tenant.name}</div>
      ${tenant.address ? `<div>${tenant.address}</div>` : ''}
      ${tenant.city ? `<div>${tenant.city}</div>` : ''}
      ${tenant.phone ? `<div>Tél: ${tenant.phone}</div>` : ''}
      ${tenant.email ? `<div>Email: ${tenant.email}</div>` : ''}
    </div>
  </div>

  <div class="title">Convocation des Parents</div>

  <div class="info-box">
    <table>
      <tr><td class="label">Élève :</td><td><strong>${eleve.nom} ${eleve.prenom}</strong></td></tr>
      <tr><td class="label">Matricule :</td><td>${eleve.matricule}</td></tr>
      <tr><td class="label">Classe :</td><td>${eleve.classe?.nom ?? "—"}</td></tr>
      <tr><td class="label">Parent :</td><td>${parent ? `${parent.prenom} ${parent.nom}` : "—"}</td></tr>
      <tr><td class="label">Année scolaire :</td><td>${tenant.currentYear}</td></tr>
    </table>
  </div>

  <div class="body">
    <p>Le Directeur de l'établissement <strong>${tenant.name}</strong> prie ${parent ? `M./Mme ${parent.nom}` : "les parents"} de bien vouloir se présenter à l'établissement le :</p>
    <p style="text-align:center; font-size:16px; font-weight:bold; margin:20px 0;">${dateStr}</p>
    <p><strong>Motif :</strong> ${motif}</p>
    ${motifDetail ? `<p><strong>Détails :</strong> ${motifDetail}</p>` : ''}
    <p>Cette convocation fait suite à un incident nécessitant une rencontre avec la direction de l'établissement.</p>
    <p>En l'absence du parent à la date indiquée, des mesures disciplinaires pourront être prises.</p>
  </div>

  <div class="footer">
    <div style="font-size:12px">Fait à ${tenant.city ?? "________"}, le ${todayStr}</div>
    <div class="signature">
      <div class="name">${tenant.chefEtablissement ?? "Le Directeur"}</div>
      <div style="font-size:10px;color:#666">Directeur de l'établissement</div>
    </div>
  </div>
</body>
</html>`;

  return NextResponse.json({ html });
}
