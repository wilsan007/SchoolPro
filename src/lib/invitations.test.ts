import { describe, it, expect } from "vitest";
import {
  INVITATION_TTL_HOURS,
  INVITABLE_ROLES,
  dateExpiration,
  etatInvitation,
  generateInvitationToken,
  hashInvitationToken,
  isInvitableRole,
  memeEmpreinte,
  normaliserEmailInvitation,
  peutEtreAcceptee,
  urlInvitation,
} from "@/lib/invitations";

// ============================================================
// Jeton
// ============================================================
describe("generateInvitationToken", () => {
  it("produit un jeton aléatoire et son empreinte, jamais égales", () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token).not.toBe(tokenHash);
    expect(tokenHash).toBe(hashInvitationToken(token));
    // SHA-256 en hexadécimal.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ne produit jamais deux fois le même jeton (256 bits d'entropie)", () => {
    const jetons = new Set(
      Array.from({ length: 200 }, () => generateInvitationToken().token)
    );
    expect(jetons.size).toBe(200);
  });

  it("encode le jeton en base64url (donc utilisable dans une URL sans échappement)", () => {
    const { token } = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("l'empreinte est stable, et deux jetons différents ne la partagent pas", () => {
    expect(hashInvitationToken("abc")).toBe(hashInvitationToken("abc"));
    expect(hashInvitationToken("abc")).not.toBe(hashInvitationToken("abd"));
  });
});

describe("memeEmpreinte", () => {
  it("reconnaît deux empreintes identiques", () => {
    const h = hashInvitationToken("jeton");
    expect(memeEmpreinte(h, h)).toBe(true);
  });

  it("renvoie false (sans lever) quand les longueurs diffèrent", () => {
    // `timingSafeEqual` lèverait : le rôle de ce test est de figer le fait
    // qu'on renvoie « non » au lieu de planter.
    expect(memeEmpreinte("court", "beaucouppluslong")).toBe(false);
    expect(memeEmpreinte("", "abc")).toBe(false);
  });

  it("renvoie false pour deux empreintes de même longueur mais différentes", () => {
    const a = hashInvitationToken("un");
    const b = hashInvitationToken("deux");
    expect(memeEmpreinte(a, b)).toBe(false);
  });
});

// ============================================================
// Expiration et état
// ============================================================
describe("dateExpiration", () => {
  it("ajoute la durée de validité à l'instant d'émission", () => {
    const maintenant = new Date("2026-09-29T10:00:00Z");
    expect(dateExpiration(maintenant).toISOString()).toBe("2026-10-02T10:00:00.000Z");
    expect(INVITATION_TTL_HOURS).toBe(72);
  });
});

describe("etatInvitation", () => {
  const maintenant = new Date("2026-09-29T10:00:00Z");
  const base = {
    status: "PENDING" as const,
    expiresAt: new Date("2026-09-30T10:00:00Z"),
    acceptedAt: null,
    revokedAt: null,
  };

  it("une invitation en attente et non expirée est valide", () => {
    expect(etatInvitation(base, maintenant)).toBe("VALIDE");
    expect(peutEtreAcceptee(base, maintenant)).toBe(true);
  });

  it("une invitation dont l'expiration est passée est EXPIREE", () => {
    expect(
      etatInvitation({ ...base, expiresAt: new Date("2026-09-29T09:59:59Z") }, maintenant)
    ).toBe("EXPIREE");
    // À la seconde près : l'égalité est déjà expirée.
    expect(etatInvitation({ ...base, expiresAt: maintenant }, maintenant)).toBe("EXPIREE");
  });

  it("une invitation acceptée ne redevient jamais valide", () => {
    expect(
      etatInvitation({ ...base, status: "ACCEPTED", acceptedAt: maintenant }, maintenant)
    ).toBe("DEJA_ACCEPTEE");
  });

  it("la révocation prime sur l'expiration (décision explicite)", () => {
    expect(
      etatInvitation(
        {
          ...base,
          status: "REVOKED",
          revokedAt: maintenant,
          expiresAt: new Date("2026-09-29T09:00:00Z"),
        },
        maintenant
      )
    ).toBe("REVOQUEE");
  });

  it("le statut suffit, même sans horodatage correspondant", () => {
    expect(etatInvitation({ ...base, status: "REVOKED" }, maintenant)).toBe("REVOQUEE");
    expect(etatInvitation({ ...base, status: "ACCEPTED" }, maintenant)).toBe("DEJA_ACCEPTEE");
    expect(etatInvitation({ ...base, status: "EXPIRED" }, maintenant)).toBe("VALIDE");
  });
});

// ============================================================
// Rôles et URL
// ============================================================
describe("isInvitableRole", () => {
  it("accepte les rôles de personnel et les parents", () => {
    for (const role of INVITABLE_ROLES) expect(isInvitableRole(role)).toBe(true);
  });

  it("refuse SUPER_ADMIN et STUDENT (voir la justification du module)", () => {
    expect(isInvitableRole("SUPER_ADMIN")).toBe(false);
    expect(isInvitableRole("STUDENT")).toBe(false);
    expect(isInvitableRole("ROLE_INEXISTANT")).toBe(false);
  });
});

describe("urlInvitation", () => {
  it("compose l'URL publique et échappe le jeton", () => {
    expect(urlInvitation("abc", "https://ecolpro.app")).toBe(
      "https://ecolpro.app/accept-invitation?token=abc"
    );
    // Un jeton base64url n'a pas besoin d'échappement, mais un slash final
    // d'origine ne doit pas produire de double slash.
    expect(urlInvitation("a/b", "https://ecolpro.app/")).toBe(
      "https://ecolpro.app/accept-invitation?token=a%2Fb"
    );
  });
});

describe("normaliserEmailInvitation", () => {
  it("ignore casse et espaces, pour ne pas créer de faux doublons", () => {
    expect(normaliserEmailInvitation("  Direction@Ecole.DJ ")).toBe("direction@ecole.dj");
    expect(normaliserEmailInvitation("a@b.c")).toBe(normaliserEmailInvitation("A@B.C"));
  });
});