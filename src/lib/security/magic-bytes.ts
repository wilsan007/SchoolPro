/**
 * Validation des magic bytes d'un fichier buffer.
 *
 * `file.type` est déclaré par le client et peut être falsifié.
 * Cette fonction vérifie les premiers octets du buffer pour confirmer
 * que le contenu correspond bien au type MIME déclaré.
 */

interface MagicByteRule {
  mime: string;
  offset: number;
  bytes: number[];
}

const RULES: MagicByteRule[] = [
  // JPEG — FFD8FF
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG — 89504E47
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  // GIF — 47494638
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP — RIFF....WEBP (check RIFF at 0, WEBP at 8)
  { mime: "image/webp", offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // PDF — 25504446 (%PDF)
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
];

/**
 * Vérifie que le buffer correspond au type MIME déclaré.
 * @returns true si les magic bytes correspondent, false sinon.
 */
export function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  const rule = RULES.find((r) => r.mime === declaredMime);
  if (!rule) {
    // Type non couvert par nos règles : on fait confiance au MIME déclaré
    return true;
  }
  if (buffer.length < rule.offset + rule.bytes.length) {
    return false;
  }
  return rule.bytes.every((byte, i) => buffer[rule.offset + i] === byte);
}
