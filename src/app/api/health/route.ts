import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // eslint-disable-next-line ecolpro/require-site-filter -- health check système sans session utilisateur
    const userCount = await prisma.user.count();
    return NextResponse.json({ ok: true, userCount });
  } catch (error) {
    console.error("[API/health]", error);
    return NextResponse.json(
      { ok: false, error: "Service indisponible" },
      { status: 500 }
    );
  }
}
