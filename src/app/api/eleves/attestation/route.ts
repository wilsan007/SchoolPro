import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { getAttestationData } from "@/lib/attestation-generator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { checkPermission } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";

const BodySchema = z.object({
  eleveId: z.string().min(1),
  honorifique: z.string().max(50).optional(),
  titre: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // API-H1 (audit v2) : contrôle de rôle — seuls les rôles avec eleves:read
  // peuvent générer une attestation.
  const denied = await checkPermission(session.user.role, "eleves:read");
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await req.json().catch((e) => { console.warn("[non-fatal]", e); return null; }));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { eleveId, honorifique, titre } = parsed.data;

  const data = await getAttestationData(eleveId, session.user.tenantId, honorifique ?? "", titre ?? "", session.user);
  if (!data) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  const t = await getTranslations("attestation");
  const html = generateAttestationHTML(data, t);
  return NextResponse.json({ html });
}

function generateAttestationHTML(data: ReturnType<typeof getAttestationData> extends Promise<infer T> ? T : never, t: Awaited<ReturnType<typeof getTranslations>>): string {
  if (!data) return "";
  const d = data;
  const dateFr = format(d.dateDelivrance, "dd MMMM yyyy", { locale: fr });
  const dateNaissance = d.eleveDateNaissance ? format(new Date(d.eleveDateNaissance), "dd/MM/yyyy", { locale: fr }) : "—";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${d.titre} — ${d.eleveNom} ${d.elevePrenom}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Times New Roman', serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
  .logo { max-width: 80px; max-height: 80px; }
  .ecole-info { text-align: right; font-size: 11px; line-height: 1.4; }
  .ecole-info .name { font-size: 16px; font-weight: bold; }
  .title { text-align: center; font-size: 22px; font-weight: bold; text-transform: uppercase; margin: 20px 0; letter-spacing: 1px; }
  .body { text-align: justify; font-size: 14px; line-height: 1.8; margin: 30px auto; max-width: 170mm; }
  .body strong { font-weight: bold; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 60px; }
  .date-lieu { font-size: 12px; }
  .signature { text-align: center; font-size: 12px; }
  .signature img { max-height: 60px; }
  .signature .name { border-top: 1px solid #333; padding-top: 4px; margin-top: 8px; font-weight: bold; }
  .cachet { position: absolute; right: 60px; bottom: 80px; opacity: 0.8; max-height: 100px; }
  .eleve-info { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px 20px; margin: 20px auto; max-width: 170mm; font-size: 13px; }
  .eleve-info table { width: 100%; }
  .eleve-info td { padding: 4px 8px; }
  .eleve-info .label { font-weight: bold; color: #555; width: 120px; }
</style>
</head>
<body>
  <div class="header">
    ${d.ecoleLogo ? `<img src="${d.ecoleLogo}" class="logo" alt="Logo" />` : '<div style="width:80px"></div>'}
    <div class="ecole-info">
      <div class="name">${d.ecoleName}</div>
      ${d.ecoleAddress ? `<div>${d.ecoleAddress}</div>` : ''}
      ${d.ecoleVille ? `<div>${d.ecoleVille}, ${d.ecolePays}</div>` : ''}
      ${d.ecolePhone ? `<div>Tél: ${d.ecolePhone}</div>` : ''}
      ${d.ecoleEmail ? `<div>Email: ${d.ecoleEmail}</div>` : ''}
    </div>
  </div>

  <div class="title">${d.titre}</div>

  <div class="eleve-info">
    <table>
      <tr>
        <td class="label">${t("labelNomPrenom")}:</td><td><strong>${d.eleveNom} ${d.elevePrenom}</strong></td>
        <td class="label">${t("labelMatricule")}:</td><td>${d.eleveMatricule}</td>
      </tr>
      <tr>
        <td class="label">${t("labelNeLe")}:</td><td>${dateNaissance}</td>
        <td class="label">Sexe:</td><td>${d.eleveSexe === "M" ? "Masculin" : "Féminin"}</td>
      </tr>
      <tr>
        <td class="label">${t("labelClasse")}:</td><td>${d.eleveClasse}</td>
        <td class="label">${t("labelNiveau")}:</td><td>${d.eleveNiveau}</td>
      </tr>
      <tr>
        <td class="label">${t("labelAnneeScolaire")}:</td><td colspan="3"><strong>${d.annee}</strong></td>
      </tr>
    </table>
  </div>

  <div class="body">
    <p>${t("corpsJeSoussigne")} <strong>${d.honorifique} ${d.chefEtablissement ?? "_______________"}</strong>,
    ${t("corpsDirecteurTrice")} <strong>${d.ecoleName}</strong>,</p>
    <p>${t("corpsAtteste")} <strong>${d.eleveNom} ${d.elevePrenom}</strong>,
    ${d.eleveDateNaissance ? `né(e) le ${dateNaissance},` : ""} matricule N° <strong>${d.eleveMatricule}</strong>,
    ${t("corpsEstRegulierementInscrit")} <strong>${d.eleveClasse}</strong> (${d.eleveNiveau})
    ${t("corpsPourLAnnee")} <strong>${d.annee}</strong>.</p>
    <p>${t("corpsEnFoiDeQuoi")} ${d.titre.toLowerCase()} ${t("corpsLuiEstDelivree")}</p>
  </div>

  <div class="footer">
    <div class="date-lieu">${t("footerFaitA")} ${d.ecoleVille}, ${t("footerLe")} ${dateFr}</div>
    <div class="signature">
      ${d.signatureUrl ? `<img src="${d.signatureUrl}" alt="Signature" /><br/>` : ''}
      <div class="name">${d.chefEtablissement ?? t("footerLeDirecteur")}</div>
      <div style="font-size:10px;color:#666">${t("footerDirecteur")}</div>
    </div>
  </div>
  ${d.cachetUrl ? `<img src="${d.cachetUrl}" class="cachet" alt="Cachet" />` : ''}
</body>
</html>`;
}
