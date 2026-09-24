/**
 * Tests du service 2FA/TOTP.
 *
 * CE QUE CES TESTS PROTÈGENT
 * Le 2FA était configurable mais ses deux portes de sortie étaient murées :
 *   - les **codes de secours** ne pouvaient jamais être validés (le haché était
 *     re-selé aléatoirement à chaque vérification, donc jamais égal à celui
 *     stocké) ;
 *   - un second appel à `setup` remplaçait le secret en silence, et le compte
 *     déjà scanné par l'utilisateur produisait alors des codes refusés.
 * Dans les deux cas le message affiché (« Code incorrect. Vérifier l'heure du
 * téléphone ») désignait la mauvaise cause, et l'utilisateur restait bloqué
 * devant la double authentification sans issue.
 *
 * Le module `qrcode` est remplacé par un faux : en environnement jsdom il lui
 * faudrait un canvas. Ce que ces tests vérifient, c'est le secret, son
 * chiffrement et les codes — pas le rendu du PNG.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOTP } from "otpauth";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: async (contenu: string) =>
      `data:image/png;base64,${Buffer.from(contenu, "utf-8").toString("base64")}`,
  },
}));

const etat = vi.hoisted(() => ({
  user: {
    id: "u1",
    email: "directeur@ecole.dj",
    totpSecret: null as string | null,
    totpSecretIv: null as string | null,
    backupCodes: [] as string[],
    twoFactorEnabled: false,
    twoFactorVerifiedAt: null as Date | null,
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUniqueOrThrow: async () => ({ ...etat.user }),
      findUnique: async () => ({ ...etat.user }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(etat.user, data);
        return { ...etat.user };
      },
    },
  },
}));

import {
  disable2FA,
  setup2FA,
  twoFactorRequis,
  verify2FA,
  verifyBackupCode,
  verifierCodeConnexion,
} from "./two-factor";

const EMAIL = "directeur@ecole.dj";

/** Code TOTP courant pour un secret donné — ce que lit l'application. */
function codeCourant(secretBase32: string): string {
  return new TOTP({
    issuer: "EcolPro",
    label: EMAIL,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secretBase32,
  }).generate();
}

beforeEach(() => {
  process.env.TWO_FACTOR_SECRET = "cle-de-test-2fa-0123456789abcdef";
  etat.user.totpSecret = null;
  etat.user.totpSecretIv = null;
  etat.user.backupCodes = [];
  etat.user.twoFactorEnabled = false;
  etat.user.twoFactorVerifiedAt = null;
});


describe("setup2FA", () => {
  it("retourne un QR code scannable et ne stocke jamais le secret en clair", async () => {
    const resultat = await setup2FA("u1");

    // L'URI doit rester celle du format standard : c'est elle que décodent
    // Google Authenticator, Authy, Aegis ou 1Password.
    expect(resultat.qrCodeUri.startsWith("otpauth://totp/")).toBe(true);
    expect(resultat.qrCodeUri).toContain(`secret=${resultat.secretBase32}`);
    expect(resultat.qrCodeUri).toContain("algorithm=SHA1");
    expect(resultat.qrCodeUri).toContain("digits=6");
    expect(resultat.qrCodeUri).toContain("period=30");
    expect(resultat.qrCodeDataUrl.startsWith("data:image/png;base64,")).toBe(true);

    // Le secret en base est chiffré : il ne doit pas être lisible tel quel.
    expect(etat.user.totpSecret).not.toBe(resultat.secretBase32);
    expect(etat.user.totpSecretIv).toBeTruthy();
    // Rien n'est activé tant qu'un code n'a pas prouvé que l'application
    // enregistrée fonctionne.
    expect(etat.user.twoFactorEnabled).toBe(false);
    expect(resultat.backupCodes).toHaveLength(10);
  }, 30_000);

  it("réaffiche le MÊME secret quand la configuration est reprise", async () => {
    // Régression : un second clic sur « Configurer maintenant » tirait un
    // nouveau secret, donc invalidait le compte déjà scanné — codes refusés
    // pour toujours, sans qu'aucun écran ne le dise.
    const premier = await setup2FA("u1");
    const second = await setup2FA("u1");

    expect(second.secretBase32).toBe(premier.secretBase32);
    expect(second.qrCodeUri).toBe(premier.qrCodeUri);
    // Le secret du premier scan continue donc de produire des codes valides.
    expect(await verify2FA("u1", codeCourant(premier.secretBase32))).toBe(true);
  }, 30_000);

  it("refuse d'écraser une configuration déjà active", async () => {
    await setup2FA("u1");
    etat.user.twoFactorEnabled = true;

    await expect(setup2FA("u1")).rejects.toThrow(/déjà active/);
  }, 30_000);
});


