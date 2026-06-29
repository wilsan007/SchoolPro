/**
 * EcolPro — Intégration Africa's Talking SMS
 * Docs: https://developers.africastalking.com/docs/sms
 *
 * Variables d'environnement requises :
 *   AT_API_KEY=your_api_key
 *   AT_USERNAME=your_username
 *   AT_SENDER_ID=EcolPro   (optionnel, selon pays)
 */

const AT_BASE = "https://api.africastalking.com/version1";
const AT_SANDBOX = "https://api.sandbox.africastalking.com/version1";

const isProduction = process.env.NODE_ENV === "production";
const baseURL = isProduction ? AT_BASE : AT_SANDBOX;

export interface SMSResult {
  success: boolean;
  messageId?: string;
  cost?: string;
  error?: string;
}

/**
 * Envoie un SMS via Africa's Talking
 */
export async function sendSMS(
  to: string | string[],
  message: string,
  senderId?: string
): Promise<SMSResult> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    console.warn("[SMS] Variables AT_API_KEY / AT_USERNAME manquantes — simulation");
    return {
      success: true,
      messageId: `SIM-${Date.now()}`,
      cost: "0",
    };
  }

  const recipients = Array.isArray(to) ? to.join(",") : to;

  try {
    const body = new URLSearchParams({
      username,
      to: recipients,
      message,
      ...(senderId ? { from: senderId } : {}),
    });

    const res = await fetch(`${baseURL}/messaging`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey,
      },
      body: body.toString(),
    });

    const data = await res.json();
    const recipient = data.SMSMessageData?.Recipients?.[0];

    if (recipient?.statusCode === 101) {
      return {
        success: true,
        messageId: recipient.messageId,
        cost: recipient.cost,
      };
    }

    return { success: false, error: recipient?.status ?? "Erreur inconnue" };
  } catch (err) {
    console.error("[SMS] Erreur envoi:", err);
    return { success: false, error: "Erreur réseau" };
  }
}

/**
 * Envoie une alerte d'absence à un parent
 */
export async function sendAbsenceAlert(
  parentPhone: string,
  eleveNom: string,
  date: string,
  ecoleNom: string
): Promise<SMSResult> {
  const message = `[${ecoleNom}] Absence signalée pour ${eleveNom} le ${date}. Veuillez contacter l'établissement pour régulariser. EcolPro`;
  return sendSMS(parentPhone, message, process.env.AT_SENDER_ID);
}

/**
 * Envoie les résultats de bulletin
 */
export async function sendBulletinNotif(
  parentPhone: string,
  eleveNom: string,
  moyenne: number,
  ecoleNom: string
): Promise<SMSResult> {
  const message = `[${ecoleNom}] Les résultats de ${eleveNom} sont disponibles sur EcolPro. Moyenne : ${moyenne.toFixed(2)}/20. Connectez-vous pour les consulter.`;
  return sendSMS(parentPhone, message, process.env.AT_SENDER_ID);
}
