import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/notifications/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, sent: 1 }),
  renderNotificationEmail: vi.fn((ecole: string, sujet: string, contenu: string) =>
    `<html>${ecole}${sujet}${contenu}</html>`
  ),
}));

import { sendEmail } from "@/lib/notifications/email";
import { onUtilisateurInvite } from "./utilisateur-invite";

const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function event(payloadOverride: Record<string, unknown> = {}) {
  return {
    id: "ev1",
    tenantId: "tenant-1",
    siteId: "site-1",
    eventType: "utilisateur.invite" as const,
    aggregateType: "User",
    aggregateId: "user-1",
    payload: {
      userId: "user-1",
      email: "nouveau@ecole.dj",
      nom: "Fatouma Ali",
      role: "TEACHER",
      siteId: "site-1",
      ecoleNom: "Cité Ambouli",
      inviteParId: "admin-1",
      dateInvitation: "2027-03-15T10:00:00Z",
      ...payloadOverride,
    },
    occurredAt: new Date(),
  };
}

describe("onUtilisateurInvite", () => {
  it("envoie un email de bienvenue sans identifiants", async () => {
    await onUtilisateurInvite(event());

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [to, sujet] = mockSend.mock.calls[0];
    expect(to).toEqual(["nouveau@ecole.dj"]);
    expect(sujet).toContain("Cité Ambouli");
    expect(sujet).toContain("compte");
    // Aucun mot de passe ne doit apparaître dans le contenu envoyé.
    const html = mockSend.mock.calls[0][2] as string;
    expect(html).not.toMatch(/mot de passe\s*:/i);
  });

  it("lève une erreur si le payload est incomplet", async () => {
    await expect(onUtilisateurInvite(event({ email: "" }))).rejects.toThrow(/incomplet/);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
