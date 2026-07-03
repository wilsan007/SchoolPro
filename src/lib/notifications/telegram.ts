/**
 * EcolPro — Intégration Telegram Bot API
 * Docs: https://core.telegram.org/bots/api
 *
 * Variables d'environnement :
 *   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...   (token du bot via @BotFather)
 *
 * Pour envoyer un message à un utilisateur, il faut son chat_id.
 * L'utilisateur doit d'abord envoyer /start au bot.
 * Utilisez GET /api/test/telegram?step=chatid pour récupérer le chat_id.
 */

export interface TelegramResult {
  success: boolean;
  messageId?: number;
  chatId?: string;
  error?: string;
}

const API_BASE = "https://api.telegram.org";

/**
 * Envoie un message texte via Telegram.
 * @param chatId ID du chat (numérique) ou nom d'utilisateur (@username)
 * @param message Texte à envoyer (Markdown supporté)
 */
export async function sendTelegramMessage(
  chatId: string,
  message: string
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token.includes("xxxx")) {
    console.warn(`[Telegram] Token manquant — simulation (à: ${chatId})`);
    return { success: true, messageId: -1, chatId };
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("[Telegram] Erreur API:", data);
      return { success: false, error: data.description ?? "Erreur API Telegram" };
    }

    return {
      success: true,
      messageId: data.result?.message_id,
      chatId: data.result?.chat?.id?.toString(),
    };
  } catch (err) {
    console.error("[Telegram] Erreur réseau:", err);
    return { success: false, error: "Erreur réseau" };
  }
}

/**
 * Récupère les dernières mises à jour du bot (pour trouver les chat_id des utilisateurs
 * qui ont démarré une conversation avec le bot).
 */
export async function getTelegramUpdates(): Promise<{
  success: boolean;
  chats?: { chatId: string; username: string; firstName: string; date: string }[];
  error?: string;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token.includes("xxxx")) {
    return { success: false, error: "TELEGRAM_BOT_TOKEN non configuré" };
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/getUpdates`);
    const data = await res.json();

    if (!data.ok) {
      return { success: false, error: data.description ?? "Erreur API" };
    }

    const updates = data.result ?? [];
    const chats = updates
      .filter((u: any) => u.message?.chat)
      .map((u: any) => ({
        chatId: u.message.chat.id.toString(),
        username: u.message.chat.username ?? "",
        firstName: u.message.chat.first_name ?? "",
        date: new Date(u.message.date * 1000).toLocaleString("fr-FR"),
      }));

    // Dédupliquer par chatId
    const seen = new Set<string>();
    const unique = chats.filter((c: any) => {
      if (seen.has(c.chatId)) return false;
      seen.add(c.chatId);
      return true;
    });

    return { success: true, chats: unique };
  } catch (err) {
    console.error("[Telegram] Erreur getUpdates:", err);
    return { success: false, error: "Erreur réseau" };
  }
}

/**
 * Envoie une alerte d'absence à un parent via Telegram.
 */
export async function sendAbsenceTelegram(
  chatId: string,
  eleveNom: string,
  date: string,
  ecoleNom: string
): Promise<TelegramResult> {
  const message = `🎓 *${ecoleNom}*\n\nBonjour,\n\nNous vous informons que *${eleveNom}* a été signalé(e) absent(e) le ${date}.\n\nVeuillez contacter l'établissement pour régulariser cette absence.\n\n— EcolPro`;
  return sendTelegramMessage(chatId, message);
}

/**
 * Envoie une notification de retard via Telegram.
 */
export async function sendRetardTelegram(
  chatId: string,
  eleveNom: string,
  date: string,
  ecoleNom: string
): Promise<TelegramResult> {
  const message = `🎓 *${ecoleNom}*\n\nBonjour,\n\nNous vous informons que *${eleveNom}* a été signalé(e) en retard le ${date}.\n\nVeuillez contacter l'établissement pour plus d'informations.\n\n— EcolPro`;
  return sendTelegramMessage(chatId, message);
}
