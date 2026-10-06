import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Role, ModeleNiveaux } from "@prisma/client";
import { ImpersonationBanner } from "@/components/layout/ImpersonationBanner";
import prisma from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { unstable_cache } from "next/cache";
import { withRlsContext } from "@/lib/rls-context";
import { checkUserFinancialBlock } from "@/lib/financial-guard";
import { PWAInstallPrompt } from "@/components/parent/PWAInstallPrompt";
import { WindowManagerProvider } from "@/components/workspace/WindowManager";
import { Workspace } from "@/components/workspace/Workspace";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { NiveauProvider } from "@/lib/niveau-context";
import { overridesPour } from "@/lib/effective-permissions";
import { referentiel } from "@/lib/cache-referentiel";
import { accueilPourRole } from "@/lib/accueil-par-role";
import { EmbeddedBridge } from "@/components/workspace/EmbeddedBridge";
import type { PermissionOverrides } from "@/lib/permissions";

// Détection mobile simple via User-Agent (server-side, pas de hydration mismatch)
function isMobileDevice(userAgent: string): boolean {
  return /Mobile|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(userAgent);
}

const getTenantName = unstable_cache(
  async (tenantId: string) => {
    // unstable_cache s'exécute HORS contexte de requête : auth()/headers()
    // y sont interdits (Next.js 15), et l'extension RLS ne peut donc pas
    // déduire la session. On pose le contexte explicitement depuis le
    // tenantId — transmis par l'appelant, déjà authentifié. Sans cela, en
    // RLS_MODE=enforce, chaque revalidation du cache faisait crasher le
    // rendu de la page (digest 610027794).
    return withRlsContext(
      { tenantId, siteId: null, siteIds: [], superAdmin: false, origin: "cache:tenant-name" },
      async () => {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });
        return tenant?.name ?? "Mon École";
      },
    );
  },
  ["tenant-name"],
  { revalidate: 300, tags: ["tenant-name"] }
);

const getTenantModeleNiveaux = unstable_cache(
  async (tenantId: string): Promise<ModeleNiveaux> => {
    // Cf. getTenantName : contexte RLS explicite, le cache n'a pas de session.
    return withRlsContext(
      { tenantId, siteId: null, siteIds: [], superAdmin: false, origin: "cache:tenant-modele-niveaux" },
      async () => {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { modeleNiveaux: true },
        });
        return tenant?.modeleNiveaux ?? "ANNEES";
      },
    );
  },
  ["tenant-modele-niveaux"],
  { revalidate: 300, tags: ["tenant-modele-niveaux"] }
);

/**
 * Sites proposés par le sélecteur du workspace : tous pour un administrateur,
 * ceux auxquels il est rattaché pour les autres rôles. Donnée de référence,
 * tenue en cache court et vidée à toute écriture sur un site ou un rattachement.
 */
