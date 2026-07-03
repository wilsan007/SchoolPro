import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { checkPermission } from "@/lib/rbac";
import { sendAbsenceAlert } from "@/lib/sms/africasTalking";
import { sendEmail, renderNotificationEmail } from "@/lib/notifications/email";
import { sendAbsenceWhatsApp, sendRetardWhatsApp } from "@/lib/notifications/whatsapp";
import { sendAbsenceTelegram, sendRetardTelegram } from "@/lib/notifications/telegram";

const AppelSchema = z.object({
  classeId: z.string().min(1),
  date: z.string().datetime(),
  presences: z.record(z.string(), z.enum(["present", "absent", "retard"])),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const denied = checkPermission(session.user.role, "absences:write");
    if (denied) return denied;

    const body = await req.json();
    const parsed = AppelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { classeId, date, presences } = parsed.data;
    const tenantId = session.user.tenantId;
    const appelDate = new Date(date);

    // Vérifier que la classe appartient au tenant
    const classe = await prisma.classe.findFirst({
      where: { id: classeId, tenantId },
    });
    if (!classe) {
      return NextResponse.json({ error: "Classe introuvable" }, { status: 404 });
    }

    // Créer les absences pour les absents et retards
    const operations = Object.entries(presences)
      .filter(([, status]) => status !== "present")
      .map(([eleveId, status]) =>
        prisma.absence.upsert({
          where: {
            id: `appel-${classeId}-${eleveId}-${appelDate.toISOString().split("T")[0]}`,
          },
          update: {
            motif: "INJUSTIFIE",
            statut: "EN_ATTENTE",
            isRetard: status === "retard",
          },
          create: {
            id: `appel-${classeId}-${eleveId}-${appelDate.toISOString().split("T")[0]}`,
            tenantId,
            eleveId,
            date: appelDate,
            motif: "INJUSTIFIE",
            statut: "EN_ATTENTE",
            isRetard: status === "retard",
            saisieParId: session.user.id,
          },
        })
      );

    await prisma.$transaction(operations);

    // Compter les absents
    const absentsCount = Object.values(presences).filter((p) => p === "absent").length;
    const retardsCount = Object.values(presences).filter((p) => p === "retard").length;

    // --- Notifications automatiques aux parents (absents + retards) ---
    const signaleEleveIds = Object.entries(presences)
      .filter(([, status]) => status === "absent" || status === "retard")
      .map(([eleveId, status]) => ({ eleveId, status: status as "absent" | "retard" }));

    let notifSent = 0;
    let notifRecorded = 0;
    if (signaleEleveIds.length > 0) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      const ecoleNom = tenant?.name ?? "EcolPro";
      const dateStr = appelDate.toLocaleDateString("fr-FR");

      // Récupérer les élèves signalés avec leurs parents (tous les parents liés, pas seulement le gardien)
      const elevesSignales = await prisma.eleve.findMany({
        where: { id: { in: signaleEleveIds.map((e) => e.eleveId) } },
        select: {
          id: true,
          nom: true,
          prenom: true,
          parents: {
            include: {
              parent: {
                select: {
                  id: true, nom: true, prenom: true,
                  phone: true, email: true, userId: true,
                  telegramChatId: true,
                },
              },
            },
          },
        },
      });

      // Toutes les notifications (enregistrement + SMS/WhatsApp/Telegram/Email) sont envoyées
      // en parallèle plutôt qu'en boucle séquentielle, pour ne pas bloquer la réponse HTTP
      // le temps de dizaines d'appels réseau successifs vers des API externes.
      type NotifTask = { kind: "record" | "sent"; run: () => Promise<void> };
      const tasks: NotifTask[] = [];

      for (const eleve of elevesSignales) {
        const statutInfo = signaleEleveIds.find((s) => s.eleveId === eleve.id);
        const isRetard = statutInfo?.status === "retard";
        const typeLabel = isRetard ? "retard" : "absence";
        const eleveNom = `${eleve.prenom} ${eleve.nom}`;

        // Préparer le contenu du message selon le type
        const titreNotif = isRetard
          ? `Retard signalé - ${eleveNom}`
          : `Absence signalée - ${eleveNom}`;
        const contenuNotif = isRetard
          ? `Bonjour,\n\nNous vous informons que ${eleveNom} a été signalé(e) en retard le ${dateStr}.\n\nVeuillez contacter l'établissement pour plus d'informations.\n\nCordialement,\n${ecoleNom}`
          : `Bonjour,\n\nNous vous informons que ${eleveNom} a été signalé(e) absent(e) le ${dateStr}.\n\nVeuillez contacter l'établissement pour régulariser cette absence.\n\nCordialement,\n${ecoleNom}`;

        // Enregistrer dans la signalétique (table Notification)
        tasks.push({
          kind: "record",
          run: async () => {
            await prisma.notification.create({
              data: {
                tenantId,
                titre: titreNotif,
                contenu: contenuNotif,
                canal: "IN_APP",
                cible: "PARENTS",
                envoyeParId: session.user.id,
                nbDestinataires: eleve.parents.length,
                nbDelivres: eleve.parents.length,
                statut: "ENVOYEE",
                envoyeeAt: new Date(),
              },
            });
          },
        });

        // Notifier chaque parent lié à l'élève
        for (const ep of eleve.parents) {
          const tuteur = ep.parent;
          if (!tuteur) continue;

          if (tuteur.phone) {
            tasks.push({
              kind: "sent",
              run: () => sendAbsenceAlert(tuteur.phone!, eleveNom, dateStr, ecoleNom).then(() => {}),
            });
            tasks.push({
              kind: "sent",
              run: () =>
                (isRetard
                  ? sendRetardWhatsApp(tuteur.phone!, eleveNom, dateStr, ecoleNom)
                  : sendAbsenceWhatsApp(tuteur.phone!, eleveNom, dateStr, ecoleNom)
                ).then(() => {}),
            });
          }

          if (tuteur.telegramChatId) {
            tasks.push({
              kind: "sent",
              run: () =>
                (isRetard
                  ? sendRetardTelegram(tuteur.telegramChatId!, eleveNom, dateStr, ecoleNom)
                  : sendAbsenceTelegram(tuteur.telegramChatId!, eleveNom, dateStr, ecoleNom)
                ).then(() => {}),
            });
          }

          if (tuteur.email) {
            tasks.push({
              kind: "sent",
              run: () => {
                const html = renderNotificationEmail(ecoleNom, titreNotif, contenuNotif);
                return sendEmail(
                  [tuteur.email!],
                  `[${ecoleNom}] ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} de ${eleveNom}`,
                  html
                ).then(() => {});
              },
            });
          }
        }
      }

      const results = await Promise.allSettled(tasks.map((t) => t.run()));
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (tasks[i].kind === "record") notifRecorded++;
          else notifSent++;
        } else {
          console.error(`[Appel] Notification (${tasks[i].kind}) échouée:`, r.reason);
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Appel enregistré : ${absentsCount} absent(s), ${retardsCount} retard(s)${notifSent > 0 ? `, ${notifSent} notification(s) envoyée(s)` : ""}${notifRecorded > 0 ? `, ${notifRecorded} notification(s) enregistrée(s)` : ""}`,
    });
  } catch (error) {
    console.error("[API/appel]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
