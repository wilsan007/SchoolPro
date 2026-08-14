import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { siteFilterForModel } from "@/lib/site-scope";
import { revalidateTag } from "next/cache";

/**
 * POST /api/eleves/generer-comptes
 *
 * Génère les comptes de connexion pour les élèves d'une classe qui n'en
 * ont pas encore (userId = null).
 *
 * Convention :
 *   - Username = matricule de l'élève (identifiant public, stable)
 *   - Mot de passe initial = date de naissance au format JJMMAAAA
 *   - mustChangePassword = true → l'élève doit changer son mot de passe
 *     au premier login (garde contre la faiblesse de la DOB comme secret)
 *
 * L'admin peut toujours surcharger le mot de passe via `customPassword`
 * (cas d'un établissement qui préfère un mot de passe commun).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { classeId, customPassword } = body as {
    classeId: string;
    customPassword?: string;
  };

  if (!classeId) {
    return NextResponse.json({ error: "classeId requis" }, { status: 400 });
  }

  const siteFilter = siteFilterForModel("eleve", session.user);
  const eleves = await prisma.eleve.findMany({
    where: {
      classeId,
      tenantId: session.user.tenantId,
      ...siteFilter,
      statut: "ACTIF",
      userId: null,
    },
    orderBy: { prenom: "asc" },
  });

  if (eleves.length === 0) {
    return NextResponse.json({ error: "Aucun élève sans compte dans cette classe", created: 0, accounts: [] });
  }

  const accounts: { matricule: string; nom: string; username: string; password: string }[] = [];
  const created: string[] = [];
  const skipped: { matricule: string; nom: string; raison: string }[] = [];

  for (const eleve of eleves) {
    const username = eleve.matricule;

    // Mot de passe : customPassword si fourni, sinon date de naissance JJMMAAAA
    const password = customPassword || formatDOB(eleve.dateNaissance);

    if (!password) {
      skipped.push({
        matricule: eleve.matricule,
        nom: `${eleve.prenom} ${eleve.nom}`,
        raison: "Date de naissance manquante",
      });
      continue;
    }

    // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- vérification d'unicité globale par email avant création de compte élève
    const existing = await prisma.user.findUnique({ where: { email: username } });
    if (existing) {
      skipped.push({
        matricule: eleve.matricule,
        nom: `${eleve.prenom} ${eleve.nom}`,
        raison: "Username déjà pris",
      });
      continue;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: username,
        name: `${eleve.prenom} ${eleve.nom}`,
        password: hashedPassword,
        role: "STUDENT",
        tenantId: session.user.tenantId,
        locale: "fr",
        mustChangePassword: true,
        // Créer l'entrée UserTenant pour le multi-tenant
        userTenants: {
          create: {
            tenantId: session.user.tenantId,
            role: "STUDENT",
            isActive: true,
            isDefault: true,
          },
        },
        // Créer l'entrée UserRole pour le multi-rôle
        userRoles: {
          create: {
            tenantId: session.user.tenantId,
            role: "STUDENT",
            isActive: true,
          },
        },
      },
    });

    await prisma.eleve.update({
      where: { id: eleve.id },
      data: { userId: user.id },
    });

    accounts.push({
      matricule: eleve.matricule,
      nom: `${eleve.prenom} ${eleve.nom}`,
      username,
      // Si customPassword, on affiche "—" car l'admin le connaît déjà.
      // Sinon on affiche la DOB pour que l'admin puisse la communiquer.
      password: customPassword ? "—" : password,
    });
    created.push(user.id);
  }

  revalidateTag("eleves-stats");
  revalidateTag("dashboard-data");

  return NextResponse.json({
    created: created.length,
    accounts,
    skipped: skipped.length > 0 ? skipped : undefined,
  });
}

/**
 * Formate une date de naissance au format JJMMAAAA (ex: 05042012).
 * Utilisé comme mot de passe initial pour les comptes élèves.
 */
function formatDOB(date: Date): string | null {
  if (!date || isNaN(date.getTime())) return null;
  const jj = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(date.getUTCFullYear());
  return `${jj}${mm}${aaaa}`;
}
