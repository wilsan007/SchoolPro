import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  siteFilterForModel,
  personalScopeFilter,
  mergeFilters,
} from "@/lib/site-scope";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classeId = searchParams.get("classeId");
    const periodeId = searchParams.get("periodeId");

    if (!classeId || !periodeId) {
      return NextResponse.json({ error: "classeId et periodeId requis" }, { status: 400 });
    }

    const tenantId = session.user.tenantId;

    // Cette route ne contrôle aucune permission : n'importe quel compte
    // authentifié l'atteint, y compris un PARENT ou un élève. Or pour ces deux
    // rôles le filtre de site est NEUTRE (périmètre relationnel, voir
    // `RELATION_SCOPED_ROLES` dans site-scope.ts) : la matrice livrait toutes
    // les notes, moyennes et rangs nominatifs de la classe demandée. Seul
    // `personalScopeFilter` les borne à leurs propres enfants, et il ne change
    // rien pour le personnel (il renvoie `{}`).
    const eleveScope = personalScopeFilter(session.user, null);
    const relationScope = personalScopeFilter(session.user, "eleve");

    // 1. Récupérer élèves + bulletins + notes en parallèle (3 requêtes simultanées)
    const [eleves, bulletins, notes] = await Promise.all([
      prisma.eleve.findMany({
        where: {
          classeId,
          tenantId,
          statut: "ACTIF",
          ...mergeFilters(siteFilterForModel("eleve", session.user), eleveScope),
        },
        select: {
          id: true, nom: true, prenom: true, matricule: true,
          sexe: true, dateNaissance: true,
        },
        orderBy: [{ prenom: "asc" }, { nom: "asc" }],
      }),
      prisma.bulletin.findMany({
        where: {
          eleve: { classeId, tenantId, statut: "ACTIF" },
          periodeId,
          tenantId,
          ...mergeFilters(
            siteFilterForModel("bulletin", session.user),
            relationScope
          ),
        },
        include: {
          // Les lignes de matière suivent le bulletin parent, déjà borné au
          // tenant et au périmètre de sites : elles ne peuvent appartenir qu'à
          // un bulletin autorisé. `BulletinMatiere` n'offre par ailleurs aucun
          // chemin de site propre (elle passe par le bulletin, qui n'a pas de
          // colonne `siteId`).
          // eslint-disable-next-line ecolpro/require-site-filter
          matieres: { include: { matiere: { select: { id: true, nom: true, code: true } } } },
        },
      }),
      prisma.note.findMany({
        where: {
          classeId,
          periodeId,
          tenantId,
          ...mergeFilters(siteFilterForModel("note", session.user), relationScope),
        },
        select: {
          id: true, eleveId: true, matiereId: true,
          valeur: true, noteMax: true, coefficient: true,
          type: true, intitule: true, date: true,
        },
        orderBy: [{ matiereId: "asc" }, { date: "asc" }],
      }),
    ]);

    if (eleves.length === 0) {
      return NextResponse.json({ error: "Aucun élève dans cette classe" }, { status: 404 });
    }

    const eleveIds = eleves.map((e) => e.id);

    // 4. Construire la liste des matières (union de toutes les matières ayant des notes ou bulletins)
    const matiereMap = new Map<string, { id: string; nom: string; code: string }>();
    for (const b of bulletins) {
      for (const bm of b.matieres) {
        if (!matiereMap.has(bm.matiereId)) {
          matiereMap.set(bm.matiereId, {
            id: bm.matiereId,
            nom: bm.matiere.nom,
            code: bm.matiere.code,
          });
        }
      }
    }
    // Ajouter les matières qui ont des notes mais pas encore de bulletin (batch query)
    const missingMatiereIds = [...new Set(notes.map((n) => n.matiereId))].filter((id) => !matiereMap.has(id));
    if (missingMatiereIds.length > 0) {
      const missingMatieres = await prisma.matiere.findMany({
        where: { id: { in: missingMatiereIds }, tenantId, ...siteFilterForModel("matiere", session.user) },
        select: { id: true, nom: true, code: true },
      });
      for (const m of missingMatieres) matiereMap.set(m.id, m);
    }

    const matieres = Array.from(matiereMap.values()).sort((a, b) =>
      a.nom.localeCompare(b.nom)
    );

    // 5. Pour chaque matière, déterminer le nombre max d'examens (single pass)
    const examCountByMatiere = new Map<string, number>();
    const noteCountByMatiereEleve = new Map<string, number>();
    for (const n of notes) {
      const key = `${n.matiereId}:${n.eleveId}`;
      noteCountByMatiereEleve.set(key, (noteCountByMatiereEleve.get(key) ?? 0) + 1);
    }
    for (const m of matieres) {
      let maxCount = 0;
      for (const eid of eleveIds) {
        const count = noteCountByMatiereEleve.get(`${m.id}:${eid}`) ?? 0;
        if (count > maxCount) maxCount = count;
      }
      examCountByMatiere.set(m.id, maxCount);
    }

    // 6. Construire les données par élève — index pré-calculé pour O(1)
    const notesByMatiereEleve = new Map<string, typeof notes>();
    for (const n of notes) {
      const key = `${n.matiereId}:${n.eleveId}`;
      if (!notesByMatiereEleve.has(key)) notesByMatiereEleve.set(key, []);
      notesByMatiereEleve.get(key)!.push(n);
    }
    const bulletinByEleve = new Map(bulletins.map((b) => [b.eleveId, b]));

    type EleveData = {
      id: string; nom: string; prenom: string; matricule: string;
      matieres: Record<string, {
        notes: (number | null)[];
        moyenne: number | null;
        rang: number | null;
        coefficient: number;
      }>;
      moyenneGenerale: number | null;
      moyenneClasse: number | null;
      rang: number | null;
      effectif: number | null;
    };

    const elevesData: EleveData[] = eleves.map((e) => {
      const bulletin = bulletinByEleve.get(e.id);
      const matieresData: EleveData["matieres"] = {};

      for (const m of matieres) {
        const eleveNotes: (number | null)[] = (notesByMatiereEleve.get(`${m.id}:${e.id}`) ?? [])
          .map((n) => n.valeur);
        const examCount = examCountByMatiere.get(m.id) ?? 0;
        while (eleveNotes.length < examCount) eleveNotes.push(null);

        const bm = bulletin?.matieres.find((bm) => bm.matiereId === m.id);
        matieresData[m.id] = {
          notes: eleveNotes,
          moyenne: bm?.moyenneEleve ?? null,
          rang: bm?.rang ?? null,
          coefficient: bm?.coefficient ?? 1,
        };
      }

      return {
        id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        matricule: e.matricule,
        matieres: matieresData,
        moyenneGenerale: bulletin?.moyenneGenerale ?? null,
        moyenneClasse: bulletin?.moyenneClasse ?? null,
        rang: bulletin?.rang ?? null,
        effectif: bulletin?.effectifClasse ?? null,
      };
    });

    // 7. Calculer la moyenne de classe par matière (si pas déjà dans les bulletins)
    const moyenneClasseByMatiere: Record<string, number | null> = {};
    for (const m of matieres) {
      const moyennes = elevesData
        .map((e) => e.matieres[m.id]?.moyenne)
        .filter((v): v is number => v !== null);
      moyenneClasseByMatiere[m.id] =
        moyennes.length > 0
          ? Number((moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2))
          : null;
    }

    // 8. Section annuelle (si periode numero === 3, récupérer T1 et T2)
    let annuelle: null | {
      moyennesTrim: { periodeNom: string; moyenne: number | null; rang: number | null }[];
      moyenneAnnuelle: number | null;
      rangAnnuel: number | null;
      decision: string | null;
    } = null;

    const periode = await prisma.periode.findUnique({
      where: { id: periodeId },
      include: { annee: true },
    });

    if (periode && periode.numero === 3) {
      // Récupérer toutes les périodes de l'année
      const allPeriodes = await prisma.periode.findMany({
        where: { anneeId: periode.anneeId },
        orderBy: { numero: "asc" },
      });

      // Batch: récupérer tous les bulletins de toutes les périodes en une seule requête
      const allPeriodeIds = allPeriodes.map((p) => p.id);
      const allBullTrim = await prisma.bulletin.findMany({
        where: {
          eleveId: { in: eleveIds },
          periodeId: { in: allPeriodeIds },
          tenantId,
          ...mergeFilters(
            siteFilterForModel("bulletin", session.user),
            relationScope
          ),
        },
        select: { eleveId: true, periodeId: true, moyenneGenerale: true, rang: true },
      });

      const moyennesTrim = allPeriodes.map((p) => {
        const bulls = allBullTrim.filter((b) => b.periodeId === p.id);
        const byEleve = new Map(bulls.map((b) => [b.eleveId, b]));
        return {
          periodeNom: p.nom,
          numero: p.numero,
          eleves: eleves.map((e) => ({
            eleveId: e.id,
            moyenne: byEleve.get(e.id)?.moyenneGenerale ?? null,
            rang: byEleve.get(e.id)?.rang ?? null,
          })),
        };
      });

      // Calculer moyenne annuelle par élève
      const annuelleByEleve: Record<string, { moyenne: number | null; rang: number | null; decision: string | null }> = {};
      for (const e of eleves) {
        const moyennes = moyennesTrim
          .map((t) => t.eleves.find((te) => te.eleveId === e.id)?.moyenne)
          .filter((v): v is number => v !== null);
        const moyAnnuelle = moyennes.length > 0
          ? Number((moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2))
          : null;

        // Récupérer la décision depuis le bulletin T3
        const bullT3 = bulletins.find((b) => b.eleveId === e.id);
        annuelleByEleve[e.id] = {
          moyenne: moyAnnuelle,
          rang: null, // calculé ci-dessous
          decision: bullT3?.decision ?? null,
        };
      }

      // Calculer le rang annuel
      const elevesAvecMoy = eleves
        .map((e) => ({ id: e.id, moy: annuelleByEleve[e.id]?.moyenne }))
        .filter((e) => e.moy !== null)
        .sort((a, b) => (b.moy! - a.moy!));
      elevesAvecMoy.forEach((e, i) => {
        if (annuelleByEleve[e.id]) annuelleByEleve[e.id].rang = i + 1;
      });

      annuelle = {
        moyennesTrim: moyennesTrim.map((t) => ({
          periodeNom: t.periodeNom,
          moyenne: null, // pas utilisé ici, on a les données par élève
          rang: null,
        })),
        moyenneAnnuelle: null,
        rangAnnuel: null,
        decision: null,
      };

      // On renvoie les données annuelles par élève
      return NextResponse.json({
        eleves: elevesData,
        matieres: matieres.map((m) => ({
          ...m,
          examCount: examCountByMatiere.get(m.id) ?? 0,
          moyenneClasse: moyenneClasseByMatiere[m.id],
        })),
        annuelle: {
          periodes: moyennesTrim.map((t) => ({ nom: t.periodeNom, numero: t.numero })),
          elevesAnnuelle: eleves.map((e) => ({
            eleveId: e.id,
            moyennesTrim: moyennesTrim.map((t) => ({
              periodeNom: t.periodeNom,
              numero: t.numero,
              moyenne: t.eleves.find((te) => te.eleveId === e.id)?.moyenne ?? null,
              rang: t.eleves.find((te) => te.eleveId === e.id)?.rang ?? null,
            })),
            moyenneAnnuelle: annuelleByEleve[e.id]?.moyenne ?? null,
            rangAnnuel: annuelleByEleve[e.id]?.rang ?? null,
            decision: annuelleByEleve[e.id]?.decision ?? null,
          })),
        },
        periodeNom: periode.nom,
        periodeNumero: periode.numero,
      });
    }

    return NextResponse.json({
      eleves: elevesData,
      matieres: matieres.map((m) => ({
        ...m,
        examCount: examCountByMatiere.get(m.id) ?? 0,
        moyenneClasse: moyenneClasseByMatiere[m.id],
      })),
      annuelle: null,
      periodeNom: periode?.nom ?? "",
      periodeNumero: periode?.numero ?? 0,
    });
  } catch (error) {
    console.error("[API/bulletins/matrice]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
