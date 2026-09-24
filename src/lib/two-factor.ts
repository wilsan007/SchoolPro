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
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import QRCode from "qrcode";
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

/**
 * Déchiffre un secret TOTP sans jamais lever.
 *
 * Un `TWO_FACTOR_SECRET` changé (ou une valeur altérée en base) rend le
 * secret illisible. Laisser l'exception remonter faisait échouer `authorize`
 * avec une erreur non gérée : un 500 et un message technique à la place d'un
 * « code incorrect », donc un compte définitivement inaccessible sans que
 * personne — ni l'utilisateur, ni les journaux — ne sache pourquoi.
 *
 * On renvoie `null` et on journalise. L'appelant refuse alors l'accès
 * (cloisonnement fermé par défaut) en laissant une trace exploitable.
 */
function dechiffrerSecretOuNull(chiffre: string, iv: string): string | null {
  try {
    return dechiffrerSecret(chiffre, iv);
  } catch (e) {
    console.error(
      "[2fa] Secret TOTP illisible — TWO_FACTOR_SECRET a-t-il été modifié ?",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/**
 * Normalise un code de second facteur : espaces, casse, tirets.
 *
 * L'utilisateur recopie ce qu'il voit à l'écran ; un espace ajouté par
 * l'auto-complétion d'un champ `one-time-code`, ou un tiret omis, ne doit pas
 * faire échouer une vérification légitime. Les codes de secours étant hashés
 * sous leur forme canonique `XXXX-XXXX`, on accepte les trois écritures pour
 * rester compatible avec les codes déjà enregistrés par les utilisateurs.
 */
function variantesCode(code: string): string[] {
  const brut = code.trim().toUpperCase();
  const compact = brut.replace(/[^A-Z0-9]/g, "");
  const canonique =
    compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : brut;
  return [...new Set([brut, compact, canonique])];
}

/** Forme sous laquelle un code de secours est hashé pour le stockage. */
function codeCanonique(code: string): string {
  const compact = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length === 8
    ? `${compact.slice(0, 4)}-${compact.slice(4)}`
    : code.trim().toUpperCase();
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
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
}

export interface Setup2FAResult {
  qrCodeUri: string;
  qrCodeDataUrl: string;
  secretBase32: string;
  backupCodes: string[];
}

/**
 * Étape 1 : prépare l'enregistrement du compte.
 *
 * Retourne l'URI `otpauth://` (standard TOTP), son QR code et les codes de
 * secours. Le secret est stocké chiffré mais `twoFactorEnabled` reste à
 * `false` jusqu'à ce qu'un code prouve que l'application enregistrée
 * fonctionne réellement.
 *
 * Appel idempotent : tant que le 2FA n'est pas activé, le secret déjà émis
 * est réutilisé (voir plus bas) — l'écran peut être rouvert sans invalider
 * le compte que l'utilisateur vient de scanner.
 */
export async function setup2FA(userId: string): Promise<Setup2FAResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Déjà active : régénérer un secret ici invaliderait en silence le compte
  // enregistré dans l'application d'authentification, et l'utilisateur se
  // retrouverait devant des codes refusés sans qu'aucun écran ne l'explique.
  if (user.twoFactorEnabled) {
    throw new Error(
      "La double authentification est déjà active. La désactiver avant d'enregistrer un nouveau compte."
    );
  }

  /*
   * RÉUTILISATION DU SECRET EN COURS DE CONFIGURATION
   *
   * Rouvrir cet écran — rechargement de page, second clic sur « Configurer
   * maintenant », retour depuis le téléphone — remplaçait le secret par un
   * nouveau. Le QR code affiché ensuite ne correspondait plus au compte déjà
   * scanné : tous les codes générés étaient refusés, définitivement, avec
   * pour seul message « Code incorrect. Vérifier l'heure du téléphone » —
   * une piste fausse. Tant que le 2FA n'est pas activé, on réaffiche donc le
   * MÊME secret : le compte déjà enregistré continue de fonctionner.
   */
  const secretEnAttente =
    user.totpSecret && user.totpSecretIv
      ? dechiffrerSecretOuNull(user.totpSecret, user.totpSecretIv)
      : null;

  const secretBase32 = secretEnAttente ?? genererSecret(user.email).base32;
  const totp = creerTOTP(secretBase32, user.email);
  const qrCodeUri = URI.stringify(totp);

  // Générer le QR code côté serveur (le module qrcode n'est pas bundlé client).
  // 256 px plutôt que 200 : un QR code photographié à l'écran par un téléphone
  // d'entrée de gamme doit rester décodable, or c'est le seul chemin de
  // configuration ouvert à un utilisateur qui n'a pas de second écran.
  const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUri, {
    width: 256,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  // Chiffrer le secret
  const { chiffre, iv } = chiffrerSecret(secretBase32);

  // Générer 10 codes de secours. Ils sont régénérés à chaque appel : seuls
  // leurs hachés sont stockés, les précédents ne sont donc pas réaffichables —
  // l'écran indique à l'utilisateur que le dernier jeu affiché fait foi.
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
    qrCodeDataUrl,
    secretBase32,
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

  const secretBase32 = dechiffrerSecretOuNull(user.totpSecret, user.totpSecretIv);
  if (!secretBase32) return false;

  const totp = creerTOTP(secretBase32, user.email);

  // Même normalisation qu'à la connexion (`verifierCodeConnexion`) : un code
  // recopié avec une espace — auto-complétion `one-time-code` d'un clavier
  // mobile — doit être accepté ici comme il l'est à la connexion. Sans cela,
  // l'activation échouait alors que le même code ouvrait ensuite la session.
  const chiffres = token.trim().replace(/\s+/g, "");
  const delta = totp.validate({ token: chiffres, window: 2 });
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
 *
 * LE BUG QUE CE CODE CORRIGE
 * Ce qui suit s'est contenté trop longtemps de ceci :
 *     const index = user.backupCodes.indexOf(hasherBackupCode(code));
 * Or `hasherBackupCode` tire un SEL ALÉATOIRE à chaque appel : le haché
 * recalculé ne pouvait donc jamais être égal à celui stocké. Tous les codes
 * de secours affichés au moment de la configuration étaient refusés, à
 * jamais — la sortie de secours du second facteur, celle qui existe
 * précisément pour un téléphone perdu, ne s'ouvrait sur rien. D'où
 * « impossible de passer la double vérification ».
 *
 * Le sel est stocké dans l'entrée (`sel:hash`) : on le relit donc pour
 * recalculer le haché, et la comparaison se fait en temps constant.
 */
export async function verifyBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Rejeter d'emblée ce qui n'a pas la forme d'un code de secours (8
  // caractères alphanumériques, tiret optionnel). Sans ce filtre, chaque faute
  // de frappe payait une dérivation scrypt par entrée stockée — dix entrées,
  // soit plus d'une seconde d'attente pour un « 123456 » saisi par erreur.
  // Chaque dérivation restante est en revanche voulue : c'est elle qui rend
  // une attaque par force brute sur les 32 bits d'un code inexploitable.
  const propre = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(propre.replace(/[^A-Z0-9]/g, ""))) {
    return false;
  }

  const index = user.backupCodes.findIndex((entree) =>
    codeCorrespond(propre, entree)
  );
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
  // Un code TOTP ne contient que des chiffres ; tout le reste est un code de
  // secours (XXXX-XXXX), même recopié sans tiret ou en minuscules. L'ancien
  // test `includes("-")` envoyait un code de secours sans tiret vers la
  // vérification TOTP, où il ne pouvait qu'échouer.
  const chiffres = propre.replace(/\s+/g, "");

  if (!/^\d{6}$/.test(chiffres)) {
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

  const secretBase32 = dechiffrerSecretOuNull(user.totpSecret, user.totpSecretIv);
  if (!secretBase32) return false;

  const totp = creerTOTP(secretBase32, user.email);

  // window: 2 tolère un décalage d'horloge de deux périodes (±60 s). Au-delà,
  // on refuse : élargir la fenêtre allonge d'autant la durée de validité
  // d'un code intercepté.
  if (totp.validate({ token: chiffres, window: 2 }) === null) return false;

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

/**
 * Hash un code de secours pour le stockage (jamais en clair).
 *
 * Format `sel:hash` — le sel voyage AVEC l'empreinte. C'est ce qui permet de
 * vérifier plus tard, sans pouvoir remonter au code : voir `codeCorrespond`.
 */
function hasherBackupCode(code: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = getEncryptionKey(salt);
  // Inclure le sel dans le hash pour permettre la vérification
  return (
    salt.toString("base64") +
    ":" +
    scryptSync(codeCanonique(code), key.subarray(0, 16), 32).toString("base64")
  );
}

/**
 * Le code saisi correspond-il à une entrée stockée (`sel:hash`) ?
 *
 * Le sel est relu depuis l'entrée : c'est la seule façon de recalculer le
 * haché à l'identique. Comparaison en temps constant — un `===` sur des
 * chaînes s'arrête au premier caractère différent, ce qui laisse mesurer
 * combien de caractères devinés sont justes.
 */
function codeCorrespond(code: string, entree: string): boolean {
  const separateur = entree.indexOf(":");
  if (separateur <= 0) return false;

  const salt = Buffer.from(entree.slice(0, separateur), "base64");
  const attendu = Buffer.from(entree.slice(separateur + 1), "base64");
  if (salt.length === 0 || attendu.length === 0) return false;

  const key = getEncryptionKey(salt);
  return variantesCode(code).some((variante) => {
    const calcule = scryptSync(variante, key.subarray(0, 16), 32);
    return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
  });
}