function sitesDuWorkspace(tenantId: string, userId: string, isSiteAdmin: boolean) {
  return referentiel("sites", `${tenantId}:${isSiteAdmin ? "*" : userId}`, () =>
    isSiteAdmin
      ? prisma.site.findMany({
          where: { tenantId, actif: true },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        })
      : prisma.site.findMany({
          where: {
            tenantId,
            actif: true,
            OR: [
              { userSites: { some: { userId } } },
              { enseignantSites: { some: { enseignant: { userId, tenantId } } } },
            ],
          },
          select: { id: true, nom: true, code: true },
          orderBy: { nom: "asc" },
        }),
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, tRoles, tCommon, h] = await Promise.all([
    auth(),
    getTranslations("roles"),
    getTranslations("common"),
    headers(),
  ]);

  if (!session?.user) {
    redirect("/login");
  }

  const { user } = session;
  const tenantId = user.tenantId;

  // Mode embedded : les iframes du workspace chargent les routes avec ?embedded=1.
  // On rend juste le contenu de la page, sans chrome (sidebar, header, dock).
  //
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
  // Mode mobile : navigation classique sans iframe/workspace
  const isMobile = !isEmbedded && isMobileDevice(h.get("user-agent") ?? "");
  // Le chrome du workspace (nom de l'établissement, sites) ne sert qu'à la
  // coquille desktop : une iframe ou un mobile ne le lisent pas.
  const avecChrome = !isEmbedded && !isMobile;

  // TENANT_ADMIN / SUPER_ADMIN see all sites; other roles see only their assigned sites
  const role = user.role;
  const isSiteAdmin = role === "TENANT_ADMIN" || role === "SUPER_ADMIN";

  // TOUTES les lectures du layout partent ensemble. Elles s'enchaînaient une à
  // une, et la page ne commence son propre rendu qu'une fois le layout
  // résolu : chaque aller-retour retardait d'autant le premier octet — et le
  // squelette de chargement avec lui. Chacune est par ailleurs tenue en cache
  // (src/lib/cache-referentiel.ts, `unstable_cache`) : à chaud, le layout ne
  // touche plus la base.
  const [block, modeleNiveaux, tenantName, sites, permissionOverrides] = await Promise.all([
    // Blocage financier : ne concerne que les élèves et les parents.
    (role === "STUDENT" || role === "PARENT") && tenantId
      ? referentiel("blocage-financier", `${tenantId}:${user.id}:${(user.siteIds ?? []).join(",")}`, () =>
          checkUserFinancialBlock(user.id, tenantId, user),
        )
      : null,
    tenantId ? getTenantModeleNiveaux(tenantId) : ("ANNEES" as ModeleNiveaux),
    avecChrome && tenantId ? getTenantName(tenantId) : "Mon École",
    avecChrome && tenantId ? sitesDuWorkspace(tenantId, user.id, isSiteAdmin) : [],
    // Dérogations par utilisateur (`user_permission`), lues UNE fois pour tout
    // l'écran. La navigation, `guardPage` et les gardes d'API appliquent ainsi la
    // même décision : un `deny` retire l'entrée du menu en même temps qu'il
    // ferme la page, un `grant` l'y ajoute. Avant, la table était écrite mais
    // jamais lue — le menu et l'API ne voyaient que la matrice des rôles.
    //
    // Une iframe n'affiche pas de menu : seul `guardPage` en a besoin, côté
    // page. La lecture est donc lancée sans être attendue — `cache()` la
    // partage avec la page, qui la trouve déjà en route.
    isEmbedded
      ? (void overridesPour(user.id, tenantId ?? null).catch(() => undefined), {} as PermissionOverrides)
      : overridesPour(user.id, tenantId ?? null),
  ]);

  // Blocage financier : rediriger les élèves/parents exclus vers la page d'accès bloqué
  // Pour les parents avec exclusion partielle, on affiche un avertissement mais on ne bloque pas
  let partialBlockMessage: string | null = null;
  if (block) {
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
  const currentPath = h.get("x-pathname") ?? "";
  if (user.mustChangePassword && !currentPath.startsWith("/profil")) {
    redirect("/profil");
  }

  const siteId = (user as { siteId?: string | null }).siteId ?? null;

  // Rôles possédés par l'utilisateur dans le tenant actif.
  // Calculés par deriveClaims et propagés dans la session — pas de
  // requête supplémentaire ici, la session est la source de vérité.
  const availableRoles: Role[] = user.availableRoles ?? [user.role];
  const currentRole: Role = user.role;

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

  if (isEmbedded) {
    return (
      <NiveauProvider modele={modeleNiveaux}>
        <EmbeddedBridge />
        <div className="h-screen bg-background overflow-auto">{children}</div>
      </NiveauProvider>
    );
  }

  if (isMobile) {
    return (
      <NiveauProvider modele={modeleNiveaux}>
        <MobileLayout roleKey={session.user.role} userName={session.user.name} permissionOverrides={permissionOverrides}>
          {children}
        </MobileLayout>
      </NiveauProvider>
    );
  }

  // Mode workspace desktop : plein écran, dock en bas avec tous les modules.
  //
  // La fenêtre de la route demandée est ouverte DÈS LE RENDU SERVEUR : son
  // iframe figure dans le HTML, et le navigateur la charge en parallèle du
  // JavaScript de la coquille. Ouverte dans un effet client, elle attendait le
  // téléchargement, l'analyse et l'hydratation avant même d'être demandée.
  const accueil = accueilPourRole(currentRole);
  const initialRoute =
    !currentPath || currentPath === "/"
      ? null
      : currentPath === "/dashboard" && accueil
        ? accueil
        : currentPath;

  return (
    <NiveauProvider modele={modeleNiveaux}>
      <WindowManagerProvider initialRoute={initialRoute}>
        <div className="flex flex-col h-screen overflow-hidden bg-background">
          {/* La bannière interroge /api/super-admin/impersonate/status, route
              réservée aux SUPER_ADMIN (`authorizeSuperAdmin`). Montée pour tous
              les rôles, elle provoquait un 403 en console — et une requête
              inutile — à chaque chargement d'écran, pour tout le monde sauf les
              super-admins. C'est ce 403 qui polluait l'audit UI.
              Le rôle reste SUPER_ADMIN pendant l'impersonation (le JWT garde le
              rôle et ne bascule que le tenantId) : la bannière reste donc
              affichée, bouton « Quitter » compris, tant qu'un super-admin
              parcourt un établissement. */}
          {currentRole === "SUPER_ADMIN" && <ImpersonationBanner />}
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
            permissionOverrides={permissionOverrides}
          />
        </div>
        <PWAInstallPrompt />
      </WindowManagerProvider>
    </NiveauProvider>
  );
}
