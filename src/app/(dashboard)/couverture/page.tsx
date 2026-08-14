import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel } from "@/lib/site-scope";
import type { Jour, StatutRemplacement } from "@prisma/client";

/**
 * Couverture des cours du jour — console de la direction.
 *
 * Répond à une question opérationnelle : quels cours sont découverts aujourd'hui
 * à cause d'une absence, et comment sont-ils compensés ? Cinq compteurs résument
 * la situation, une liste détaillée les remplacements du jour.
 */
export default async function CouverturePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("couverture"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user;

  // — Bornes du jour courant —
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );

  // Mapping getDay() (0=dimanche) → enum Jour du schéma.
  const JOUR_PAR_INDEX: Jour[] = [
    "DIMANCHE",
    "LUNDI",
    "MARDI",
    "MERCREDI",
    "JEUDI",
    "VENDREDI",
    "SAMEDI",
  ];
  const jourAujourdhui = JOUR_PAR_INDEX[now.getDay()];

  // 1. Absences du personnel du jour (le modèle porte un champ `date` unique).
  const absencesPersonnel = await prisma.absencePersonnel.count({
    where: {
      tenantId,
      date: { gte: todayStart, lt: todayEnd },
      ...siteFilterForModel("absencePersonnel", claims),
    },
  });

  // 2. Créneaux orphelins : cours de l'emploi du temps dont l'enseignant est
  //    absent aujourd'hui. On récupère d'abord les identifiants des enseignants
  //    absents, puis on compte les créneaux du jour qui leur sont assignés.
  const absencesDuJour = await prisma.absencePersonnel.findMany({
    where: {
      tenantId,
      date: { gte: todayStart, lt: todayEnd },
      ...siteFilterForModel("absencePersonnel", claims),
    },
    select: { enseignantId: true },
  });
  const enseignantsAbsents = Array.from(
    new Set(absencesDuJour.map((a) => a.enseignantId))
  );

  const creneauxOrphelins =
    enseignantsAbsents.length > 0
      ? await prisma.emploiTemps.count({
          where: {
            tenantId,
            jour: jourAujourdhui,
            enseignantId: { in: enseignantsAbsents },
            ...siteFilterForModel("emploiTemps", claims),
          },
        })
      : 0;

  // 3 & 4. Remplacements proposés / validés du jour.
  const remplacementsProposes = await prisma.remplacementCours.count({
    where: {
      tenantId,
      date: { gte: todayStart, lt: todayEnd },
      statut: "PROPOSE" as StatutRemplacement,
      ...siteFilterForModel("remplacementCours", claims),
    },
  });

  const remplacementsValides = await prisma.remplacementCours.count({
    where: {
      tenantId,
      date: { gte: todayStart, lt: todayEnd },
      statut: "VALIDE" as StatutRemplacement,
      ...siteFilterForModel("remplacementCours", claims),
    },
  });

  // 5. Remplacements en attente de décision sur les 7 prochains jours.
  const dansSeptJours = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 7
  );
  const enAttente = await prisma.remplacementCours.count({
    where: {
      tenantId,
      date: { gte: todayStart, lt: dansSeptJours },
      statut: "PROPOSE" as StatutRemplacement,
      ...siteFilterForModel("remplacementCours", claims),
    },
  });

  // — Liste détaillée des remplacements du jour —
  const remplacements = await prisma.remplacementCours.findMany({
    where: {
      tenantId,
      date: { gte: todayStart, lt: todayEnd },
      ...siteFilterForModel("remplacementCours", claims),
    },
    include: {
      classe: { select: { nom: true } },
      matiere: { select: { nom: true } },
      enseignantAbsent: {
        include: { user: { select: { name: true } } },
      },
      enseignantRemplacant: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: [{ heureDebut: "asc" }],
  });

  const compteurs = [
    { label: t("absencesPersonnel"), value: absencesPersonnel, color: "text-rose-600" },
    { label: t("creneauxOrphelins"), value: creneauxOrphelins, color: "text-amber-600" },
    { label: t("remplacementsProposes"), value: remplacementsProposes, color: "text-sky-600" },
    { label: t("remplacementsValides"), value: remplacementsValides, color: "text-emerald-600" },
    { label: t("enAttente"), value: enAttente, color: "text-violet-600" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-6 scrollbar-thin">
        {/* Compteurs — cartes cliquables menant à la liste détaillée. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {compteurs.map((c) => (
            <Link key={c.label} href="#remplacements" className="group">
              <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className={`text-3xl font-bold ${c.color}`}>
                    {c.value}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {c.label}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Liste des remplacements du jour. */}
        <div id="remplacements" className="space-y-4">
          <h2 className="text-lg font-semibold">{t("titre")}</h2>
          {remplacements.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("aucunRemplacement")}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t("classe")}</th>
                        <th className="px-4 py-3 font-medium">{t("matiere")}</th>
                        <th className="px-4 py-3 font-medium">{t("absent")}</th>
                        <th className="px-4 py-3 font-medium">{t("remplacant")}</th>
                        <th className="px-4 py-3 font-medium">{t("statut")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remplacements.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-4 py-3">{r.classe.nom}</td>
                          <td className="px-4 py-3">{r.matiere.nom}</td>
                          <td className="px-4 py-3">
                            {r.enseignantAbsent?.user.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {r.enseignantRemplacant?.user.name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {r.statut}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
