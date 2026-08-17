import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { randomBytes } from "crypto";

/**
 * GET /api/sync/config
 * Récupère la configuration de synchronisation du tenant courant.
 *
 * PUT /api/sync/config
 * Crée ou met à jour la configuration de synchronisation.
 * Corps: { serverNick, syncInterval, syncEnabled, include* }
 *
 * POST /api/sync/config/regenerate-key
 * Régénère la clé API (l'ancienne devient invalide).
 */

const UpdateConfigSchema = z.object({
  serverNick: z.string().min(2, "Le nom du serveur est requis").max(100),
  syncInterval: z.union([z.literal(30), z.literal(60)]).default(60),
  syncEnabled: z.boolean().default(true),
  includeBulletins: z.boolean().default(true),
  includeNotes: z.boolean().default(true),
  includeEmploiTemps: z.boolean().default(true),
  includeExamens: z.boolean().default(true),
  includePersonnel: z.boolean().default(true),
  includeComptabilite: z.boolean().default(true),
  includeAbsences: z.boolean().default(true),
  includeParametres: z.boolean().default(true),
});

function requireAdmin(session: any) {
  if (!session?.user?.tenantId) return false;
  return (
    session.user.role === "TENANT_ADMIN" ||
    session.user.role === "SUPER_ADMIN"
  );
}

/** Génère une clé API sécurisée de 40 caractères. */
function generateApiKey(): string {
  return "esk_" + randomBytes(24).toString("hex");
}

export async function GET() {
  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let config = await prisma.syncConfig.findUnique({
      where: { tenantId: session!.user!.tenantId! },
    });

    // Si aucune config n'existe, on en crée une par défaut
    if (!config) {
      config = await prisma.syncConfig.create({
        data: {
          tenantId: session!.user!.tenantId!,
          serverNick: "PC-Principal",
          syncInterval: 60,
          syncEnabled: false, // Désactivé par défaut jusqu'à configuration
          apiKey: generateApiKey(),
        },
      });
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error("[sync/config] GET erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération de la configuration" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const json = await request.json();
    const data = UpdateConfigSchema.parse(json);

    const tenantId = session!.user!.tenantId!;

    // Upsert : crée si n'existe pas, met à jour sinon
    const config = await prisma.syncConfig.upsert({
      where: { tenantId },
      update: {
        serverNick: data.serverNick,
        syncInterval: data.syncInterval,
        syncEnabled: data.syncEnabled,
        includeBulletins: data.includeBulletins,
        includeNotes: data.includeNotes,
        includeEmploiTemps: data.includeEmploiTemps,
        includeExamens: data.includeExamens,
        includePersonnel: data.includePersonnel,
        includeComptabilite: data.includeComptabilite,
        includeAbsences: data.includeAbsences,
        includeParametres: data.includeParametres,
      },
      create: {
        tenantId,
        serverNick: data.serverNick,
        syncInterval: data.syncInterval,
        syncEnabled: data.syncEnabled,
        apiKey: generateApiKey(),
        includeBulletins: data.includeBulletins,
        includeNotes: data.includeNotes,
        includeEmploiTemps: data.includeEmploiTemps,
        includeExamens: data.includeExamens,
        includePersonnel: data.includePersonnel,
        includeComptabilite: data.includeComptabilite,
        includeAbsences: data.includeAbsences,
        includeParametres: data.includeParametres,
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides", details: error.issues },
        { status: 400 }
      );
    }
    console.error("[sync/config] PUT erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour de la configuration" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/config?action=regenerate-key
 * Régénère la clé API.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!requireAdmin(session)) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "regenerate-key") {
      const tenantId = session!.user!.tenantId!;
      const newApiKey = generateApiKey();

      // S'assurer que la config existe
      await prisma.syncConfig.upsert({
        where: { tenantId },
        update: { apiKey: newApiKey },
        create: {
          tenantId,
          serverNick: "PC-Principal",
          syncInterval: 60,
          syncEnabled: false,
          apiKey: newApiKey,
        },
      });

      return NextResponse.json({ apiKey: newApiKey });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    console.error("[sync/config] POST erreur:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'action" },
      { status: 500 }
    );
  }
}
