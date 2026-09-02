import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DossierEnfant } from "@/components/learnos/DossierEnfant";
import { EvolutionEleve } from "@/components/learnos/EvolutionEleve";
import { CompetencesEleve } from "@/components/learnos/CompetencesEleve";
import { PreferencesParentForm } from "@/components/learnos/PreferencesParentForm";
import { JustifierAbsenceForm } from "@/components/learnos/JustifierAbsenceForm";
import { ParentPortalTabs } from "@/components/parent/ParentPortalTabs";
import { ParentEdtView } from "@/components/parent/ParentEdtView";
import { TaskTimeline, type TacheData } from "@/components/taches/TaskTimeline";
import { synchroniserTachesAuto } from "@/lib/tache-engine";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { dossierEleve, enfantsDuParent } from "@/lib/learnos/dossier-eleve";
import { getDemoNow } from "@/lib/demo-now";
import { PREFERENCES_PAR_DEFAUT } from "@/lib/learnos/alertes-parent";
import prisma from "@/lib/prisma";
import { mergeFilters, eleveScopeFilter, siteFilterForModel } from "@/lib/site-scope";
import { cn } from "@/lib/utils";
import { getAnneeCouranteLibelle, anneeActiveId } from "@/lib/annee-scolaire";

/**
 * Espace du parent — portail complet avec onglets.
 *
 * ISOLATION — le point le plus sensible de cet écran
 * --------------------------------------------------
 * Le filtre de site ne s'applique PAS au rôle `PARENT` : c'est le périmètre
 * relationnel qui protège. L'enfant affiché est donc **obligatoirement** issu
 * de `enfantsDuParent`, jamais du paramètre d'URL pris tel quel — sans quoi
 * `?enfant=<id>` ouvrirait le dossier de n'importe quel élève du tenant.
 */
