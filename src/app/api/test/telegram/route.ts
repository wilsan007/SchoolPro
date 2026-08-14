import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendTelegramMessage, sendAbsenceTelegram, sendRetardTelegram, getTelegramUpdates } from "@/lib/notifications/telegram";
import { z } from "zod";
import { erreurJson } from "@/lib/erreurs-api";

const TestSchema = z.object({
  chatId: z.string().min(1),
  type: z.enum(["test", "absence", "retard"]).default("test"),
  eleveNom: z.string().optional(),
  ecoleNom: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  const url = new URL(req.url);
  const step = url.searchParams.get("step");

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN?.includes("xxxx");

  if (step === "chatid") {
    // Récupérer les chat_id des utilisateurs qui ont écrit au bot
    const updates = await getTelegramUpdates();
    return NextResponse.json({
      ...updates,
      tokenConfigured: hasToken,
      botInfo: hasToken ? {
        username: "Voir @BotFather",
        tokenStatus: "✅ Configuré",
      } : {
        tokenStatus: "❌ Manquant — configurez TELEGRAM_BOT_TOKEN",
      },
      instructions: hasToken
        ? "Envoyez /start au bot depuis Telegram, puis rechargez cette page pour voir votre chat_id"
        : "Configurez TELEGRAM_BOT_TOKEN dans .env.local puis redémarrez le serveur",
    });
  }

  // Statut par défaut
  return NextResponse.json({
    token: hasToken ? "✅ Configuré" : "❌ Manquant — simulation active",
    botToken: process.env.TELEGRAM_BOT_TOKEN ? "✅ Présent" : "❌ Absent",
    instructions: {
      step1: "1. Ouvrez Telegram et cherchez @BotFather",
      step2: "2. Envoyez /newbot et suivez les instructions pour créer un bot",
      step3: "3. Copiez le token fourni par BotFather",
      step4: "4. Ajoutez TELEGRAM_BOT_TOKEN=votre_token dans .env.local",
      step5: "5. Redémarrez le serveur",
      step6: "6. Ouvrez votre bot dans Telegram et envoyez /start",
      step7: "7. Appelez /api/test/telegram?step=chatid pour récupérer votre chat_id",
      step8: "8. Utilisez ce chat_id pour envoyer un message de test",
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return erreurJson("NON_AUTORISE");
  }

  const body = await req.json();
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) {
    return erreurJson("DONNEES_INVALIDES", undefined, { details: parsed.error.flatten() });
  }

  const { chatId, type, eleveNom, ecoleNom } = parsed.data;
  const nom = ecoleNom ?? "EcolPro Test";
  const eleve = eleveNom ?? "Élève Test";
  const date = new Date().toLocaleDateString("fr-FR");

  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN?.includes("xxxx");

  let result;
  switch (type) {
    case "absence":
      result = await sendAbsenceTelegram(chatId, eleve, date, nom);
      break;
    case "retard":
      result = await sendRetardTelegram(chatId, eleve, date, nom);
      break;
    case "test":
    default:
      result = await sendTelegramMessage(
        chatId,
        `🎓 *${nom}*\n\nCeci est un message de test depuis EcolPro.\n\nSi vous recevez ce message, l'intégration Telegram fonctionne correctement ! ✅\n\n— EcolPro`
      );
      break;
  }

  return NextResponse.json({
    success: result.success,
    messageId: result.messageId,
    chatId: result.chatId,
    error: result.error,
    simulated: !hasToken,
    config: {
      botToken: hasToken ? "✅ Configuré" : "❌ Manquant (simulation)",
    },
    sentTo: chatId,
    type,
  });
}
