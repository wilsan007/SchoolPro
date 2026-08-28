import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role, ModeleNiveaux } from "@prisma/client";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import prisma from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { checkUserFinancialBlock } from "@/lib/financial-guard";
import { PWAInstallPrompt } from "@/components/parent/PWAInstallPrompt";
import { WindowManagerProvider } from "@/components/workspace/WindowManager";
import { Workspace } from "@/components/workspace/Workspace";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { NiveauProvider } from "@/lib/niveau-context";

// Détection mobile simple via User-Agent (server-side, pas de hydration mismatch)
function isMobileDevice(userAgent: string): boolean {
  return /Mobile|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(userAgent);
}

const getTenantName = unstable_cache(
  async (tenantId: string) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant?.name ?? "Mon École";
  },
  ["tenant-name"],
  { revalidate: 300, tags: ["tenant-name"] }
);

const getTenantModeleNiveaux = unstable_cache(
  async (tenantId: string): Promise<ModeleNiveaux> => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { modeleNiveaux: true },
    });
    return tenant?.modeleNiveaux ?? "ANNEES";
  },
  ["tenant-modele-niveaux"],
  { revalidate: 300, tags: ["tenant-modele-niveaux"] }
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, tRoles, tCommon] = await Promise.all([
    auth(),
    getTranslations("roles"),
    getTranslations("common"),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  // Blocage financier : rediriger les élèves/parents exclus vers la page d'accès bloqué
  // Pour les parents avec exclusion partielle, on affiche un avertissement mais on ne bloque pas
  let partialBlockMessage: string | null = null;
  if (
    (session.user.role === "STUDENT" || session.user.role === "PARENT") &&
    session.user.tenantId
  ) {
    const block = await checkUserFinancialBlock(session.user.id, session.user.tenantId, session.user);
    if (block.blocked) {
      redirect("/acces-bloque");
    }
    if (block.partialBlock && block.messageKey) {
      partialBlockMessage = tCommon(block.messageKey, block.messageParams ?? {});
    }
  }

  // Forçage du changement de mot de passe : si l'utilisateur a un mot de
  // passe initial prévisible (génération en masse), il doit le changer avant
  // d'accéder au tableau de bord. On laisse passer la page /profil elle-même.
  const mustChange = session.user.mustChangePassword ?? false;
  if (mustChange) {
    const h = await headers();
    const currentPath = h.get("x-pathname") ?? "";
    if (!currentPath.startsWith("/profil")) {
      redirect("/profil");
    }
  }

  const tenantName = session.user.tenantId
    ? await getTenantName(session.user.tenantId)
    : "Mon École";

  const modeleNiveaux: ModeleNiveaux = session.user.tenantId
    ? await getTenantModeleNiveaux(session.user.tenantId)
    : "ANNEES";

  // Fetch sites for the current tenant
  // TENANT_ADMIN / SUPER_ADMIN see all sites; other roles see only their assigned sites
  const role = session.user.role;
  const isSiteAdmin = role === "TENANT_ADMIN" || role === "SUPER_ADMIN";
  const sites = session.user.tenantId
    ? isSiteAdmin
      ? await prisma.site.findMany({
          where: { tenantId: session.user.tenantId, actif: true },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        })
      : await prisma.site.findMany({
          where: {
            tenantId: session.user.tenantId,
            actif: true,
            OR: [
              { userSites: { some: { userId: session.user.id } } },
              { enseignantSites: { some: { enseignant: { userId: session.user.id, tenantId: session.user.tenantId } } } },
            ],
          },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        })
    : [];

  const siteId = (session.user as { siteId?: string | null }).siteId ?? null;

  // Rôles possédés par l'utilisateur dans le tenant actif.
  // Calculés par deriveClaims et propagés dans la session — pas de
  // requête supplémentaire ici, la session est la source de vérité.
  const availableRoles: Role[] = session.user.availableRoles ?? [session.user.role];
  const currentRole: Role = session.user.role;

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: tRoles("SUPER_ADMIN"),
    TENANT_ADMIN: tRoles("TENANT_ADMIN"),
    PRINCIPAL: tRoles("PRINCIPAL"),
    SECRETARY: tRoles("SECRETARY"),
    TEACHER: tRoles("TEACHER"),
    CLASS_TEACHER: tRoles("CLASS_TEACHER"),
    COUNSELOR: tRoles("COUNSELOR"),
    NURSE: tRoles("NURSE"),
    ACCOUNTANT: tRoles("ACCOUNTANT"),
    CAISSIER: tRoles("CAISSIER"),
    PARENT: tRoles("PARENT"),
    STUDENT: tRoles("STUDENT"),
  };

  // Mode embedded : les iframes du workspace chargent les routes avec ?embedded=1.
  // On rend juste le contenu de la page, sans chrome (sidebar, header, dock).
  const h = await headers();
  // Deux signaux complémentaires :
  //
  //  — `Sec-Fetch-Dest: iframe` : envoyé par le navigateur pour TOUT chargement
  //    de document dans une iframe, y compris après une redirection. C'est le
  //    signal déterminant : `redirect()` perd la query string, donc un module
  //    qui redirige (`/dashboard` → `/direction`, blocage financier, 2FA…)
  //    reperdrait `?embedded=1` et ré-afficherait tout le chrome dans l'iframe.
  //    Aucun risque de faux positif : `frame-ancestors 'self'` (next.config.ts)
  //    interdit déjà l'encadrement cross-origin, donc une requête `iframe` ne
  //    peut provenir que du workspace lui-même.
  //
  //  — `x-embedded` : injecté par le middleware depuis `?embedded=1`. Couvre les
  //    navigations RSC internes à l'iframe, où `Sec-Fetch-Dest` vaut `empty`.
  const isEmbedded =
    h.get("sec-fetch-dest") === "iframe" || h.get("x-embedded") === "1";

  if (isEmbedded) {
    return (
      <NiveauProvider modele={modeleNiveaux}>
        <div className="h-screen bg-background overflow-auto">{children}</div>
      </NiveauProvider>
    );
  }

  // Mode mobile : navigation classique sans iframe/workspace
  const userAgent = h.get("user-agent") ?? "";
  if (isMobileDevice(userAgent)) {
    return (
      <NiveauProvider modele={modeleNiveaux}>
        <MobileLayout roleKey={session.user.role} userName={session.user.name}>
          {children}
        </MobileLayout>
      </NiveauProvider>
    );
  }

  // Mode workspace desktop : plein écran, dock en bas avec tous les modules
  return (
    <NiveauProvider modele={modeleNiveaux}>
      <WindowManagerProvider>
        <div className="flex flex-col h-screen overflow-hidden bg-background">
          <ImpersonationBanner />
          {partialBlockMessage && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 print:hidden">
              <svg className="h-4 w-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.93 19h12.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L4.2 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <p className="text-sm text-amber-800">{partialBlockMessage}</p>
            </div>
          )}
          <Workspace
            roleKey={session.user.role}
            userName={session.user.name}
            userAvatar={session.user.image ?? undefined}
            tenantName={tenantName}
            tenantId={session.user.tenantId}
            isSuperAdmin={session.user.role === "SUPER_ADMIN"}
            availableTenants={session.user.availableTenants}
            sites={sites}
            currentSiteId={siteId}
            isSiteAdmin={isSiteAdmin}
            availableRoles={availableRoles}
            currentRole={currentRole}
          />
        </div>
        <PWAInstallPrompt />
      </WindowManagerProvider>
    </NiveauProvider>
  );
}
