import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // eslint-disable-next-line ecolpro/require-site-filter -- health check système sans session utilisateur
    const userCount = await prisma.user.count();
    return NextResponse.json({ ok: true, userCount });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
