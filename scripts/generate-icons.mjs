/**
 * Génère les icônes PWA et natives pour EcolPro.
 * Utilise sharp (déjà installé) pour convertir un SVG en PNG aux tailles requises.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicIcons = join(__dirname, "..", "public", "icons");
mkdirSync(publicIcons, { recursive: true });

// Logo EcolPro — SVG vectoriel (fond indigo + "E" blanc)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <text x="256" y="340" font-family="Arial, sans-serif" font-size="280" font-weight="bold"
        fill="white" text-anchor="middle">E</text>
  <circle cx="380" cy="140" r="28" fill="#fbbf24"/>
  <path d="M120 380 Q 256 420 392 380" stroke="white" stroke-width="8" fill="none" opacity="0.3" stroke-linecap="round"/>
</svg>`;

const sizes = [72, 96, 128, 144, 192, 512];

// Icône principale (avec fond arrondi)
for (const size of sizes) {
  await sharp(Buffer.from(logoSvg))
    .resize(size, size)
    .png()
    .toFile(join(publicIcons, `icon-${size}x${size}.png`));
  console.log(`✓ icon-${size}x${size}.png`);
}

// Icône maskable (avec padding pour safe zone)
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="320" font-family="Arial, sans-serif" font-size="220" font-weight="bold"
        fill="white" text-anchor="middle">E</text>
  <circle cx="370" cy="160" r="24" fill="#fbbf24"/>
</svg>`;

await sharp(Buffer.from(maskableSvg))
  .resize(512, 512)
  .png()
  .toFile(join(publicIcons, "icon-512x512.png"));
console.log("✓ icon-512x512.png (maskable)");

// Favicon
await sharp(Buffer.from(logoSvg))
  .resize(32, 32)
  .png()
  .toFile(join(__dirname, "..", "public", "favicon-32.png"));
console.log("✓ favicon-32.png");

// Apple touch icon
await sharp(Buffer.from(logoSvg))
  .resize(180, 180)
  .png()
  .toFile(join(publicIcons, "apple-touch-icon.png"));
console.log("✓ apple-touch-icon.png");

// Screenshot placeholder (simple fond gradient avec texte)
const screenshotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="390" height="844" fill="url(#bg)"/>
  <text x="195" y="400" font-family="Arial, sans-serif" font-size="48" font-weight="bold"
        fill="white" text-anchor="middle">EcolPro</text>
  <text x="195" y="450" font-family="Arial, sans-serif" font-size="20"
        fill="white" text-anchor="middle" opacity="0.8">Gestion Scolaire</text>
</svg>`;

await sharp(Buffer.from(screenshotSvg))
  .png()
  .toFile(join(publicIcons, "screenshot-mobile.png"));
console.log("✓ screenshot-mobile.png");

console.log("\n✅ Toutes les icônes générées dans public/icons/");
