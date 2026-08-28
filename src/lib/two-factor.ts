/**
 * Service 2FA/TOTP — authentification à deux facteurs.
 *
 * Utilise otpauth pour générer et vérifier les codes TOTP.
 * Le secret est stocké chiffré en base (chiffrement symétrique AES-256-GCM
 * avec une clé dérivée de TWO_FACTOR_SECRET env var).
 *
 * Flux :
 *   1. setup2FA(userId) → génère un secret, retourne QR code URI
 *   2. verify2FA(userId, token) → vérifie le token, active 2FA si correct
 *   3. verifyBackupCode(userId, code) → vérifie un code de secours
 *   4. disable2FA(userId) → désactive 2FA et supprime le secret
 */

import { Secret, TOTP, URI } from "otpauth";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import prisma from "@/lib/prisma";

const ISSUER = "EcolPro";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 16;

/** Récupère la clé de chiffrement depuis l'env, dérivée avec un sel par secret. */
function getEncryptionKey(salt: Buffer): Buffer {
  const secret = process.env.TWO_FACTOR_SECRET;
  if (!secret) {
    throw new Error(
      "TWO_FACTOR_SECRET manquant dans les variables d'environnement"
    );
  }
  return scryptSync(secret, salt, KEY_LENGTH);
}

/** Chiffre un secret TOTP avec un sel aléatoire unique. */
function chiffrerSecret(secretBase32: string): { chiffre: string; iv: string } {
  const salt = randomBytes(SALT_LENGTH);
  const key = getEncryptionKey(salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secretBase32, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: salt + tag + encrypted, encodé en base64
  return {
    chiffre: Buffer.concat([salt, tag, encrypted]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

/** Déchiffre un secret TOTP (extrait le sel du préfixe). */
function dechiffrerSecret(chiffre: string, iv: string): string {
  const data = Buffer.from(chiffre, "base64");
  const salt = data.subarray(0, SALT_LENGTH);
  const tag = data.subarray(SALT_LENGTH, SALT_LENGTH + 16);
  const encrypted = data.subarray(SALT_LENGTH + 16);
  const key = getEncryptionKey(salt);
  const ivBuf = Buffer.from(iv, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf-8"
  );
}

/** Génère un nouveau secret TOTP pour un utilisateur. */
function genererSecret(email: string): Secret {
  return new Secret({ size: 20 });
}

/** Crée une instance TOTP configurée. */
function creerTOTP(secret: Secret | string, email: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA256",
    digits: 6,
    period: 30,
    secret,
  });
}

export interface Setup2FAResult {
  qrCodeUri: string;
  secretBase32: string;
  backupCodes: string[];
}

/**
 * Étape 1 : génère un secret TOTP, le stocke chiffré (non encore vérifié),
 * et retourne l'URI du QR code + les codes de secours.
 */
export async function setup2FA(userId: string): Promise<Setup2FAResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const secret = genererSecret(user.email);
  const totp = creerTOTP(secret, user.email);
  const qrCodeUri = URI.stringify(totp);

  // Chiffrer le secret
  const { chiffre, iv } = chiffrerSecret(secret.base32);

  // Générer 10 codes de secours
  const backupCodes = genererBackupCodes();

  // Stocker le secret (non vérifié) — twoFactorEnabled reste false
  // jusqu'à la vérification
  // eslint-disable-next-line ecolpro/require-tenant-id -- 2FA agit sur l'utilisateur authentifié, pas de scope tenant
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: chiffre,
      totpSecretIv: iv,
      backupCodes: backupCodes.map(hasherBackupCode),
    },
  });

  return {
    qrCodeUri,
    secretBase32: secret.base32,
    backupCodes,
  };
}

/**
 * Étape 2 : vérifie le token TOTP fourni par l'utilisateur.
 * Si correct, active définitivement le 2FA.
 */
export async function verify2FA(
  userId: string,
  token: string
): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!user.totpSecret || !user.totpSecretIv) {
    return false;
  }

  const secretBase32 = dechiffrerSecret(user.totpSecret, user.totpSecretIv);
  const totp = creerTOTP(secretBase32, user.email);

  const delta = totp.validate({ token, window: 1 });
  if (delta === null) {
    return false;
  }

  // Activer le 2FA
  // eslint-disable-next-line ecolpro/require-tenant-id -- 2FA agit sur l'utilisateur authentifié, pas de scope tenant
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorVerifiedAt: new Date(),
    },
  });

  return true;
}

