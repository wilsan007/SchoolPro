import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { siteFilterForModel } from "@/lib/site-scope";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json();
  const { classeId, customPassword, usernameFormat } = body as {
    classeId: string;
    customPassword?: string;
    usernameFormat: "matricule" | "nom.prenom";
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

  for (const eleve of eleves) {
    const username =
      usernameFormat === "matricule"
        ? eleve.matricule
        : `${eleve.nom.toLowerCase().replace(/[^a-z]/g, "")}.${eleve.prenom.toLowerCase().replace(/[^a-z]/g, "")}`;

    const password = customPassword || generateRandomPassword();

    const existing = await prisma.user.findUnique({ where: { email: username } });
    if (existing) continue;

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: username,
        name: `${eleve.prenom} ${eleve.nom}`,
        password: hashedPassword,
        role: "STUDENT",
        tenantId: session.user.tenantId,
        locale: "fr",
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
      password: customPassword ? "—" : password,
    });
    created.push(user.id);
  }

  return NextResponse.json({ created: created.length, accounts });
}

function generateRandomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}
