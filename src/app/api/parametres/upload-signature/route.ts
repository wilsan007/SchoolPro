import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import { validateMagicBytes } from "@/lib/security/magic-bytes";

// Téléverse une signature ou un cachet et renvoie une data URL base64
// (même stratégie de stockage que /api/eleves/upload-photo).
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const ip = getClientIP(req);
    const rl = rateLimit({ max: 10, windowSec: 60, key: `upload-sig:${session.user.id}:${ip}` });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessayez dans un instant." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    }
    if (type !== "signature" && type !== "cachet") {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Format non supporté. Utilisez JPG, PNG, WebP ou GIF." }, { status: 400 });
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "L'image ne doit pas dépasser 2 Mo" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Vérifier les magic bytes pour confirmer le type MIME réel
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json({ error: "Le contenu du fichier ne correspond pas au type déclaré" }, { status: 400 });
    }

    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("[API/parametres/upload-signature]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
