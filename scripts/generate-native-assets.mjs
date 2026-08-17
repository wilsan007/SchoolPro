/**
 * Génère les ressources natives (splash screen + icônes) pour Capacitor.
 * Place les fichiers dans mobile/www/assets/ pour référence.
 *
 * Usage: node scripts/generate-native-assets.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileAssets = join(__dirname, "..", "mobile", "www", "assets");
mkdirSync(mobileAssets, { recursive: true });

// Splash screen — fond indigo avec logo
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1242" height="2436" viewBox="0 0 1242 2436">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1242" height="2436" fill="url(#bg)"/>
  <text x="621" y="1200" font-family="Arial, sans-serif" font-size="200" font-weight="bold"
        fill="white" text-anchor="middle">E</text>
  <text x="621" y="1400" font-family="Arial, sans-serif" font-size="60" font-weight="bold"
        fill="white" text-anchor="middle">EcolPro</text>
  <text x="621" y="1480" font-family="Arial, sans-serif" font-size="32"
        fill="white" text-anchor="middle" opacity="0.7">Gestion Scolaire</text>
</svg>`;

await sharp(Buffer.from(splashSvg))
  .png()
  .toFile(join(mobileAssets, "splash.png"));
console.log("✓ splash.png");

// Icône native carrée (pour Android)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>
  <text x="512" y="680" font-family="Arial, sans-serif" font-size="560" font-weight="bold"
        fill="white" text-anchor="middle">E</text>
  <circle cx="760" cy="280" r="56" fill="#fbbf24"/>
</svg>`;

await sharp(Buffer.from(iconSvg))
  .png()
  .toFile(join(mobileAssets, "icon-native.png"));
console.log("✓ icon-native.png");

console.log("\n✅ Ressources natives générées dans mobile/www/assets/");
console.log("   Pour Capacitor, utilisez @capacitor/assets pour générer les icônes Android/iOS:");
console.log("   pnpm add -D @capacitor/assets");
console.log("   npx capacitor-assets generate --android --ios");