/**
 * Vérifie un code de secours. Si correct, le retire de la liste
 * (usage unique).
 */
export async function verifyBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const hashedCode = hasherBackupCode(code);

  const index = user.backupCodes.indexOf(hashedCode);
  if (index === -1) {
    return false;
  }

  // Retirer le code utilisé
  const nouveauxCodes = [...user.backupCodes];
  nouveauxCodes.splice(index, 1);

  // eslint-disable-next-line ecolpro/require-tenant-id -- 2FA agit sur l'utilisateur authentifié, pas de scope tenant
  await prisma.user.update({
    where: { id: userId },
    data: { backupCodes: nouveauxCodes },
  });

  return true;
}

/**
 * Désactive le 2FA pour un utilisateur.
 */
export async function disable2FA(userId: string): Promise<void> {
  // eslint-disable-next-line ecolpro/require-tenant-id -- 2FA agit sur l'utilisateur authentifié, pas de scope tenant
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      totpSecret: null,
      totpSecretIv: null,
      backupCodes: [],
      twoFactorVerifiedAt: null,
    },
  });
}

/**
 * Vérifie un code de double authentification À LA CONNEXION.
 *
 * Distincte de `verify2FA`, qui sert à l'ACTIVATION et met
 * `twoFactorEnabled` à true en cas de succès : appelée à la connexion,
 * elle activerait le 2FA d'un utilisateur qui ne l'a jamais configuré.
 * Ici, on vérifie sans jamais rien activer.
 *
 * Accepte indifféremment un code TOTP à 6 chiffres ou un code de secours
 * au format XXXX-XXXX — un utilisateur qui a perdu son téléphone doit
 * pouvoir entrer dans l'application, pas ouvrir un ticket.
 *
 * @returns true si le code est valide.
 */
export async function verifierCodeConnexion(
  userId: string,
  code: string
): Promise<boolean> {
  const propre = code.trim().toUpperCase();

  // Un code de secours contient un tiret ; un code TOTP n'a que 6 chiffres.
  if (propre.includes("-")) {
    const ok = await verifyBackupCode(userId, propre);
    if (ok) await marquerVerification(userId);
    return ok;
  }

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- connexion : aucune session n'existe encore, l'utilisateur est identifié par son mot de passe déjà validé
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, totpSecret: true, totpSecretIv: true },
  });
  if (!user?.totpSecret || !user.totpSecretIv) return false;

  const secretBase32 = dechiffrerSecret(user.totpSecret, user.totpSecretIv);
  const totp = creerTOTP(secretBase32, user.email);

  // window: 1 tolère un décalage d'horloge d'une période (±30 s). Au-delà,
  // on refuse : élargir la fenêtre allonge d'autant la durée de validité
  // d'un code intercepté.
  if (totp.validate({ token: propre, window: 1 }) === null) return false;

  await marquerVerification(userId);
  return true;
}

async function marquerVerification(userId: string): Promise<void> {
  // eslint-disable-next-line ecolpro/require-tenant-id -- 2FA agit sur l'utilisateur authentifié
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorVerifiedAt: new Date() },
  });
}

/**
 * Vérifie si le 2FA est requis pour un utilisateur donné.
 * Utilisé par le middleware d'authentification.
 */
export async function twoFactorRequis(userId: string): Promise<boolean> {
  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- 2FA agit sur l'utilisateur authentifié
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });
  return user?.twoFactorEnabled ?? false;
}

// ============================================================
// CODES DE SECOURS
// ============================================================

/** Génère 10 codes de secours au format XXXX-XXXX. */
function genererBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const bytes = randomBytes(4);
    const hex = bytes.toString("hex").toUpperCase();
    codes.push(`${hex.substring(0, 4)}-${hex.substring(4, 8)}`);
  }
  return codes;
}

/** Hash un code de secours pour le stockage (jamais en clair). */
function hasherBackupCode(code: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = getEncryptionKey(salt);
  // Inclure le sel dans le hash pour permettre la vérification
  return salt.toString("base64") + ":" + scryptSync(code, key.subarray(0, 16), 32).toString("base64");
}