describe("verify2FA — activation", () => {
  it("active le 2FA avec un code valide et tolère les espaces", async () => {
    const { secretBase32 } = await setup2FA("u1");
    const code = codeCourant(secretBase32);

    // Claviers mobiles et auto-complétion `one-time-code` insèrent une espace.
    const avecEspace = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(await verify2FA("u1", avecEspace)).toBe(true);
    expect(etat.user.twoFactorEnabled).toBe(true);
    expect(await twoFactorRequis("u1")).toBe(true);
  }, 30_000);

  it("refuse un code vide ou non numérique", async () => {
    await setup2FA("u1");
    expect(await verify2FA("u1", "")).toBe(false);
    expect(await verify2FA("u1", "ABCDEF")).toBe(false);
    expect(etat.user.twoFactorEnabled).toBe(false);
  }, 30_000);
});

describe("verifyBackupCode — la sortie de secours", () => {
  it("accepte un code affiché puis le consomme (usage unique)", async () => {
    const { backupCodes } = await setup2FA("u1");
    const code = backupCodes[0];

    expect(await verifyBackupCode("u1", code)).toBe(true);
    expect(etat.user.backupCodes).toHaveLength(9);
    // Usage unique : le même code ne doit plus rien ouvrir.
    expect(await verifyBackupCode("u1", code)).toBe(false);
  }, 30_000);

  it("accepte le code recopié sans tiret et en minuscules", async () => {
    const { backupCodes } = await setup2FA("u1");
    const sansTiret = backupCodes[1].replace("-", "").toLowerCase();

    expect(await verifyBackupCode("u1", sansTiret)).toBe(true);
  }, 30_000);

  it("refuse un code étranger sans consommer la liste", async () => {
    await setup2FA("u1");
    const avant = [...etat.user.backupCodes];

    expect(await verifyBackupCode("u1", "ZZZZ-ZZZZ")).toBe(false);
    expect(etat.user.backupCodes).toEqual(avant);
  }, 30_000);
});

describe("verifierCodeConnexion — à la connexion", () => {
  it("accepte un code TOTP", async () => {
    const { secretBase32 } = await setup2FA("u1");
    expect(await verifierCodeConnexion("u1", codeCourant(secretBase32))).toBe(true);
    expect(etat.user.twoFactorVerifiedAt).toBeInstanceOf(Date);
  }, 30_000);

  it("accepte un code de secours tapé sans tiret", async () => {
    // Régression : l'ancien routage testait la présence d'un tiret, si bien
    // qu'un code de secours recopié sans lui partait vers la vérification
    // TOTP, où il ne pouvait qu'échouer.
    const { backupCodes } = await setup2FA("u1");
    const compact = backupCodes[0].replace("-", "");

    expect(await verifierCodeConnexion("u1", compact)).toBe(true);
  }, 30_000);

  it("refuse un code invalide sans lever", async () => {
    await setup2FA("u1");
    expect(await verifierCodeConnexion("u1", "123456")).toBe(false);
    expect(await verifierCodeConnexion("u1", "")).toBe(false);
  }, 30_000);

  it("refuse sans lever si le secret stocké est illisible", async () => {
    // TWO_FACTOR_SECRET changé (ou valeur altérée) : laisser l'exception
    // remonter faisait échouer `authorize` en erreur non gérée — un 500 à la
    // place d'un « code incorrect », et personne pour comprendre le blocage.
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    await setup2FA("u1");
    etat.user.totpSecretIv = Buffer.alloc(16).toString("base64");

    expect(await verifierCodeConnexion("u1", "123456")).toBe(false);
    expect(silence).toHaveBeenCalled();
    silence.mockRestore();
  }, 30_000);
});

describe("disable2FA", () => {
  it("efface le secret, les codes et l'état d'activation", async () => {
    const { secretBase32 } = await setup2FA("u1");
    await verify2FA("u1", codeCourant(secretBase32));
    expect(etat.user.twoFactorEnabled).toBe(true);

    await disable2FA("u1");

    expect(etat.user.twoFactorEnabled).toBe(false);
    expect(etat.user.totpSecret).toBeNull();
    expect(etat.user.totpSecretIv).toBeNull();
    expect(etat.user.backupCodes).toEqual([]);
  }, 30_000);
});
