import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-filter";
import { siteFilterForModel } from "@/lib/site-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const facture = await prisma.facture.findFirst({
      where: { id, tenantId: session.user.tenantId, ...siteFilterForModel("facture", session.user) },
      include: {
        eleve: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            matricule: true,
            classe: { select: { nom: true, niveau: true } },
            parents: {
              include: { parent: true },
              where: { isGardien: true },
              take: 1,
            },
          },
        },
        tenant: true,
        // eslint-disable-next-line ecolpro/require-site-filter -- paiement n'a pas de siteId, scopé via la facture parente déjà filtrée par site
        paiements: {
          orderBy: { date: "desc" },
          include: { enregistrePar: { select: { name: true } } },
        },
        createdBy: { select: { name: true } },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    if (!canAccessSite(session.user, facture.siteId)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const tenant = facture.tenant;
    const eleve = facture.eleve;
    const tuteur = eleve.parents[0]?.parent;
    const totalPaye = facture.paiements.reduce((sum, p) => sum + p.montant, 0);
    const restant = facture.montant - totalPaye;

    function formatMoney(amount: number, devise: string) {
      try {
        return new Intl.NumberFormat("fr-DJ", { style: "currency", currency: devise }).format(amount);
      } catch {
        return `${amount.toLocaleString("fr-DJ")} ${devise}`;
      }
    }

    const statutLabels: Record<string, string> = {
      EN_ATTENTE: "En attente",
      PAYEE: "Payée",
      EN_RETARD: "En retard",
      ANNULEE: "Annulée",
    };

    const statutColors: Record<string, string> = {
      EN_ATTENTE: "#f59e0b",
      PAYEE: "#10b981",
      EN_RETARD: "#ef4444",
      ANNULEE: "#6b7280",
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Facture ${facture.numero}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #f5f5f5; padding: 20px; }
  .invoice { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 28px 32px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header .inv-num { font-size: 14px; opacity: 0.9; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; }
  .school-info { padding: 20px 32px; border-bottom: 1px solid #e5e7eb; }
  .school-info h2 { font-size: 18px; font-weight: 700; color: #1e40af; }
  .school-info p { font-size: 13px; color: #6b7280; margin-top: 2px; }
  .body { padding: 24px 32px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin: 0 0 8px; font-weight: 600; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .row .label { font-size: 13px; color: #6b7280; font-weight: 500; }
  .row .value { font-size: 13px; color: #111827; font-weight: 600; text-align: right; }
  .amount-box { margin: 20px 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 20px; text-align: center; }
  .amount-box .label { font-size: 12px; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; }
  .amount-box .amount { font-size: 32px; font-weight: 800; color: #1e40af; margin-top: 4px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 20px 0; }
  .summary-card { padding: 16px; border-radius: 8px; text-align: center; }
  .summary-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
  .summary-card .amount { font-size: 18px; font-weight: 700; margin-top: 4px; }
  .summary-invoiced { background: #eff6ff; }
  .summary-invoiced .amount { color: #1e40af; }
  .summary-paid { background: #ecfdf5; }
  .summary-paid .amount { color: #059669; }
  .summary-due { background: ${restant > 0 ? "#fef2f2" : "#ecfdf5"}; }
  .summary-due .amount { color: ${restant > 0 ? "#dc2626" : "#059669"}; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { text-align: left; padding: 10px 12px; background: #f9fafb; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
  .footer { padding: 20px 32px; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
  .signature { font-size: 12px; color: #6b7280; }
  .signature-line { margin-top: 40px; border-top: 1px dashed #9ca3af; width: 180px; text-align: center; padding-top: 4px; }
  .stamp { font-size: 11px; color: #d1d5db; text-align: right; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #1e40af; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #1e3a8a; }
  @media print { .print-btn { display: none; } body { padding: 0; background: white; } .invoice { box-shadow: none; } }
</style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <h1>FACTURE</h1>
        <div class="inv-num">N° ${facture.numero}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;opacity:0.9">${new Date(facture.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</div>
        <div style="margin-top:6px">
          <span class="status-badge" style="background:${statutColors[facture.statut] ?? "#6b7280"}">
            ${statutLabels[facture.statut] ?? facture.statut}
          </span>
        </div>
      </div>
    </div>

    <div class="school-info">
      <h2>${tenant.name}</h2>
      <p>${tenant.city ?? ""}${tenant.city && tenant.country ? ", " : ""}${tenant.country}</p>
      ${tenant.email ? `<p>${tenant.email}</p>` : ""}
      ${tenant.phone ? `<p>${tenant.phone}</p>` : ""}
    </div>

    <div class="body">
      <div class="two-col">
        <div>
          <div class="section-title">Élève</div>
          <div class="row"><span class="label">Nom & Prénom</span><span class="value">${eleve.prenom} ${eleve.nom}</span></div>
          <div class="row"><span class="label">Matricule</span><span class="value">${eleve.matricule}</span></div>
          <div class="row"><span class="label">Classe</span><span class="value">${eleve.classe?.nom ?? "N/A"} — ${eleve.classe?.niveau ?? ""}</span></div>
        </div>
        <div>
          ${tuteur ? `
          <div class="section-title">Tuteur légal</div>
          <div class="row"><span class="label">Nom</span><span class="value">${tuteur.prenom} ${tuteur.nom}</span></div>
          ${tuteur.phone ? `<div class="row"><span class="label">Téléphone</span><span class="value">${tuteur.phone}</span></div>` : ""}
          ${tuteur.email ? `<div class="row"><span class="label">Email</span><span class="value">${tuteur.email}</span></div>` : ""}
          ` : ""}
        </div>
      </div>

      <div class="section-title" style="margin-top:20px">Détails de la facture</div>
      <div class="row"><span class="label">Libellé</span><span class="value">${facture.libelle}</span></div>
      ${facture.echeance ? `<div class="row"><span class="label">Échéance</span><span class="value">${new Date(facture.echeance).toLocaleDateString("fr-FR")}</span></div>` : ""}
      ${facture.createdBy ? `<div class="row"><span class="label">Émise par</span><span class="value">${facture.createdBy.name}</span></div>` : ""}

      <div class="amount-box">
        <div class="label">Montant facturé</div>
        <div class="amount">${formatMoney(facture.montant, facture.devise)}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card summary-invoiced">
          <div class="label">Facturé</div>
          <div class="amount">${formatMoney(facture.montant, facture.devise)}</div>
        </div>
        <div class="summary-card summary-paid">
          <div class="label">Payé</div>
          <div class="amount">${formatMoney(totalPaye, facture.devise)}</div>
        </div>
        <div class="summary-card summary-due">
          <div class="label">Reste à payer</div>
          <div class="amount">${formatMoney(restant, facture.devise)}</div>
        </div>
      </div>

      ${facture.paiements.length > 0 ? `
      <div class="section-title">Historique des paiements</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Montant</th>
            <th>Méthode</th>
            <th>Référence</th>
            <th>Enregistré par</th>
          </tr>
        </thead>
        <tbody>
          ${facture.paiements.map((p) => `
          <tr>
            <td>${new Date(p.date).toLocaleDateString("fr-FR")}</td>
            <td style="font-weight:600;color:#059669">${formatMoney(p.montant, p.devise)}</td>
            <td style="text-transform:capitalize">${p.methode}</td>
            <td>${p.reference ?? "—"}</td>
            <td>${p.enregistrePar?.name ?? "—"}</td>
          </tr>
          `).join("")}
        </tbody>
      </table>
      ` : ""}
    </div>

    <div class="footer">
      <div class="signature">
        <div class="signature-line">Cachet & Signature</div>
      </div>
      <div class="stamp">
        EcolPro — Facture générée le ${new Date().toLocaleDateString("fr-FR")}
      </div>
    </div>
  </div>
  <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("[API/factures/:id/pdf]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
