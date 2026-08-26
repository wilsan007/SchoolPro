import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/rbac";
import { rateLimit, getClientIP } from "@/lib/security/rateLimit";
import {
  getSupabaseServer,
  INSCRIPTION_BUCKET,
  MIME_AUTORISES_INSCRIPTION,
  TAILLE_MAX_INSCRIPTION,
} from "@/lib/supabase-server";

/**
 * Upload d'une piece d'inscription (photo, acte de naissance, piece parent,
 * bulletin scolaire) vers Supabase Storage.
 *
 * Le fichier est stocke sous :
 *   inscriptions/<tenantId>/<candidatureId>/<type>_<timestamp>_<nomOriginal>
 *
 * Retourne l'URL publique du fichier + ses metadonnees, pretes a etre
 * enregistrees dans candidature.documentsInscription.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  const denied = checkPermission(session.user.role, "admissions:write");
  if (denied) return denied;

  // Rate limit : 20 uploads / minute / utilisateur (plusieurs pieces par dossier)
  const ip = getClientIP(req);
  const rl = rateLimit({
    max: 20,
    windowSec: 60,
    key: "upload-insc:" + session.user.id + ":" + ip,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requetes. Reessayez dans un instant." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Stockage non configure. Ajoutez NEXT_PUBLIC_SUPABASE_URL et " +
          "SUPABASE_SERVICE_ROLE_KEY dans .env et creez le bucket " +
          "\"" + INSCRIPTION_BUCKET + "\" cote Supabase.",
      },
      { status: 503 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const type = (formData.get("type") as string | null) ?? "AUTRE";
  const candidatureId = formData.get("candidatureId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
  }

  // Validation du type MIME
  if (!MIME_AUTORISES_INSCRIPTION.includes(file.type as never)) {
    return NextResponse.json(
      { error: "Format non supporte. Utilisez JPG, PNG, WebP, GIF ou PDF." },
      { status: 400 }
    );
  }

  // Validation de la taille
  if (file.size > TAILLE_MAX_INSCRIPTION) {
    const maxMo = TAILLE_MAX_INSCRIPTION / (1024 * 1024);
    return NextResponse.json(
      { error: "Le fichier ne doit pas depasser " + maxMo + " Mo" },
      { status: 400 }
    );
  }

  const tenantId = session.user.tenantId;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const chemin =
    tenantId + "/" + (candidatureId ?? "temp") + "/" + type + "_" + Date.now() + "_" + safeName;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { error: uploadError } = await supabase.storage
    .from(INSCRIPTION_BUCKET)
    .upload(chemin, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[API/inscriptions/upload]", uploadError);
    return NextResponse.json(
      { error: "Echec de l'upload du fichier." },
      { status: 500 }
    );
  }

  // URL publique (le bucket doit etre public, ou utiliser getPublicUrl)
  const { data: urlData } = supabase.storage
    .from(INSCRIPTION_BUCKET)
    .getPublicUrl(chemin);

  return NextResponse.json({
    url: urlData.publicUrl,
    chemin,
    nom: file.name,
    taille: file.size,
    mimeType: file.type,
    type,
  });
}
