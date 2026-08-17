import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { guardPage } from "@/lib/guard-page";
import { getTranslations } from "next-intl/server";
import { siteFilterForModel, type SessionSiteClaims } from "@/lib/site-scope";

const SEUIL_DIFFICULTE = 10;

export default async function MaMatierePage() {
  const [session, t] = await Promise.all([
    auth(),
    getTranslations("maMatiere"),
  ]);
  await guardPage(session);

  const tenantId = session!.user.tenantId!;
  const claims = session!.user as SessionSiteClaims;

  const enseignant = await prisma.enseignant.findFirst({
    where: {
      userId: session!.user.id,
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
  });

  if (!enseignant) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          title={t("titre")}
          subtitle={t("sousTitre")}
          userName={session!.user.name}
          userAvatar={session!.user.image ?? undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucuneClasse")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const emplois = await prisma.emploiTemps.findMany({
    where: {
      enseignantId: enseignant.id,
      tenantId,
      ...siteFilterForModel("emploiTemps", claims),
    },
    select: { matiereId: true, classeId: true },
    distinct: ["matiereId", "classeId"],
  });

  const matiereIds = Array.from(new Set(emplois.map((e) => e.matiereId)));
  const matiereId = matiereIds[0];
  if (!matiereId) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header
          title={t("titre")}
          subtitle={t("sousTitre")}
          userName={session!.user.name}
          userAvatar={session!.user.image ?? undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 scrollbar-thin">
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucuneClasse")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const matiere = await prisma.matiere.findFirst({
    where: {
      id: matiereId,
      tenantId,
      ...siteFilterForModel("matiere", claims),
    },
  });

  const emploisMatiere = await prisma.emploiTemps.findMany({
    where: {
      matiereId,
      tenantId,
      ...siteFilterForModel("emploiTemps", claims),
    },
    select: { classeId: true },
    distinct: ["classeId"],
  });
  const classeIds = emploisMatiere.map((e) => e.classeId);

  const [classes, notes, chapitres, enseignantsEmplois] = await Promise.all([
    prisma.classe.findMany({
      where: {
        id: { in: classeIds },
        tenantId,
        ...siteFilterForModel("classe", claims),
      },
      select: {
        id: true,
        nom: true,
        niveau: true,
        eleves: { where: { statut: "ACTIF" }, select: { id: true } },
      },
    }),
    prisma.note.findMany({
      where: {
        matiereId,
        tenantId,
        ...siteFilterForModel("note", claims),
      },
      select: {
        id: true,
        eleveId: true,
        classeId: true,
        valeur: true,
        noteMax: true,
      },
    }),
    prisma.chapitre.findMany({
      where: {
        matiereId,
        tenantId,
        ...siteFilterForModel("chapitre", claims),
      },
      select: {
        id: true,
        planifications: { select: { statut: true } },
      },
    }),
    prisma.emploiTemps.findMany({
      where: {
        matiereId,
        tenantId,
        ...siteFilterForModel("emploiTemps", claims),
      },
      select: { enseignantId: true },
      distinct: ["enseignantId"],
    }),
  ]);

  const classesById = new Map(classes.map((c) => [c.id, c]));
  const notesParClasse = new Map<string, number[]>();
  const notesParEleve = new Map<string, number[]>();
  for (const n of notes) {
    const norm = n.noteMax > 0 ? (n.valeur / n.noteMax) * 20 : n.valeur;
    if (n.classeId) {
      const arr = notesParClasse.get(n.classeId) ?? [];
      arr.push(norm);
      notesParClasse.set(n.classeId, arr);
    }
    const arrE = notesParEleve.get(n.eleveId) ?? [];
    arrE.push(norm);
    notesParEleve.set(n.eleveId, arrE);
  }

  const moyennesParClasse = classeIds
    .map((classeId) => {
      const cls = classesById.get(classeId);
      if (!cls) return null;
      const arr = notesParClasse.get(classeId) ?? [];
      const moyenne = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const nbEleves = cls.eleves.length;
      const elevesAvecNotes = cls.eleves.filter((e) => notesParEleve.has(e.id));
      const reussis = elevesAvecNotes.filter((e) => {
        const m = notesParEleve.get(e.id)!;
        return m.reduce((a, b) => a + b, 0) / m.length >= SEUIL_DIFFICULTE;
      }).length;
      const tauxReussite = elevesAvecNotes.length > 0 ? Math.round((reussis / elevesAvecNotes.length) * 100) : 0;
      return {
        id: classeId,
        nom: cls.nom,
        niveau: cls.niveau,
        moyenne,
        nbEleves,
        tauxReussite,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const toutesNotes = notes.map((n) => (n.noteMax > 0 ? (n.valeur / n.noteMax) * 20 : n.valeur));
  const moyenneGenerale = toutesNotes.length > 0 ? toutesNotes.reduce((a, b) => a + b, 0) / toutesNotes.length : null;

  const elevesEnDifficulte = Array.from(notesParEleve.entries()).filter(([, arr]) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return m < SEUIL_DIFFICULTE;
  }).length;

  const totalChapitres = chapitres.length;
  const chapitresCompletes = chapitres.filter((c) =>
    c.planifications.some((p) => p.statut === "TRAITE")
  ).length;

  const enseignantIds = enseignantsEmplois.map((e) => e.enseignantId).filter((id): id is string => id !== null);
  const enseignants = await prisma.enseignant.findMany({
    where: {
      id: { in: enseignantIds },
      tenantId,
      ...siteFilterForModel("enseignant", claims),
    },
    select: {
      id: true,
      specialite: true,
      user: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={matiere ? `${t("titre")} — ${matiere.nom}` : t("titre")}
        subtitle={t("sousTitre")}
        userName={session!.user.name}
        userAvatar={session!.user.image ?? undefined}
      />
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 scrollbar-thin">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("classes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{moyennesParClasse.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("moyenneGenerale")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {moyenneGenerale !== null ? moyenneGenerale.toFixed(2) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("chapitresCompletes")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {chapitresCompletes} / {totalChapitres}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t("elevesEnDifficulte")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">
                {elevesEnDifficulte}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("moyennesParClasse")}</CardTitle>
          </CardHeader>
          <CardContent>
            {moyennesParClasse.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucuneClasse")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-4 font-medium">{t("classe")}</th>
                      <th className="py-2 pr-4 font-medium">{t("moyenne")}</th>
                      <th className="py-2 pr-4 font-medium">{t("eleves")}</th>
                      <th className="py-2 font-medium">{t("tauxReussite")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moyennesParClasse.map((c) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{c.nom}</td>
                        <td className="py-2 pr-4">
                          {c.moyenne !== null ? c.moyenne.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 pr-4">{c.nbEleves}</td>
                        <td className="py-2">{c.tauxReussite}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("enseignants")}</CardTitle>
          </CardHeader>
          <CardContent>
            {enseignants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("aucunEnseignant")}
              </p>
            ) : (
              <div className="space-y-2">
                {enseignants.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{e.user.name ?? e.user.email}</p>
                      {e.specialite && (
                        <p className="text-xs text-muted-foreground">{e.specialite}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
