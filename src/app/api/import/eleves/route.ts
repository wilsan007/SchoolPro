import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSchoolGroup } from "@/lib/school-groups";
import type { StructureType, Sexe } from "@prisma/client";
import { siteFilterForModel, requireSiteIdForCreate, mergeFilters } from "@/lib/site-scope";
import { getAnneeCouranteLibelle } from "@/lib/annee-scolaire";
import { revalidateTag } from "next/cache";
import { preparerPlan, dernierMatricule } from "@/lib/import-eleves-server";
import { matriculeGenerator, parseDate, type Action, type LignePlan } from "@/lib/import-eleves";
import { identityKey } from "@/lib/eleve-identity";
import { randomUUID } from "crypto";

// Mapping: nom du groupe scolaire → StructureType
const GROUP_TO_STRUCTURE: Record<string, StructureType> = {
  Primaire: "PRIMAIRE",
  Collège: "COLLEGE",
  Lycée: "LYCEE",
};

const STRUCTURE_LABELS: Record<StructureType, string> = {
  MATERNELLE: "Maternelle",
  PRIMAIRE: "Primaire",
  COLLEGE: "Collège",
  LYCEE: "Lycée",
};

/**
 * POST /api/import/eleves — seconde étape : appliquer le plan.
 *
 * Le client renvoie le fichier prévisualisé, son empreinte, et les décisions
 * qu'il a éventuellement modifiées. Le serveur **rejoue l'analyse** au lieu
 * de faire confiance au plan reçu : seule l'action par ligne est reprise du
 * client, jamais le verdict ni la fiche rapprochée.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "TENANT_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    const siteError = requireSiteIdForCreate(session.user);
    if (siteError) return NextResponse.json({ error: siteError }, { status: 400 });

    const tenantId = session.user.tenantId;
    const siteFilter = siteFilterForModel("eleve", session.user);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });

    const formSiteId = formData.get("siteId") as string | null;
    const targetSiteId = formSiteId || (session.user.siteId ?? null);

    // L'import doit avoir été prévisualisé : on refuse une écriture directe.
    const hashAttendu = formData.get("hash") as string | null;
    if (!hashAttendu) {
      return NextResponse.json(
        { error: "Import non prévisualisé. Analysez le fichier avant de confirmer." },
        { status: 400 }
      );
    }

    const acteur = {
      id: session.user.id,
      tenantId,
      role: session.user.role,
      siteId: session.user.siteId ?? null,
      siteIds: session.user.siteIds ?? [],
      tenantHasSites: session.user.tenantHasSites,
    };

    const buffer = await file.arrayBuffer();
    const { plan, rows } = await preparerPlan(acteur, buffer);
    // Les lignes lues portent les colonnes secondaires (sexe, lieu de
    // naissance, nationalité, régime) que le plan ne transporte pas.
    const srcDe = new Map(rows.map((r) => [r.ligne, r]));

    // Le fichier confirmé doit être celui qui a été analysé.
    if (plan.hash !== hashAttendu) {
      return NextResponse.json(
        { error: "Le fichier a changé depuis l'analyse. Relancez la prévisualisation." },
        { status: 409 }
      );
    }

    // Décisions de l'utilisateur : { "12": "CREER", "13": "IGNORER" }
    let decisions: Record<string, Action> = {};
    const decisionsRaw = formData.get("decisions") as string | null;
    if (decisionsRaw) {
      try {
        decisions = JSON.parse(decisionsRaw);
      } catch {
        return NextResponse.json({ error: "Décisions illisibles" }, { status: 400 });
      }
    }

    const actionDe = (l: LignePlan): Action => {
      // Une ligne en erreur n'est jamais importable, quoi que demande le client.
      if (l.verdict === "ERREUR") return "IGNORER";
      const choisie = decisions[String(l.ligne)];
      if (choisie === "CREER" || choisie === "METTRE_A_JOUR" || choisie === "IGNORER") {
        // On ne peut mettre à jour que s'il existe une fiche rapprochée.
        if (choisie === "METTRE_A_JOUR" && !l.existant) return "CREER";
        return choisie;
      }
      return l.action;
    };

    const aCreer = plan.lignes.filter((l) => actionDe(l) === "CREER");
    const aMettreAJour = plan.lignes.filter((l) => actionDe(l) === "METTRE_A_JOUR" && l.existant);
    const ignorees = plan.lignes.filter((l) => actionDe(l) === "IGNORER");

    if (aCreer.length === 0 && aMettreAJour.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalRows: plan.lignes.length,
          created: 0,
          updated: 0,
          skipped: ignorees.length,
          structuresCreated: 0,
          classesCreated: 0,
          warnings: ["Aucune ligne à importer : tout était déjà présent ou ignoré."],
        },
      });
    }

    const annee = await getAnneeCouranteLibelle(tenantId);
    if (!annee) return NextResponse.json({ error: "Aucune année scolaire active" }, { status: 400 });

    // ── Structures ──────────────────────────────────────────────
    const classesRequises = [...new Set(aCreer.map((l) => l.classe))];
    const niveauDe = new Map(rows.map((r) => [r.classe, r.niveau]));

    const existingStructures = await prisma.structure.findMany({
      where: mergeFilters({ tenantId }, siteFilterForModel("structure", session.user)),
    });
    const structureByType = new Map<string, string>(existingStructures.map((s) => [s.type, s.id]));

    const structuresToCreate: StructureType[] = [];
    for (const classe of classesRequises) {
      const structType = GROUP_TO_STRUCTURE[getSchoolGroup(niveauDe.get(classe) ?? classe, classe)];
      if (structType && !structureByType.has(structType) && !structuresToCreate.includes(structType)) {
        structuresToCreate.push(structType);
      }
    }

    if (structuresToCreate.length > 0) {
      await prisma.structure.createMany({
        data: structuresToCreate.map((type) => ({
          tenantId,
          type,
          nom: STRUCTURE_LABELS[type],
          actif: true,
          siteId: targetSiteId,
        })),
        skipDuplicates: true,
      });
      const created = await prisma.structure.findMany({
        where: mergeFilters(
          { tenantId, type: { in: structuresToCreate } },
          siteFilterForModel("structure", session.user)
        ),
      });
      for (const s of created) structureByType.set(s.type, s.id);
    }

    // ── Classes ─────────────────────────────────────────────────
    const existingClasses = await prisma.classe.findMany({
      where: mergeFilters({ tenantId }, siteFilterForModel("classe", session.user)),
      select: { id: true, nom: true, siteId: true },
    });
    const classByName = new Map(existingClasses.map((c) => [c.nom, { id: c.id, siteId: c.siteId }]));

    const classesToCreate = classesRequises.filter((c) => !classByName.has(c));
    if (classesToCreate.length > 0) {
      await prisma.classe.createMany({
        data: classesToCreate.map((nom) => {
          const niveau = niveauDe.get(nom) ?? nom;
          const structType = GROUP_TO_STRUCTURE[getSchoolGroup(niveau, nom)];
          return {
            tenantId,
            nom,
            niveau,
            effectifMax: 40,
            annee,
            structureId: structType ? structureByType.get(structType) ?? null : null,
            siteId: targetSiteId,
          };
        }),
      });
      const created = await prisma.classe.findMany({
        where: mergeFilters(
          { tenantId, nom: { in: classesToCreate } },
          siteFilterForModel("classe", session.user)
        ),
        select: { id: true, nom: true, siteId: true },
      });
      for (const c of created) classByName.set(c.nom, { id: c.id, siteId: c.siteId });
    }

    // ── Élèves ──────────────────────────────────────────────────
    // Séquence repartant du dernier matricule émis, archives comprises : un
    // numéro n'est jamais recyclé, et un réimport ne fabrique plus de
    // matricules neufs qui échappaient au contrôle anti-doublon.
    const anneeNum = new Date().getFullYear();
    const prochainMatricule = matriculeGenerator(
      anneeNum,
      await dernierMatricule(tenantId, anneeNum)
    );

    const sexeDe = (v?: string): Sexe =>
      v === "F" || v === "FEMME" || v === "FILLE" ? "F" : "M";

    const warnings: string[] = [];
    // Identifiant du lot : chaque fiche créée le porte, ce qui permet de
    // défaire un import entier d'un seul geste au lieu de trier les fiches
    // une à une — c'est le tri manuel de 78 fiches qu'on veut éviter.
    const importBatchId = randomUUID();

    const aInserer = aCreer
      .map((l) => {
        const classe = classByName.get(l.classe);
        if (!classe) {
          warnings.push(`Ligne ${l.ligne} : classe « ${l.classe} » introuvable`);
          return null;
        }
        const date = parseDate(l.dateNaissance);
        if (!date) return null; // déjà écarté par l'analyse, garde-fou
        const src = srcDe.get(l.ligne);
        return {
          tenantId,
          siteId: targetSiteId || classe.siteId,
          matricule: l.matricule || prochainMatricule(),
          nom: l.nom,
          prenom: l.prenom,
          dateNaissance: date,
          lieuNaissance: src?.lieuNaissance ?? null,
          nationalite: src?.nationalite ?? "SN",
          sexe: sexeDe(src?.sexe),
          regime: src?.regime ?? "externe",
          statut: "ACTIF" as const,
          classeId: classe.id,
          anneeInscription: annee,
          // Clé d'unicité : c'est elle qui rend le doublon impossible en base.
          identiteKey: identityKey({ nom: l.nom, prenom: l.prenom, dateNaissance: date }),
          importBatchId,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    let created = 0;
    for (let i = 0; i < aInserer.length; i += 50) {
      const lot = aInserer.slice(i, i + 50);
      const res = await prisma.eleve.createMany({ data: lot, skipDuplicates: true });
      created += res.count;
    }

    // Mises à jour : on rafraîchit la fiche existante au lieu d'en créer une
    // seconde. C'est ce qui rend un réimport idempotent.
    let updated = 0;
    for (const l of aMettreAJour) {
      const classe = classByName.get(l.classe);
      const date = parseDate(l.dateNaissance);
      // `updateMany` plutôt qu'`update` pour pouvoir exiger le `tenantId` dans
      // le `where` : une écriture ne se contente pas d'un identifiant.
      await prisma.eleve.updateMany({
        where: { id: l.existant!.id, tenantId },
        data: {
          nom: l.nom,
          prenom: l.prenom,
          ...(date ? { dateNaissance: date } : {}),
          ...(classe ? { classeId: classe.id } : {}),
          // Réimporter un élève archivé le restaure — et lui rend sa clé
          // d.identité, remise à NULL au moment de l.archivage.
          ...(l.existant!.archive ? { deletedAt: null, statut: "ACTIF" as const } : {}),
          ...(date ? { identiteKey: identityKey({ nom: l.nom, prenom: l.prenom, dateNaissance: date }) } : {}),
        },
      });
      updated++;
    }

    // Empreinte du fichier : permet de reconnaître un réimport à l'analyse.
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: session.user.id,
        action: "eleves.import",
        verdict: "ALLOWED",
        resource: "eleve",
        reason: `Import de ${file.name}`,
        metadata: {
          hash: plan.hash,
          fichier: file.name,
          importBatchId,
          created,
          updated,
          ignorees: ignorees.length,
        },
      },
    });

    revalidateTag("eleves-stats");
    revalidateTag("dashboard-data");
    revalidateTag("classes-list");

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: plan.lignes.length,
        created,
        updated,
        skipped: ignorees.length,
        structuresCreated: structuresToCreate.length,
        classesCreated: classesToCreate.length,
        warnings: warnings.length > 0 ? warnings.slice(0, 20) : undefined,
        // Permet d'annuler l'import d'un seul geste depuis l'écran de résultat.
        importBatchId: created > 0 ? importBatchId : undefined,
      },
    });
  } catch (error) {
    console.error("[API/import/eleves] POST", error);
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
