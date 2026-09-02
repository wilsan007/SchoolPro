import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { getAttestationData } from "@/lib/attestation-generator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const BodySchema = z.object({
  eleveId: z.string().min(1),
  honorifique: z.string().optional(),
  titre: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { eleveId, honorifique, titre } = parsed.data;

  const data = await getAttestationData(eleveId, session.user.tenantId, honorifique ?? "", titre ?? "", session.user);
  if (!data) {
    return NextResponse.json({ error: "Élève introuvable" }, { status: 404 });
  }

  const html = generateAttestationHTML(data);
  return NextResponse.json({ html });
}

function generateAttestationHTML(data: ReturnType<typeof getAttestationData> extends Promise<infer T> ? T : never): string {
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
        <td class="label">Nom & Prénom:</td><td><strong>${d.eleveNom} ${d.elevePrenom}</strong></td>
        <td class="label">Matricule:</td><td>${d.eleveMatricule}</td>
      </tr>
      <tr>
        <td class="label">Né(e) le:</td><td>${dateNaissance}</td>
        <td class="label">Sexe:</td><td>${d.eleveSexe === "M" ? "Masculin" : "Féminin"}</td>
      </tr>
      <tr>
        <td class="label">Classe:</td><td>${d.eleveClasse}</td>
        <td class="label">Niveau:</td><td>${d.eleveNiveau}</td>
      </tr>
      <tr>
        <td class="label">Année scolaire:</td><td colspan="3"><strong>${d.annee}</strong></td>
      </tr>
    </table>
  </div>

  <div class="body">
    <p>Je soussigné(e) <strong>${d.honorifique} ${d.chefEtablissement ?? "_______________"}</strong>,
    Directeur(trice) de l'établissement <strong>${d.ecoleName}</strong>,</p>
    <p>atteste par la présente que l'élève <strong>${d.eleveNom} ${d.elevePrenom}</strong>,
    ${d.eleveDateNaissance ? `né(e) le ${dateNaissance},` : ""} matricule N° <strong>${d.eleveMatricule}</strong>,
    est régulièrement inscrit(e) en classe de <strong>${d.eleveClasse}</strong> (${d.eleveNiveau})
    pour l'année scolaire <strong>${d.annee}</strong>.</p>
    <p>En foi de quoi la présente ${d.titre.toLowerCase()} lui est délivrée pour servir et valoir ce que de droit.</p>
  </div>

  <div class="footer">
    <div class="date-lieu">Fait à ${d.ecoleVille}, le ${dateFr}</div>
    <div class="signature">
      ${d.signatureUrl ? `<img src="${d.signatureUrl}" alt="Signature" /><br/>` : ''}
      <div class="name">${d.chefEtablissement ?? "Le Directeur"}</div>
      <div style="font-size:10px;color:#666">Directeur de l'établissement</div>
    </div>
  </div>
  ${d.cachetUrl ? `<img src="${d.cachetUrl}" class="cachet" alt="Cachet" />` : ''}
</body>
</html>`;
}
