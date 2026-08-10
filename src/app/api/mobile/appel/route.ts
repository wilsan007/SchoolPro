import { NextRequest, NextResponse } from "next/server";
import { verifyMobileScope, mobileUnauthorized } from "@/lib/mobile-auth";
import prisma from "@/lib/prisma";
import { sendAbsenceAlert } from "@/lib/sms/africasTalking";
import { sendEmail, renderNotificationEmail } from "@/lib/notifications/email";
import { sendAbsenceWhatsApp } from "@/lib/notifications/whatsapp";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidateTag } from "next/cache";

export async function POST(req: NextRequest) {
  const user = await verifyMobileScope(req);
  if (!user) return mobileUnauthorized();
  if (!user.tenantId) {
    return NextResponse.json({ error: "Aucun établissement associé" }, { status: 403 });
  }

  if (user.role !== "TEACHER" && user.role !== "CLASS_TEACHER" && user.role !== "PRINCIPAL" && user.role !== "TENANT_ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const body = await req.json();
  const { classeId, date, presences } = body;

  if (!classeId || !date || !presences) {
    return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
  }

  const appelDate = new Date(date);
  const dateStr = appelDate.toISOString().split("T")[0];

  // La classe doit appartenir au tenant ET au périmètre de sites de l'appelant.
  const classe = await prisma.classe.findFirst({
    where: { id: classeId, tenantId: user.tenantId, ...siteFilterForModel("classe", user) },
    select: { id: true, nom: true },
  });

  if (!classe) {
    return NextResponse.json(
      { error: "Classe introuvable ou hors de votre périmètre" },
      { status: 404 }
    );
  }

  // Les identifiants d'élèves proviennent du corps de la requête et n'étaient
  // pas vérifiés : on pouvait créer des absences — et déclencher les SMS,
  // WhatsApp et e-mails aux parents — pour des élèves d'un autre site, voire
  // d'un autre établissement. Chaque élève doit appartenir à cette classe.
  const eleveIdsSaisis = Object.keys(presences as Record<string, string>);
  if (eleveIdsSaisis.length > 0) {
    const elevesValides = await prisma.eleve.findMany({
      where: {
        id: { in: eleveIdsSaisis },
        tenantId: user.tenantId,
        classeId: classe.id,
        ...siteFilterForModel("eleve", user),
      },
      select: { id: true },
    });
    if (elevesValides.length !== eleveIdsSaisis.length) {
      return NextResponse.json(
        { error: "Un ou plusieurs élèves n'appartiennent pas à cette classe" },
        { status: 403 }
      );
    }
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { name: true },
  });
  const ecoleNom = tenant?.name ?? "EcolPro";

  const absentEleveIds = Object.entries(presences as Record<string, string>)
    .filter(([, status]) => status !== "present")
    .map(([eleveId]) => eleveId);

  let created = 0;
  let notifSent = 0;

  for (const [eleveId, status] of Object.entries(presences as Record<string, string>)) {
    if (status === "present") continue;

    const absenceId = `appel-${classeId}-${eleveId}-${dateStr}`;
    const isRetard = status === "retard";

    await prisma.absence.upsert({
      where: { id: absenceId },
      create: {
        id: absenceId,
        tenantId: user.tenantId,
        eleveId,
        date: appelDate,
        isRetard,
        statut: "EN_ATTENTE",
        saisieParId: user.id,
      },
      update: {
        isRetard,
        date: appelDate,
        statut: "EN_ATTENTE",
        saisieParId: user.id,
      },
    });

    created++;
  }

  if (absentEleveIds.length > 0) {
    const dateFr = appelDate.toLocaleDateString("fr-FR");

    const eleveParents = await prisma.eleveParent.findMany({
      where: {
        eleveId: { in: absentEleveIds },
        isGardien: true,
      },
      select: {
        parent: {
          select: { id: true, nom: true, prenom: true, phone: true, email: true },
        },
        eleve: {
          select: { id: true, nom: true, prenom: true },
        },
      },
    });

    for (const ep of eleveParents) {
      const tuteur = ep.parent;
      const eleve = ep.eleve;
      if (!tuteur || !eleve) continue;
      const eleveNom = `${eleve.prenom} ${eleve.nom}`;

      if (tuteur.phone) {
        try {
          await sendAbsenceAlert(tuteur.phone, eleveNom, dateFr, ecoleNom);
          notifSent++;
        } catch (e) {
          console.error(`[Mobile Appel] SMS échoué pour ${eleveNom}:`, e);
        }
      }

      if (tuteur.phone) {
        try {
          await sendAbsenceWhatsApp(tuteur.phone, eleveNom, dateFr, ecoleNom);
          notifSent++;
        } catch (e) {
          console.error(`[Mobile Appel] WhatsApp échoué pour ${eleveNom}:`, e);
        }
      }

      if (tuteur.email) {
        try {
          const html = renderNotificationEmail(
            ecoleNom,
            "Signalement d'absence",
            `Bonjour ${tuteur.prenom} ${tuteur.nom},\n\nNous vous informons que ${eleveNom} a été signalé(e) absent(e) le ${dateFr}.\n\nVeuillez contacter l'établissement pour régulariser cette absence.\n\nCordialement,\n${ecoleNom}`
          );
          await sendEmail([tuteur.email], `[${ecoleNom}] Absence de ${eleveNom}`, html);
          notifSent++;
        } catch (e) {
          console.error(`[Mobile Appel] Email échoué pour ${eleveNom}:`, e);
        }
      }
    }
  }

  revalidateTag("dashboard-data");

  return NextResponse.json({
    success: true,
    absencesCreees: created,
    notificationsEnvoyees: notifSent,
  });
}
