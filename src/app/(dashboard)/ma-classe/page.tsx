import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SuiviClasseView } from "@/components/learnos/SuiviClasseView";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";
import { syntheseClasse } from "@/lib/learnos/suivi-classe";
import { Users, MessageSquare, ExternalLink, ChevronRight } from "lucide-react";

/**
 * Espace du professeur principal.
 *
 * Porte le dossier de suivi unifié : croiser absences, difficultés, incidents
 * et impayés est ce qui rend visible un décrochage que chaque module, pris
 * séparément, laisse passer.
 *
 * Trois enrichissements y sont rattachés :
 *  1. Un raccourci vers le conseil de classe (BulletinsManager) ;
 *  2. Une fiche élève consolidée — moyennes par matière, absences, incidents ;
 *  3. Un contact famille en un geste, via la messagerie existante.
 */
export default async function MaClassePage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string }>;
}) {
  const [session, t, tmc] = await Promise.all([
    auth(),
    getTranslations("learnos.classe"),
    getTranslations("maClasse"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims: SessionSiteClaims = session!.user;
  const { classe: classeDemandee } = await searchParams;

  // Classes dont l'utilisateur est professeur principal. La direction, elle,
  // voit toutes les classes de son périmètre.
  const enseignant = await prisma.enseignant.findFirst({
    where: {
      tenantId,
      userId: session!.user.id,
      ...siteFilterForModel("enseignant", claims),
    },
    select: { id: true },
  });

  const classes = await prisma.classe.findMany({
    where: {
      tenantId,
      ...siteFilterForModel("classe", claims),
      ...(enseignant ? { profPrincipalId: enseignant.id } : {}),
    },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  const classeId = classeDemandee ?? classes[0]?.id;
  const synthese = classeId
    ? await syntheseClasse(tenantId, classeId, claims)
    : null;

  // ---------------------------------------------------------------
  // Fiche élève consolidée + contact famille
  // ---------------------------------------------------------------
  // On ne charge ces données que pour la classe actuellement affichée :
  // inutile de les calculer pour toutes les classes du sélecteur.
  let fiches: FicheEleveConsolidee[] = [];
  if (synthese && classeId) {
    fiches = await chargerFichesConsolidees(tenantId, classeId, claims);
  }

  const isProfPrincipal = claims.role === "CLASS_TEACHER";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={synthese ? `${t("titre")} — ${synthese.classeNom}` : t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin space-y-6">
        {!synthese ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t("aucuneClasse")}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 1. Raccourci vers le conseil de classe — prof principal seul. */}
            {isProfPrincipal && (
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link href="/notes/bulletins">
                    <Users className="h-4 w-4 mr-2" />
                    {tmc("conseilClasse")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            )}

            {/* Suivi unifié existant — conservé intact. */}
            <SuiviClasseView synthese={synthese} />

            {/* 2. Fiches élèves consolidées (toutes matières). */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {tmc("ficheConsolidee")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fiches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    {t("aucuneClasse")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">{tmc("eleve")}</th>
                          <th className="py-2 pr-4 font-medium">{tmc("moyenne")}</th>
                          <th className="py-2 pr-4 font-medium">{tmc("absences")}</th>
                          <th className="py-2 pr-4 font-medium">{tmc("incidents")}</th>
                          <th className="py-2 pr-4 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {fiches.map((f) => (
                          <tr key={f.id} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <span className="font-medium">
                                {f.nom} {f.prenom}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {f.matricule}
                              </span>
                            </td>
                            <td className="py-2 pr-4">
                              {f.moyenneGenerale === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <span className="font-medium">
                                  {f.moyenneGenerale.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-4">{f.nbAbsences}</td>
                            <td className="py-2 pr-4">{f.nbIncidents}</td>
                            <td className="py-2 pr-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* 3. Contact famille — uniquement si un parent est rattaché. */}
                                {f.aParent ? (
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                  >
                                    <Link href={`/messages?eleve=${f.id}`}>
                                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                                      {tmc("contacterFamille")}
                                    </Link>
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {tmc("aucunParent")}
                                  </span>
                                )}
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="h-8"
                                >
                                  <Link href={`/eleves/${f.id}`}>
                                    {tmc("details")}
                                    <ExternalLink className="h-3.5 w-3.5 ml-1" />
                                  </Link>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Types & chargement des données consolidées
// ---------------------------------------------------------------

interface FicheEleveConsolidee {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  /** Moyenne générale : moyenne des moyennes par matière. */
  moyenneGenerale: number | null;
  nbAbsences: number;
  nbIncidents: number;
  /** `true` si au moins un parent est rattaché (bouton contact visible). */
  aParent: boolean;
}

/**
 * Charge, pour tous les élèves actifs de la classe, les données croisées
 * nécessaires à la fiche consolidée : moyennes par matière, absences,
 * incidents et rattachement d'un parent.
 *
 * Un seul aller-retour par famille de signaux (et non un par élève) : à ~200 ms
 * la requête, interroger élève par élève rendrait l'écran inutilisable dès
 * trente inscrits.
 */
async function chargerFichesConsolidees(
  tenantId: string,
  classeId: string,
  claims: SessionSiteClaims
): Promise<FicheEleveConsolidee[]> {
  const eleves = await prisma.eleve.findMany({
    where: {
      tenantId,
      classeId,
      statut: "ACTIF",
      deletedAt: null,
      ...siteFilterForModel("eleve", claims),
    },
    select: { id: true, nom: true, prenom: true, matricule: true },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });
  if (eleves.length === 0) return [];

  const ids = eleves.map((e) => e.id);

  const noteFilter = {
    tenantId,
    classeId,
    eleveId: { in: ids },
    ...siteFilterForModel("note", claims),
  };

  const [notesParMatiere, absences, incidents, eleveParents] =
    await Promise.all([
      // Moyenne par matière et par élève.
      prisma.note.groupBy({
        by: ["eleveId", "matiereId"],
        where: noteFilter,
        _avg: { valeur: true },
      }),
      // Nombre d'absences par élève.
      prisma.absence.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          eleveId: { in: ids },
          ...siteFilterForModel("absence", claims),
        },
        _count: { eleveId: true },
      }),
      // Nombre d'incidents par élève (le champ de liaison s'appelle `eleveId`).
      prisma.incident.groupBy({
        by: ["eleveId"],
        where: {
          tenantId,
          eleveId: { in: ids },
          ...siteFilterForModel("incident", claims),
        },
        _count: { eleveId: true },
      }),
      // Rattachement parent — un seul suffit pour afficher le bouton de contact.
      prisma.eleveParent.findMany({
        where: {
          eleveId: { in: ids },
          ...siteFilterForModel("eleveParent", claims),
        },
        select: { eleveId: true },
      }),
    ]);

  const absencesParEleve = new Map(
    absences.map((a) => [a.eleveId, a._count.eleveId])
  );
  const incidentsParEleve = new Map(
    incidents.map((i) => [i.eleveId, i._count.eleveId])
  );
  const parentsParEleve = new Set(eleveParents.map((p) => p.eleveId));

  // Moyenne générale = moyenne des moyennes par matière (non pondérée par le
  // coefficient : la fiche consolidée vise un repère rapide, pas le bulletin
  // officiel qui, lui, est calculé par BulletinsManager).
  const moyennesParMatiereParEleve = new Map<
    string,
    { somme: number; count: number }
  >();
  for (const n of notesParMatiere) {
    const cur = moyennesParMatiereParEleve.get(n.eleveId) ?? {
      somme: 0,
      count: 0,
    };
    if (n._avg.valeur != null) {
      cur.somme += n._avg.valeur;
      cur.count += 1;
    }
    moyennesParMatiereParEleve.set(n.eleveId, cur);
  }

  return eleves.map((e) => {
    const moy = moyennesParMatiereParEleve.get(e.id);
    return {
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      matricule: e.matricule,
      moyenneGenerale: moy && moy.count > 0 ? moy.somme / moy.count : null,
      nbAbsences: absencesParEleve.get(e.id) ?? 0,
      nbIncidents: incidentsParEleve.get(e.id) ?? 0,
      aParent: parentsParEleve.has(e.id),
    };
  });
}