export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ enfant?: string }>;
}) {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("learnos.dossier"),
  ]);
  await guardPage(session);

  if (session!.user.role !== "PARENT") redirect("/dashboard");

  const tenantId = session!.user.tenantId!;
  const { enfant: demande } = await searchParams;

  const anneeCourante = await getAnneeCouranteLibelle(tenantId);
  const anneeId = await anneeActiveId(tenantId);

  const enfants = await enfantsDuParent(tenantId, session!.user);

  const entete = (
    <Header
      title={t("titreParent")}
      subtitle={t("sousTitreParent")}
      userName={session!.user.name}
      userAvatar={session!.user.image ?? undefined}
    />
  );

  if (enfants.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {entete}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="font-medium">{t("aucunEnfant")}</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {t("aucunEnfantAide")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const choisi = enfants.find((e) => e.id === demande) ?? enfants[0];

  // Récupérer le classeId séparément — `enfantsDuParent` ne retourne que
  // `classe.nom`, pas `classe.id`, pour éviter de modifier le contrat existant.
  // findFirst (et non findUnique) pour pouvoir recouper le tenantId : un jeton
  // manipulé ne doit pas permettre de lire un élève hors tenant.
  const eleveAvecClasse = await prisma.eleve.findFirst({
    where: { id: choisi.id, tenantId, ...siteFilterForModel("eleve", session!.user) },
    select: { classeId: true },
  });

  // --- Récupération de TOUTES les données nécessaires pour les onglets ---
  // Les requêtes sont réparties en deux lots séquentiels pour limiter le
  // nombre de requêtes concurrentes (~3 puis ~7) au lieu de 15+ d'un coup.
  const eleveRelFilter = eleveScopeFilter(session!.user, "eleve");
  const eleveRelFilterGardien = eleveScopeFilter(session!.user, "eleve", { gardienOnly: true });
  const maintenant = await getDemoNow();

  // Lot 1 — critique pour le premier rendu (vérification gardien, factures,
  // absences). 3 requêtes concurrentes maximum.
  const [factures, absences, isGardien] = await Promise.all([
    // Factures — réservées au parent GARDIEN
    prisma.facture.findMany({
      where: mergeFilters(
        { tenantId, eleveId: choisi.id, ...(anneeCourante && { eleve: { classe: { annee: anneeCourante } } }) },
        eleveRelFilterGardien
      ),
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        numero: true,
        libelle: true,
        montant: true,
        devise: true,
        statut: true,
        echeance: true,
        createdAt: true,
        paiements: {
          select: { id: true, montant: true, date: true, methode: true },
          orderBy: { date: "desc" },
        },
      },
    }),
    // Absences — toutes (pas seulement injustifiées)
    prisma.absence.findMany({
      where: mergeFilters({ tenantId, eleveId: choisi.id, ...(anneeCourante && { eleve: { classe: { annee: anneeCourante } } }) }, eleveRelFilter),
      orderBy: { date: "desc" },
      take: 30,
      select: {
        id: true,
        date: true,
        heureDebut: true,
        heureFin: true,
        isRetard: true,
        statut: true,
        motif: true,
        commentaire: true,
      },
    }),
    // Vérifier si le parent est gardien
    prisma.eleveParent
      .findFirst({
        where: {
          eleveId: choisi.id,
          parent: { userId: session!.user.id, tenantId },
          isGardien: true,
          ...siteFilterForModel("eleveParent", session!.user),
        },
        select: { isGardien: true },
      })
      .then((r) => !!r),
  ]);

  // Lot 2 — données « below the fold » (dossier, préférences, notes, bulletins,
  // emploi du temps, conversations, documents). 7 requêtes concurrentes max.
  const [dossier, preferences, notes, bulletins, edt, conversations, documents] =
    await Promise.all([
      dossierEleve(tenantId, choisi.id, session!.user, {
        pourResponsable: "parent",
        avecFinance: true,
        maintenant,
      }),
      preferencesDuCompte(tenantId, session!.user.id),
      // Notes récentes
      prisma.note.findMany({
        where: mergeFilters({ tenantId, eleveId: choisi.id, ...(anneeCourante && { eleve: { classe: { annee: anneeCourante } } }) }, eleveRelFilter),
        orderBy: { date: "desc" },
        take: 30,
        select: {
          id: true,
          valeur: true,
          noteMax: true,
          coefficient: true,
          date: true,
          intitule: true,
          type: true,
          matiere: { select: { id: true, nom: true, code: true, couleur: true, coefficient: true } },
        },
      }),
      // Bulletins
      prisma.bulletin.findMany({
        where: mergeFilters({ tenantId, eleveId: choisi.id, ...(anneeId && { periode: { anneeId } }) }, eleveRelFilter),
        orderBy: [{ periode: { numero: "asc" } }],
        select: {
          id: true,
          moyenneGenerale: true,
          moyenneClasse: true,
          rang: true,
          effectifClasse: true,
          appreciation: true,
          decision: true,
          isPublie: true,
          pdfUrl: true,
          periode: { select: { id: true, nom: true, numero: true } },
        },
      }),
      // Emploi du temps de la classe de l'enfant
      eleveAvecClasse?.classeId
        ? prisma.emploiTemps.findMany({
            where: {
              tenantId,
              classeId: eleveAvecClasse.classeId,
              ...siteFilterForModel("emploiTemps", session!.user),
              ...(anneeCourante && { classe: { annee: anneeCourante } }),
            },
            select: {
              id: true,
              jour: true,
              heureDebut: true,
              heureFin: true,
              salle: true,
              classe: { select: { id: true, nom: true, niveau: true } },
              matiere: { select: { id: true, nom: true, code: true, couleur: true } },
              enseignant: { select: { id: true, user: { select: { name: true } } } },
            },
            orderBy: [{ jour: "asc" }, { heureDebut: "asc" }],
          })
        : Promise.resolve([]),
      // Conversations récentes
      prisma.conversation.findMany({
        where: {
          tenantId,
          participants: { some: { userId: session!.user.id } },
        },
        select: {
          id: true,
          subject: true,
          type: true,
          updatedAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              content: true,
              senderId: true,
              sender: { select: { name: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      // Documents / attestations
      prisma.document.findMany({
        where: mergeFilters({ tenantId, eleveId: choisi.id, ...(anneeCourante && { eleve: { classe: { annee: anneeCourante } } }) }, eleveRelFilter),
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          nom: true,
          type: true,
          url: true,
          createdAt: true,
        },
      }),
    ]);

  // Statistiques absences
  const absStats = {
    total: absences.length,
    injustifiees: absences.filter((a) => a.statut === "INJUSTIFIEE").length,
    justifiees: absences.filter((a) => a.statut === "JUSTIFIEE").length,
    retards: absences.filter((a) => a.isRetard).length,
  };

  // Statistiques factures
  const factStats = {
    total: factures.length,
    payees: factures.filter((f) => f.statut === "PAYEE").length,
    enAttente: factures.filter((f) => f.statut === "EN_ATTENTE").length,
    enRetard: factures.filter((f) => f.statut === "EN_RETARD").length,
    montantDu: factures
      .filter((f) => f.statut !== "PAYEE" && f.statut !== "ANNULEE")
      .reduce((sum, f) => sum + f.montant, 0),
  };

  // --- Tâches auto-générées pour le parent (factures en retard, réinscription…) ---
  try {
    await synchroniserTachesAuto(tenantId, session!.user);
  } catch (e) {
    console.error("[Parent page] Auto-sync tâches échoué:", e);
  }

  const mesTachesParent = await prisma.tache.findMany({
    where: {
      tenantId,
      assigneeAId: session!.user.id,
      statut: { in: ["A_FAIRE", "EN_COURS"] },
      ...(anneeCourante ? { classe: { annee: anneeCourante } } : {}),
    },
    include: {
      assigneeA: { select: { id: true, name: true, email: true } },
      creePar: { select: { id: true, name: true } },
      classe: { select: { id: true, nom: true } },
      matiere: { select: { id: true, nom: true } },
    },
    orderBy: [{ echeance: "asc" }, { priorite: "desc" }],
    take: 50,
  });

  const tachesParentSerialisees: TacheData[] = mesTachesParent.map((t) => ({
    id: t.id,
    titre: t.titre,
    description: t.description,
    type: t.type,
    priorite: t.priorite,
    statut: t.statut,
    echeance: t.echeance?.toISOString() ?? null,
    dateFaite: t.dateFaite?.toISOString() ?? null,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
    assigneeA: t.assigneeA,
    creePar: t.creePar,
    classe: t.classe,
    matiere: t.matiere,
  }));

  // --- Contenu des onglets (pré-calculé pour la nouvelle API `panels`) ---
  const overviewPanel = (
    <div className="space-y-4">
      {/* Mes actions à faire */}
      {tachesParentSerialisees.length > 0 && (
        <TaskTimeline
          taches={tachesParentSerialisees}
          maintenant={maintenant.toISOString()}
          compact
          title="Mes actions à faire"
        />
      )}
      {/* Cartes statistiques rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={t("moyenne")}
          value={
            bulletins.length > 0 && bulletins[0].moyenneGenerale
              ? bulletins[0].moyenneGenerale.toFixed(2)
              : "—"
          }
          color="text-blue-600"
        />
        <StatCard
          label={t("rang")}
          value={
            bulletins.length > 0 && bulletins[0].rang
              ? `${bulletins[0].rang}/${bulletins[0].effectifClasse ?? "?"}`
              : "—"
          }
          color="text-purple-600"
        />
        <StatCard
          label={t("absences")}
          value={String(absStats.total)}
          sub={
            absStats.injustifiees > 0
              ? `${absStats.injustifiees} ${t("injustifiees")}`
              : undefined
          }
          color={absStats.injustifiees > 0 ? "text-red-600" : "text-green-600"}
        />
        {isGardien && (
          <StatCard
            label={t("aPayer")}
            value={
              factStats.montantDu > 0
                ? new Intl.NumberFormat("fr-DJ", {
                    style: "currency",
                    currency: "DJF",
                    maximumFractionDigits: 0,
                  }).format(factStats.montantDu)
                : "0"
            }
            color={factStats.montantDu > 0 ? "text-orange-600" : "text-green-600"}
          />
        )}
      </div>

      {dossier && <DossierEnfant dossier={dossier} perspective="parent" />}

      <PreferencesParentForm initiales={preferences} />
    </div>
  );

  const notesPanel = (
    <div className="space-y-4">
      {/* Bulletins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bulletins")}</CardTitle>
        </CardHeader>
        <CardContent>
          {bulletins.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunBulletin")}</p>
          ) : (
            <div className="space-y-2">
              {bulletins.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <div className="text-sm">
                    <p className="font-medium">{b.periode.nom}</p>
                    {b.moyenneGenerale != null && (
                      <p className="text-muted-foreground">
                        {t("moyenne")}: {b.moyenneGenerale.toFixed(2)}
                        {b.rang && ` · ${t("rang")}: ${b.rang}/${b.effectifClasse ?? "?"}`}
                      </p>
                    )}
                    {b.appreciation && (
                      <p className="text-muted-foreground italic">{b.appreciation}</p>
                    )}
                    {b.decision && (
                      <Badge
                        variant={
                          b.decision === "PASSAGE" ? "success" :
                          b.decision === "REDOUBLEMENT" ? "destructive" : "warning"
                        }
                        className="mt-1"
                      >
                        {b.decision}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {b.isPublie && (
                      <Link href={`/bulletin/${b.id}`}>
                        <Button variant="outline" size="sm">
                          {t("voirBulletin")}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes récentes par matière */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notesRecentes")}</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneNote")}</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-2 border-b pb-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {n.matiere.nom}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.intitule || n.type || "—"}
                      {" · "}
                      {new Intl.DateTimeFormat("fr-FR").format(n.date)}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        n.valeur / n.noteMax < 0.5
                          ? "text-red-600"
                          : n.valeur / n.noteMax < 0.75
                            ? "text-orange-600"
                            : "text-green-600"
                      )}
                    >
                      {n.valeur}/{n.noteMax}
                    </span>
                    {n.coefficient !== 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ×{n.coefficient}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const competencesPanel = <CompetencesEleve eleveId={choisi.id} />;

  const absencesPanel = (
    <div className="space-y-4">
      {/* Stats absences */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label={t("total")}
          value={String(absStats.total)}
          color="text-blue-600"
        />
        <StatCard
          label={t("injustifiees")}
          value={String(absStats.injustifiees)}
          color={absStats.injustifiees > 0 ? "text-red-600" : "text-green-600"}
        />
        <StatCard
          label={t("retards")}
          value={String(absStats.retards)}
          color="text-orange-600"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("historiqueAbsences")}</CardTitle>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneAbsence")}</p>
          ) : (
            <div className="space-y-3">
              {absences.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="text-sm">
                    <p className="font-medium">
                      {new Intl.DateTimeFormat("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }).format(a.date)}
                    </p>
                    {(a.heureDebut || a.heureFin) && (
                      <p className="text-muted-foreground">
                        {a.heureDebut ?? "—"} – {a.heureFin ?? "—"}
                        {a.isRetard && ` · ${t("retard")}`}
                      </p>
                    )}
                    {a.motif && (
                      <p className="text-muted-foreground italic">{a.motif}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        a.statut === "JUSTIFIEE" ? "success" :
                        a.statut === "INJUSTIFIEE" ? "destructive" : "warning"
                      }
                    >
                      {a.statut === "JUSTIFIEE"
                        ? t("justifiee")
                        : a.statut === "INJUSTIFIEE"
                          ? t("injustifiee")
                          : t("enAttente")}
                    </Badge>
                    {a.statut === "INJUSTIFIEE" && (
                      <JustifierAbsenceForm
                        absenceId={a.id}
                        dateLabel={new Intl.DateTimeFormat("fr-FR").format(a.date)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const edtPanel = <ParentEdtView entries={edt as any} />;

  const documentsPanel = (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("documents")}</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunDocument")}</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.type}
                      {" · "}
                      {new Intl.DateTimeFormat("fr-FR").format(d.createdAt)}
                    </p>
                  </div>
                  <span className="text-primary text-sm">↓</span>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lien vers attestations */}
      <Card>
        <CardContent className="py-3">
          <Link href={`/eleves/${choisi.id}`}>
            <Button variant="outline" className="w-full">
              {t("voirDossierComplet")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );

  const messagesPanel = (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3">
          <Link href={`/messages?eleve=${choisi.id}`}>
            <Button className="w-full">
              {t("prendreRdv")}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("conversationsRecentes")}</CardTitle>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneConversation")}</p>
          ) : (
            <div className="space-y-2">
              {conversations.map((c) => {
                const last = c.messages[0];
                return (
                  <Link
                    key={c.id}
                    href={`/messages?c=${c.id}`}
                    className="block border-b pb-2 last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded"
                  >
                    <p className="text-sm font-medium truncate">{c.subject}</p>
                    {last && (
                      <p className="text-xs text-muted-foreground truncate">
                        {last.sender?.name}: {last.content}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const evolutionPanel = <EvolutionEleve eleveId={choisi.id} />;

  const facturesPanel = (
    <div className="space-y-4">
      {/* Stats factures */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label={t("payees")}
          value={String(factStats.payees)}
          color="text-green-600"
        />
        <StatCard
          label={t("enAttente")}
          value={String(factStats.enAttente + factStats.enRetard)}
          color="text-orange-600"
        />
        <StatCard
          label={t("aPayer")}
          value={
            factStats.montantDu > 0
              ? new Intl.NumberFormat("fr-DJ", {
                  style: "currency",
                  currency: "DJF",
                  maximumFractionDigits: 0,
                }).format(factStats.montantDu)
              : "0"
          }
          color={factStats.montantDu > 0 ? "text-red-600" : "text-green-600"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("facturesEnfant")}</CardTitle>
        </CardHeader>
        <CardContent>
          {factures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneFacture")}</p>
          ) : (
            <div className="space-y-3">
              {factures.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0"
                >
                  <div className="text-sm">
                    <p className="font-medium">{f.libelle}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.numero}
                      {f.echeance &&
                        ` · ${t("echeance")}: ${new Intl.DateTimeFormat("fr-FR").format(f.echeance)}`}
                    </p>
                    {f.paiements.length > 0 && (
                      <p className="text-xs text-green-600 mt-0.5">
                        {t("payeeLe")}{" "}
                        {new Intl.DateTimeFormat("fr-FR").format(
                          f.paiements[0].date
                        )}{" "}
                        ({f.paiements[0].methode})
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {new Intl.NumberFormat("fr-DJ", {
                        style: "currency",
                        currency: f.devise === "XOF" ? "DJF" : f.devise,
                        maximumFractionDigits: 0,
                      }).format(f.montant)}
                    </span>
                    <Badge
                      variant={
                        f.statut === "PAYEE" ? "success" :
                        f.statut === "EN_RETARD" ? "destructive" :
                        f.statut === "ANNULEE" ? "secondary" : "warning"
                      }
                    >
                      {f.statut === "PAYEE"
                        ? t("statutPayee")
                        : f.statut === "EN_RETARD"
                          ? t("statutRetard")
                          : f.statut === "ANNULEE"
                            ? t("statutAnnulee")
                            : t("statutAttente")}
                    </Badge>
                    <Link href={`/parent/factures/${f.id}`}>
                      <Button variant="outline" size="sm">
                        {t("voirDetails")}
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {entete}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 sm:px-6 lg:px-8 scrollbar-thin">
        {/* Sélecteur d'enfant */}
        {enfants.length > 1 && (
          <nav aria-label={t("choisirEnfant")} className="flex flex-wrap gap-2">
            {enfants.map((e) => (
              <Link
                key={e.id}
                href={`/parent?enfant=${e.id}`}
                aria-current={e.id === choisi.id ? "page" : undefined}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  e.id === choisi.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                )}
              >
                {e.prenom} {e.nom}
              </Link>
            ))}
          </nav>
        )}

        {/* En-tête enfant */}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg sm:text-xl font-semibold truncate">
            {choisi.prenom} {choisi.nom}
          </h2>
          {choisi.classe && <Badge variant="outline">{choisi.classe.nom}</Badge>}
        </div>

        {/* Onglets du portail parent */}
        <ParentPortalTabs
          hasFactures={isGardien}
          panels={{
            overview: overviewPanel,
            notes: notesPanel,
            competences: competencesPanel,
            absences: absencesPanel,
            edt: edtPanel,
            documents: documentsPanel,
            messages: messagesPanel,
            evolution: evolutionPanel,
            ...(isGardien ? { factures: facturesPanel } : {}),
          }}
        />
      </div>
    </div>
  );
}

// --- Composant carte statistique ---
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold", color)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Préférences de la famille, avec repli sur les valeurs par défaut.
 */
async function preferencesDuCompte(tenantId: string, userId: string) {
  // eslint-disable-next-line ecolpro/require-site-filter
  const parent = await prisma.parent.findFirst({
    where: { tenantId, userId },
    select: {
      learnosPreferences: {
        select: {
          alertesActives: true,
          niveauMinimal: true,
          langue: true,
          plafondHebdomadaire: true,
        },
      },
    },
  });
  return parent?.learnosPreferences ?? PREFERENCES_PAR_DEFAUT;
}
