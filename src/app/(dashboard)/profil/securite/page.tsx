import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { DeuxFacteursPanel } from "@/components/profil/DeuxFacteursPanel";
import { deuxFacteursObligatoire } from "@/lib/two-factor-policy";

/**
 * Sécurité du compte — double authentification.
 *
 * PLACÉE SOUS /profil ET NON /parametres
 * `/parametres` exige la permission `parametres:read`, réservée à la
 * direction. Or le comptable et le caissier font partie des rôles pour
 * lesquels la double authentification est obligatoire : sous
 * `/parametres`, ils seraient renvoyés vers « accès bloqué » — donc
 * enfermés dehors par la mesure censée les protéger. `/profil` est ouvert
 * à tout compte authentifié, ce qui est de toute façon la bonne place :
 * la sécurité d'un compte est personnelle, pas administrative.
 */
export default async function SecuritePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // eslint-disable-next-line ecolpro/require-tenant-id, ecolpro/require-site-filter -- page personnelle : l'utilisateur ne lit que son propre compte
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true, twoFactorVerifiedAt: true },
  });

  return (
    <>
      <Header title="Sécurité du compte" />
      <div className="p-4 sm:p-6 max-w-2xl space-y-6">
        <DeuxFacteursPanel
          actifInitial={user.twoFactorEnabled}
          derniereVerification={user.twoFactorVerifiedAt?.toISOString() ?? null}
          obligatoire={deuxFacteursObligatoire(session.user.role)}
        />
      </div>
    </>
  );
}
