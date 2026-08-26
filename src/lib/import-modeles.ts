/**
 * Génération de modèles Excel vides pour l'import.
 *
 * Chaque type d'import a un format attendu (entêtes + exemple).
 * L'utilisateur télécharge le modèle, le remplit, et le réimporte.
 *
 * Si les entêtes du fichier importé ne correspondent pas au schéma attendu,
 * un message d'erreur lui indique de télécharger le modèle.
 */

import ExcelJS from "exceljs";

export type TypeModele =
  | "eleves"
  | "enseignants"
  | "classes"
  | "matieres"
  | "parents"
  | "personnel-admin"
  | "edt-externes";

export interface DefinitionModele {
  type: TypeModele;
  /** Nom du fichier (sans extension) */
  nomFichier: string;
  /** Nom de la feuille Excel */
  nomFeuille: string;
  /** Colonnes : entête + exemple + requis */
  colonnes: { header: string; exemple: string; requis?: boolean; description?: string }[];
  /** Notes affichées dans une seconde feuille "Instructions" */
  instructions: string[];
}

// ============================================================
// DÉFINITIONS DES MODÈLES
// ============================================================

export const MODELES_IMPORT: Record<TypeModele, DefinitionModele> = {
  eleves: {
    type: "eleves",
    nomFichier: "modele_import_eleves",
    nomFeuille: "Élèves",
    colonnes: [
      { header: "nom", exemple: "Doe", requis: true, description: "Nom de famille" },
      { header: "prenom", exemple: "Jean", description: "Prénom" },
      { header: "classe", exemple: "CM2 A", requis: true, description: "Nom de la classe (doit exister ou sera créée)" },
      { header: "niveau", exemple: "CM2", description: "Niveau scolaire (CP, CE1, CM2, 6ème, Terminale...)" },
      { header: "sexe", exemple: "M", description: "M ou F" },
      { header: "dateNaissance", exemple: "15/03/2010", requis: true, description: "Format JJ/MM/AAAA" },
      { header: "lieuNaissance", exemple: "Djibouti", description: "Ville de naissance" },
      { header: "matricule", exemple: "2025-001", description: "Matricule interne (optionnel, auto-généré si vide)" },
      { header: "nationalite", exemple: "DJ", description: "Code pays (DJ, SN, FR...)" },
      { header: "regime", exemple: "externe", description: "externe, demi-pension, interne" },
      { header: "parent1_nom", exemple: "Doe", description: "Nom du parent/tuteur 1" },
      { header: "parent1_prenom", exemple: "Alice", description: "Prénom du parent 1" },
      { header: "parent1_telephone", exemple: "+253 77 12 34 56", description: "Téléphone du parent 1" },
      { header: "parent1_lien", exemple: "MERE", description: "PERE, MERE, TUTEUR, AUTRE" },
      { header: "parent2_nom", exemple: "Doe", description: "Nom du parent/tuteur 2" },
      { header: "parent2_prenom", exemple: "Bob", description: "Prénom du parent 2" },
      { header: "parent2_telephone", exemple: "+253 77 98 76 54", description: "Téléphone du parent 2" },
      { header: "parent2_lien", exemple: "PERE", description: "PERE, MERE, TUTEUR, AUTRE" },
    ],
    instructions: [
      "Les colonnes 'nom', 'classe' et 'dateNaissance' sont obligatoires.",
      "La date de naissance doit être au format JJ/MM/AAAA.",
      "Si la classe n'existe pas, elle sera créée automatiquement.",
      "Les colonnes parent1_* et parent2_* sont optionnelles mais recommandées.",
      "Le matricule est auto-généré si laissé vide.",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  enseignants: {
    type: "enseignants",
    nomFichier: "modele_import_enseignants",
    nomFeuille: "Enseignants",
    colonnes: [
      { header: "nom", exemple: "Ahmed", requis: true, description: "Nom de famille" },
      { header: "prenom", exemple: "Omar", requis: true, description: "Prénom" },
      { header: "email", exemple: "o.ahmed@ecole.dj", description: "Email (utilisé pour le compte de connexion)" },
      { header: "telephone", exemple: "+253 77 12 34 56", description: "Téléphone" },
      { header: "matiere", exemple: "Mathématiques", description: "Matière enseignée (pour collège/lycée). Plusieurs matières séparées par virgule : Mathématiques, Physique" },
      { header: "classe", exemple: "6ème A, 6ème B", description: "Classe(s) enseignée(s). Pour le primaire : une seule classe. Pour le collège/lycée : plusieurs classes séparées par virgule. Pour les profs de langue (Arabe, Anglais) : lister toutes les classes." },
      { header: "site_1", exemple: "Campus Central", description: "Site principal d'affectation (nom du site)" },
      { header: "site_2", exemple: "Annexe PK12", description: "Site secondaire (laisser vide si un seul site)" },
      { header: "site_3", exemple: "", description: "Site tertiaire (laisser vide si non applicable)" },
      { header: "typeContrat", exemple: "CDI", description: "CDI, CDD, VACATAIRE, FONCTIONNAIRE, STAGIAIRE" },
      { header: "matricule", exemple: "ENS-001", description: "Matricule interne (optionnel)" },
    ],
    instructions: [
      "Les colonnes 'nom' et 'prenom' sont obligatoires.",
      "PRIMAIRE/MATERNELLE : indiquez uniquement la classe (pas de matière). Le professeur enseigne toutes les matières de sa classe.",
      "COLLÈGE/LYCÉE : indiquez la matière ET la classe(s). Un prof peut enseigner plusieurs matières à plusieurs classes.",
      "PROFS DE LANGUE (Arabe, Anglais) : listez toutes les classes dans la colonne 'classe', séparées par virgules.",
      "MULTI-SITE : remplissez site_1, site_2, site_3 avec les noms des sites. Laissez vides les colonnes inutilisées.",
      "L'email est utilisé pour créer le compte de connexion. Un mot de passe temporaire sera généré.",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  "personnel-admin": {
    type: "personnel-admin",
    nomFichier: "modele_import_personnel_admin",
    nomFeuille: "Personnel Admin",
    colonnes: [
      { header: "nom", exemple: "Farah", requis: true, description: "Nom de famille" },
      { header: "prenom", exemple: "Aïcha", requis: true, description: "Prénom" },
      { header: "email", exemple: "a.farah@ecole.dj", description: "Email (utilisé pour le compte de connexion)" },
      { header: "telephone", exemple: "+253 77 12 34 56", description: "Téléphone" },
      { header: "role", exemple: "SECRETARY", requis: true, description: "Rôle : PRINCIPAL, SECRETARY, COUNSELOR, NURSE, ACCOUNTANT, CAISSIER, SUPERVISOR, SITE_MANAGER, INSPECTOR, TENANT_ADMIN" },
      { header: "site", exemple: "Campus Central", description: "Site d'affectation (nom du site). Laisser vide = tous les sites (direction générale)" },
      { header: "matricule", exemple: "ADM-001", description: "Matricule interne (optionnel)" },
    ],
    instructions: [
      "Les colonnes 'nom', 'prenom' et 'role' sont obligatoires.",
      "Rôles disponibles :",
      "  PRINCIPAL = Chef d'établissement",
      "  SECRETARY = Secrétariat",
      "  COUNSELOR = Conseiller d'orientation / CPE",
      "  NURSE = Infirmier(e)",
      "  ACCOUNTANT = Gestionnaire financier / Comptable",
      "  CAISSIER = Caissier",
      "  SUPERVISOR = Surveillant / Vie scolaire",
      "  SITE_MANAGER = Responsable d'exploitation site",
      "  INSPECTOR = Inspecteur MENFOP",
      "  TENANT_ADMIN = Directeur / Propriétaire (accès complet)",
      "La colonne 'site' indique le site d'affectation. Laisser vide pour la direction générale (tous sites).",
      "L'email est utilisé pour créer le compte de connexion. Un mot de passe temporaire sera généré.",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  classes: {
    type: "classes",
    nomFichier: "modele_import_classes",
    nomFeuille: "Classes",
    colonnes: [
      { header: "nom", exemple: "6ème A", requis: true, description: "Nom de la classe" },
      { header: "niveau", exemple: "6ème", description: "Niveau scolaire" },
      { header: "effectifMax", exemple: "40", description: "Effectif maximum" },
      { header: "professeurPrincipal", exemple: "Ahmed Omar", description: "Nom du professeur principal" },
      { header: "site", exemple: "Campus Central", description: "Site (nom du site)" },
    ],
    instructions: [
      "La colonne 'nom' est obligatoire.",
      "Si une classe avec le même nom existe déjà, elle sera ignorée.",
      "Le site est optionnel (utilise le site par défaut si non spécifié).",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  matieres: {
    type: "matieres",
    nomFichier: "modele_import_matieres",
    nomFeuille: "Matières",
    colonnes: [
      { header: "nom", exemple: "Mathématiques", requis: true, description: "Nom de la matière" },
      { header: "code", exemple: "MATH", description: "Code court de la matière" },
      { header: "coefficient", exemple: "4", description: "Coefficient (nombre)" },
    ],
    instructions: [
      "La colonne 'nom' est obligatoire.",
      "Si une matière avec le même nom existe déjà, elle sera ignorée.",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  parents: {
    type: "parents",
    nomFichier: "modele_import_parents",
    nomFeuille: "Parents",
    colonnes: [
      { header: "nom", exemple: "Doe", requis: true, description: "Nom de famille" },
      { header: "prenom", exemple: "Alice", description: "Prénom" },
      { header: "email", exemple: "alice.doe@email.com", description: "Email" },
      { header: "telephone", exemple: "+253 77 12 34 56", description: "Téléphone" },
      { header: "relation", exemple: "MERE", description: "Relation : PERE, MERE, TUTEUR, AUTRE" },
    ],
    instructions: [
      "La colonne 'nom' est obligatoire.",
      "Le téléphone ou l'email est recommandé pour le compte parent.",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },

  "edt-externes": {
    type: "edt-externes",
    nomFichier: "modele_import_edt_externes",
    nomFeuille: "EDT Externes",
    colonnes: [
      { header: "nom", exemple: "Ahmed", requis: true, description: "Nom de l'enseignant" },
      { header: "prenom", exemple: "Omar", requis: true, description: "Prénom de l'enseignant" },
      { header: "email", exemple: "o.ahmed@externe.dj", description: "Email (pour identifier l'enseignant)" },
      { header: "jour", exemple: "lundi", requis: true, description: "Jour de la semaine (lundi, mardi, ...)" },
      { header: "heureDebut", exemple: "08:00", requis: true, description: "Heure de début (HH:MM)" },
      { header: "heureFin", exemple: "10:00", requis: true, description: "Heure de fin (HH:MM)" },
      { header: "etablissement", exemple: "Lycée externe", description: "Établissement où l'enseignant donne cours" },
      { header: "matiere", exemple: "Mathématiques", description: "Matière enseignée à l'extérieur" },
      { header: "periode", exemple: "1er trimestre", description: "Période concernée (optionnel)" },
    ],
    instructions: [
      "Les colonnes 'nom', 'jour', 'heureDebut' et 'heureFin' sont obligatoires.",
      "Ce fichier déclare les indisponibilités d'enseignants qui donnent cours à l'extérieur.",
      "L'enseignant doit déjà exister dans le système (identifié par email ou nom+prénom).",
      "Ne pas modifier les en-têtes de colonnes.",
    ],
  },
};

// ============================================================
// GÉNÉRATION EXCEL
// ============================================================

/**
 * Génère un fichier Excel (Buffer) pour le modèle demandé.
 * Feuille 1 : les entêtes + une ligne d'exemple (grisée).
 * Feuille 2 : les instructions.
 */
export async function genererModeleExcel(type: TypeModele): Promise<Buffer> {
  const def = MODELES_IMPORT[type];
  if (!def) throw new Error(`Type de modèle inconnu: ${type}`);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SchoolPro";
  wb.created = new Date();

  // — Feuille 1 : Données —
  const ws = wb.addWorksheet(def.nomFeuille);

  // Ligne 1 : entêtes
  const headerRow = ws.addRow(def.colonnes.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

  // Ligne 2 : exemples (grisée, italique)
  const exempleRow = ws.addRow(def.colonnes.map((c) => c.exemple));
  exempleRow.font = { italic: true, color: { argb: "FF888888" } };
  exempleRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF0F0F0" },
  };

  // Largeur des colonnes
  ws.columns.forEach((col, i) => {
    const header = def.colonnes[i]?.header ?? "";
    const exemple = def.colonnes[i]?.exemple ?? "";
    col.width = Math.max(header.length, exemple.length, 15) + 2;
  });

  // Marquer les colonnes requises avec un fond légèrement coloré sur l'entête
  def.colonnes.forEach((c, i) => {
    if (c.requis) {
      const cell = headerRow.getCell(i + 1);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFC0504D" },
      };
    }
  });

  // — Feuille 2 : Instructions —
  const wsInstr = wb.addWorksheet("Instructions");

  // Titre
  const titre = wsInstr.addRow([`Modèle d'import : ${def.nomFeuille}`]);
  titre.font = { bold: true, size: 14 };
  wsInstr.addRow([]);

  // Instructions
  for (const instr of def.instructions) {
    const row = wsInstr.addRow([instr]);
    // Les lignes qui commencent par des espaces sont des sous-éléments
    if (instr.startsWith("  ")) {
      row.font = { size: 11, color: { argb: "FF555555" } };
    } else {
      row.font = { size: 11 };
    }
  }

  wsInstr.addRow([]);
  wsInstr.addRow(["Légende :"]);
  const legende = wsInstr.addRow(["  En-têtes en rouge = colonnes obligatoires"]);
  legende.font = { color: { argb: "FFC0504D" } };
  wsInstr.addRow(["  Ligne d'exemple en gris = à remplacer par vos données"]);

  wsInstr.getColumn(1).width = 80;

  // Génération du buffer
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================================
// VALIDATION DES ENTÊTES
// ============================================================

/**
 * Valide que les entêtes du fichier correspondent au modèle attendu.
 * Retourne un objet avec le statut et les détails de l'erreur.
 */
export function validerEntetes(
  headers: string[],
  type: TypeModele
): { valide: boolean; manquantes: string[]; message: string } {
  const def = MODELES_IMPORT[type];
  if (!def) return { valide: false, manquantes: [], message: "Type de modèle inconnu" };

  const headersNormalises = headers.map((h) => h.toLowerCase().trim());
  const requis = def.colonnes.filter((c) => c.requis).map((c) => c.header.toLowerCase());

  const manquantes = requis.filter(
    (r) => !headersNormalises.some((h) => h === r || h.includes(r))
  );

  if (manquantes.length > 0) {
    return {
      valide: false,
      manquantes,
      message: `Les en-têtes du fichier ne correspondent pas au modèle attendu. Colonnes obligatoires manquantes : ${manquantes.join(", ")}. Téléchargez le modèle d'import et remplissez-le avec vos données.`,
    };
  }

  return { valide: true, manquantes: [], message: "" };
}

/**
 * Récupère la liste des entêtes attendus pour un type d'import.
 */
export function entetesAttendues(type: TypeModele): string[] {
  const def = MODELES_IMPORT[type];
  if (!def) return [];
  return def.colonnes.map((c) => c.header);
}
