/**
 * EcolPro — Intégration WhatsApp Business Cloud API
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Variables d'environnement :
 *   WHATSAPP_API_TOKEN=EAAB...        (token d'accès permanent)
 *   WHATSAPP_PHONE_NUMBER_ID=123...   (ID du numéro WhatsApp Business)
 *   WHATSAPP_BUSINESS_ID=123...       (ID du compte business, optionnel)
 *
 * Si le token est absent, l'envoi est simulé (utile en dev / sandbox).
 */

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const API_BASE = "https://graph.facebook.com/v18.0";

/**
 * Normalise un numéro de téléphone au format international (sans +, sans espaces).
 * Ajoute le préfixe + si manquant. Pour Djibouti (+253), Sénégal (+221), etc.
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);
  // Si le numéro commence par un indicatif connu, on le garde
  // Sinon on suppose qu'il est local et on ajoute +253 (Djibouti) par défaut
  const knownPrefixes = ["253", "221", "225", "237", "223", "227", "228"];
  const startsWithKnown = knownPrefixes.some((p) => cleaned.startsWith(p));
  if (!startsWithKnown && cleaned.length <= 8) {
    cleaned = "253" + cleaned;
  }
  return cleaned;
}

/**
 * Envoie un message WhatsApp texte à un numéro.
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId || token.includes("xxxx")) {
    console.warn(`[WhatsApp] Token manquant — simulation (à: ${to})`);
    return { success: true, messageId: "sim_" + Date.now() };
  }

  const normalizedTo = normalizePhone(to);

  try {
    const res = await fetch(`${API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        type: "text",
        text: {
          body: message,
          preview_url: false,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp] Erreur API:", data);
      return { success: false, error: data.error?.message ?? "Erreur API WhatsApp" };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[WhatsApp] Erreur réseau:", err);
    return { success: false, error: "Erreur réseau" };
  }
}

/**
 * Envoie une alerte d'absence à un parent via WhatsApp.
 */
export async function sendAbsenceWhatsApp(
  parentPhone: string,
  eleveNom: string,
  date: string,
  ecoleNom: string
): Promise<WhatsAppResult> {
  const message = `🎓 *${ecoleNom}*\n\nBonjour,\n\nNous vous informons que *${eleveNom}* a été signalé(e) absent(e) le ${date}.\n\nVeuillez contacter l'établissement pour régulariser cette absence.\n\n— EcolPro`;
  return sendWhatsAppMessage(parentPhone, message);
}

/**
 * Envoie une notification de retard à un parent via WhatsApp.
 */
export async function sendRetardWhatsApp(
  parentPhone: string,
  eleveNom: string,
  date: string,
  ecoleNom: string
): Promise<WhatsAppResult> {
  const message = `🎓 *${ecoleNom}*\n\nBonjour,\n\nNous vous informons que *${eleveNom}* a été signalé(e) en retard le ${date}.\n\nVeuillez contacter l'établissement pour plus d'informations.\n\n— EcolPro`;
  return sendWhatsAppMessage(parentPhone, message);
}

/**
 * Envoie une notification de bulletin publié.
 */
export async function sendBulletinWhatsApp(
  parentPhone: string,
  eleveNom: string,
  moyenne: number,
  periode: string,
  ecoleNom: string
): Promise<WhatsAppResult> {
  const message = `🎓 *${ecoleNom}*\n\nLes résultats de *${eleveNom}* pour le ${periode} sont disponibles.\n\n📊 Moyenne : ${moyenne.toFixed(2)}/20\n\nConnectez-vous sur EcolPro pour consulter le bulletin complet.\n\n— EcolPro`;
  return sendWhatsAppMessage(parentPhone, message);
}

/**
 * Envoie une notification de paiement reçu.
 */
export async function sendPaymentWhatsApp(
  parentPhone: string,
  eleveNom: string,
  montant: number,
  devise: string,
  factureNumero: string,
  ecoleNom: string
): Promise<WhatsAppResult> {
  const message = `🎓 *${ecoleNom}*\n\nPaiement reçu pour *${eleveNom}*.\n\n💰 Montant : ${montant.toLocaleString()} ${devise}\n📄 Facture : ${factureNumero}\n\nMerci pour votre règlement.\n\n— EcolPro`;
  return sendWhatsAppMessage(parentPhone, message);
}
