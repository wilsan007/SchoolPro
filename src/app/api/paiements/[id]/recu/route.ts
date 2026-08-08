import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-filter";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const paiement = await prisma.paiement.findUnique({
      where: { id },
      include: {
        facture: {
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
            createdBy: { select: { name: true } },
          },
        },
        enregistrePar: { select: { name: true } },
      },
    });

    if (!paiement) {
      return NextResponse.json({ error: "Paiement non trouvé" }, { status: 404 });
    }

    if (paiement.facture.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // Le contrôle de tenant seul ne suffit pas : un utilisateur rattaché au
    // site A pouvait imprimer le reçu — donc les données financières, l'élève
    // et son tuteur — d'un paiement du site B en devinant l'identifiant.
    if (!canAccessSite(session.user, paiement.facture.siteId)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const tenant = paiement.facture.tenant;
    const eleve = paiement.facture.eleve;
    const tuteur = eleve.parents[0]?.parent;
    const recuNumber = `REC-${new Date(paiement.date).getFullYear()}-${paiement.id.slice(-6).toUpperCase()}`;

    function formatMoney(amount: number, devise: string) {
      try {
        return new Intl.NumberFormat("fr-DJ", { style: "currency", currency: devise }).format(amount);
      } catch {
        return `${amount.toLocaleString("fr-DJ")} ${devise}`;
      }
    }

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reçu ${recuNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #f5f5f5; padding: 20px; }
  .receipt { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 28px 32px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header .recu-num { font-size: 14px; opacity: 0.9; }
  .school-info { padding: 20px 32px; border-bottom: 1px solid #e5e7eb; }
  .school-info h2 { font-size: 18px; font-weight: 700; color: #059669; }
  .school-info p { font-size: 13px; color: #6b7280; margin-top: 2px; }
  .body { padding: 24px 32px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
  .row .label { font-size: 13px; color: #6b7280; font-weight: 500; }
  .row .value { font-size: 13px; color: #111827; font-weight: 600; text-align: right; }
  .amount-box { margin: 20px 0; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 20px; text-align: center; }
  .amount-box .label { font-size: 12px; color: #059669; text-transform: uppercase; letter-spacing: 0.5px; }
  .amount-box .amount { font-size: 32px; font-weight: 800; color: #059669; margin-top: 4px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin: 20px 0 8px; font-weight: 600; }
  .footer { padding: 20px 32px; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-end; }
  .signature { font-size: 12px; color: #6b7280; }
  .signature-line { margin-top: 40px; border-top: 1px dashed #9ca3af; width: 180px; text-align: center; padding-top: 4px; }
  .stamp { font-size: 11px; color: #d1d5db; text-align: right; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #059669; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #047857; }
  @media print { .print-btn { display: none; } body { padding: 0; background: white; } .receipt { box-shadow: none; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div>
        <h1>REÇU DE PAIEMENT</h1>
        <div class="recu-num">N° ${recuNumber}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;opacity:0.9">${new Date(paiement.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</div>
        <div style="font-size:11px;opacity:0.7">${new Date(paiement.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
    </div>

    <div class="school-info">
      <h2>${tenant.name}</h2>
      <p>${tenant.city ?? ""}${tenant.city && tenant.country ? ", " : ""}${tenant.country}</p>
      ${tenant.email ? `<p>${tenant.email}</p>` : ""}
      ${tenant.phone ? `<p>${tenant.phone}</p>` : ""}
    </div>

    <div class="body">
      <div class="section-title">Élève</div>
      <div class="row"><span class="label">Nom & Prénom</span><span class="value">${eleve.prenom} ${eleve.nom}</span></div>
      <div class="row"><span class="label">Matricule</span><span class="value">${eleve.matricule}</span></div>
      <div class="row"><span class="label">Classe</span><span class="value">${eleve.classe?.nom ?? "N/A"} — ${eleve.classe?.niveau ?? ""}</span></div>

      ${tuteur ? `
      <div class="section-title">Tuteur légal</div>
      <div class="row"><span class="label">Nom</span><span class="value">${tuteur.prenom} ${tuteur.nom}</span></div>
      ${tuteur.phone ? `<div class="row"><span class="label">Téléphone</span><span class="value">${tuteur.phone}</span></div>` : ""}
      ` : ""}

      <div class="section-title">Détails du paiement</div>
      <div class="row"><span class="label">Facture</span><span class="value">${paiement.facture.numero}</span></div>
      <div class="row"><span class="label">Libellé</span><span class="value">${paiement.facture.libelle}</span></div>
      <div class="row"><span class="label">Méthode</span><span class="value" style="text-transform:capitalize">${paiement.methode}</span></div>
      ${paiement.reference ? `<div class="row"><span class="label">Référence</span><span class="value">${paiement.reference}</span></div>` : ""}
      ${paiement.enregistrePar ? `<div class="row"><span class="label">Enregistré par</span><span class="value">${paiement.enregistrePar.name}</span></div>` : ""}

      <div class="amount-box">
        <div class="label">Montant reçu</div>
        <div class="amount">${formatMoney(paiement.montant, paiement.devise)}</div>
      </div>
    </div>

    <div class="footer">
      <div class="signature">
        <div class="signature-line">Cachet & Signature</div>
      </div>
      <div class="stamp">
        EcolPro — Reçu généré le ${new Date().toLocaleDateString("fr-FR")}
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
    console.error("[API/paiements/:id/recu]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
