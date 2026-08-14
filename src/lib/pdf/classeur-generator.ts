/**
 * Générateur de classeur imprimable.
 *
 * Le classeur regroupe plusieurs documents PDF en un seul :
 *   — Page de garde (logo, année scolaire, classe)
 *   — Liste des élèves
 *   — Bulletins de chaque élève (une période donnée)
 *   — Attestations de scolarité
 *   — Fiches de renseignements
 *   — Relevés de notes
 *
 * Le PDF est généré côté serveur et renvoyé comme blob.
 * Utilise pdf-lib pour assembler les pages.
 */

import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { BulletinData } from "./bulletin-generator";

export type SectionClasseur =
  | "pageGarde"
  | "listeEleves"
  | "bulletins"
  | "attestations"
  | "fichesRenseignements"
  | "relevesNotes";

export interface ConfigClasseur {
  tenantId: string;
  classeId?: string;
  eleveIds?: string[];
  anneeId: string;
  periodeId?: string;
  sections: SectionClasseur[];
  titre?: string;
}

export interface DonneesClasseur {
  config: ConfigClasseur;
  ecole: {
    nom: string;
    ville: string;
    pays: string;
    logoUrl?: string | null;
    chefEtablissement?: string | null;
  };
  annee: { libelle: string };
  periode?: { nom: string; numero: number };
  classe?: { nom: string; niveau: string };
  eleves: Array<{
    id: string;
    nom: string;
    prenom: string;
    matricule?: string;
    dateNaissance?: Date;
    sexe?: "M" | "F";
  }>;
  bulletins?: BulletinData[];
}

const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;

/**
 * Génère un classeur PDF complet à partir des données fournies.
 */
export async function genererClasseur(
  donnees: DonneesClasseur
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const { config, ecole, annee, periode, classe, eleves, bulletins } = donnees;

  for (const section of config.sections) {
    switch (section) {
      case "pageGarde":
        await ajouterPageGarde(pdf, font, fontBold, fontItalic, {
          titre: config.titre ?? "Classeur scolaire",
          ecole,
          annee,
          periode,
          classe,
          nbEleves: eleves.length,
        });
        break;

      case "listeEleves":
        await ajouterListeEleves(pdf, font, fontBold, {
          eleves,
          classe,
          annee,
        });
        break;

      case "bulletins":
        if (bulletins) {
          for (const bulletin of bulletins) {
            await ajouterBulletin(pdf, font, fontBold, fontItalic, bulletin);
          }
        }
        break;

      case "attestations":
        for (const eleve of eleves) {
          await ajouterAttestation(pdf, font, fontBold, fontItalic, {
            eleve,
            ecole,
            annee,
          });
        }
        break;

      case "fichesRenseignements":
        for (const eleve of eleves) {
          await ajouterFicheRenseignements(pdf, font, fontBold, {
            eleve,
            ecole,
            annee,
            classe,
          });
        }
        break;

      case "relevesNotes":
        // Réutilise les bulletins s'ils sont disponibles
        if (bulletins) {
          for (const bulletin of bulletins) {
            await ajouterReleveNotes(pdf, font, fontBold, fontItalic, bulletin);
          }
        }
        break;
    }
  }

  return pdf.save();
}

// ============================================================
// SECTIONS
// ============================================================

interface PageGardeData {
  titre: string;
  ecole: DonneesClasseur["ecole"];
  annee: { libelle: string };
  periode?: { nom: string; numero: number };
  classe?: { nom: string; niveau: string };
  nbEleves: number;
}

async function ajouterPageGarde(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  _fontItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  data: PageGardeData
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();

  // Titre centré en haut
  page.drawText(data.ecole.nom, {
    x: width / 2 - data.ecole.nom.length * 5,
    y: height - 120,
    size: 20,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  page.drawText(`${data.ecole.ville}, ${data.ecole.pays}`, {
    x: width / 2 - 30,
    y: height - 145,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Ligne séparatrice
  page.drawLine({
    start: { x: MARGIN, y: height - 170 },
    end: { x: width - MARGIN, y: height - 170 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Titre du classeur
  page.drawText(data.titre, {
    x: width / 2 - data.titre.length * 6,
    y: height - 250,
    size: 24,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Année scolaire
  page.drawText(`Année scolaire ${data.annee.libelle}`, {
    x: width / 2 - 60,
    y: height - 290,
    size: 14,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Période si spécifiée
  if (data.periode) {
    page.drawText(data.periode.nom, {
      x: width / 2 - data.periode.nom.length * 3,
      y: height - 315,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  // Classe si spécifiée
  if (data.classe) {
    page.drawText(`${data.classe.nom} (${data.classe.niveau})`, {
      x: width / 2 - 50,
      y: height - 345,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
  }

  // Nombre d'élèves
  page.drawText(`${data.nbEleves} élève(s)`, {
    x: width / 2 - 30,
    y: height - 380,
    size: 11,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Date de génération en bas
  const dateStr = new Date().toLocaleDateString("fr-FR");
  page.drawText(`Généré le ${dateStr}`, {
    x: MARGIN,
    y: 40,
    size: 9,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });
}

async function ajouterListeEleves(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  data: {
    eleves: DonneesClasseur["eleves"];
    classe?: { nom: string; niveau: string };
    annee: { libelle: string };
  }
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // Titre
  page.drawText("Liste des élèves", {
    x: MARGIN,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 25;

  if (data.classe) {
    page.drawText(`${data.classe.nom} — ${data.annee.libelle}`, {
      x: MARGIN,
      y,
      size: 11,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 25;
  }

  // En-têtes du tableau
  page.drawText("N°", { x: MARGIN, y, size: 10, font: fontBold });
  page.drawText("Prénom", { x: MARGIN + 30, y, size: 10, font: fontBold });
  page.drawText("Nom", { x: MARGIN + 180, y, size: 10, font: fontBold });
  page.drawText("Matricule", { x: MARGIN + 320, y, size: 10, font: fontBold });
  page.drawText("Sexe", { x: MARGIN + 430, y, size: 10, font: fontBold });
  y -= 5;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;

  // Lignes
  for (let i = 0; i < data.eleves.length; i++) {
    const eleve = data.eleves[i];
    if (y < MARGIN + 30) {
      // Nouvelle page si on déborde
      const newPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = newPage.getSize().height - MARGIN;
    }

    page.drawText(String(i + 1), { x: MARGIN, y, size: 10, font });
    page.drawText(eleve.prenom, { x: MARGIN + 30, y, size: 10, font });
    page.drawText(eleve.nom, { x: MARGIN + 180, y, size: 10, font });
    page.drawText(eleve.matricule ?? "—", { x: MARGIN + 320, y, size: 10, font });
    page.drawText(eleve.sexe ?? "—", { x: MARGIN + 430, y, size: 10, font });
    y -= 16;
  }
}

async function ajouterBulletin(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  _fontItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bulletin: BulletinData
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // En-tête école
  page.drawText(bulletin.ecoleName, {
    x: width / 2 - bulletin.ecoleName.length * 5,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 20;
  page.drawText(`${bulletin.ecoleVille}, ${bulletin.ecolePays}`, {
    x: width / 2 - 30,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 15;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 25;

  // Titre bulletin
  page.drawText("Bulletin de notes", {
    x: width / 2 - 50,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 20;
  page.drawText(`${bulletin.periodeNom} — ${bulletin.annee}`, {
    x: width / 2 - 40,
    y,
    size: 11,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 25;

  // Élève
  page.drawText(`${bulletin.elevePrenom} ${bulletin.eleveNom}`, {
    x: MARGIN,
    y,
    size: 12,
    font: fontBold,
  });
  y -= 15;
  page.drawText(
    `${bulletin.eleveClasse} — Mat. ${bulletin.eleveMatricule}`,
    { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) }
  );
  y -= 20;

  // Tableau des notes
  page.drawText("Matière", { x: MARGIN, y, size: 9, font: fontBold });
  page.drawText("Moyenne", { x: MARGIN + 200, y, size: 9, font: fontBold });
  page.drawText("Coef.", { x: MARGIN + 280, y, size: 9, font: fontBold });
  page.drawText("Rang", { x: MARGIN + 340, y, size: 9, font: fontBold });
  page.drawText("Appréciation", { x: MARGIN + 400, y, size: 9, font: fontBold });
  y -= 5;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 14;

  for (const note of bulletin.notes) {
    if (y < MARGIN + 60) {
      // Nouvelle page
      const newPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = newPage.getSize().height - MARGIN;
    }

    const moyenne =
      note.moyenne !== null ? note.moyenne.toFixed(2) : "—";
    const appreciation = note.appreciation
      ? note.appreciation.substring(0, 30)
      : "—";

    page.drawText(note.matiereNom.substring(0, 25), { x: MARGIN, y, size: 9, font });
    page.drawText(moyenne, { x: MARGIN + 200, y, size: 9, font });
    page.drawText(String(note.coefficient), { x: MARGIN + 280, y, size: 9, font });
    page.drawText(note.rang ? String(note.rang) : "—", { x: MARGIN + 340, y, size: 9, font });
    page.drawText(appreciation, { x: MARGIN + 400, y, size: 9, font });
    y -= 14;
  }

  // Moyenne générale
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;
  page.drawText("Moyenne générale:", {
    x: MARGIN + 100,
    y,
    size: 11,
    font: fontBold,
  });
  page.drawText(
    bulletin.moyenneGenerale !== null
      ? bulletin.moyenneGenerale.toFixed(2) + " / 20"
      : "—",
    { x: MARGIN + 250, y, size: 11, font: fontBold }
  );

  // Signature
  y = 80;
  if (bulletin.chefEtablissement) {
    page.drawText(`Le Chef d'établissement`, {
      x: width - MARGIN - 120,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(bulletin.chefEtablissement, {
      x: width - MARGIN - 120,
      y: y - 15,
      size: 10,
      font: fontBold,
    });
  }
}

async function ajouterAttestation(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  _fontItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  data: {
    eleve: DonneesClasseur["eleves"][0];
    ecole: DonneesClasseur["ecole"];
    annee: { libelle: string };
  }
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // En-tête
  page.drawText(data.ecole.nom, {
    x: width / 2 - data.ecole.nom.length * 5,
    y,
    size: 18,
    font: fontBold,
  });
  y -= 25;
  page.drawText(`${data.ecole.ville}, ${data.ecole.pays}`, {
    x: width / 2 - 30,
    y,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 20;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 60;

  // Titre
  page.drawText("ATTESTATION DE SCOLARITÉ", {
    x: width / 2 - 90,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 60;

  // Corps
  const texte = `Je soussigné(e), Chef d'établissement de ${data.ecole.nom}, atteste que ${data.eleve.prenom} ${data.eleve.nom} est régulièrement inscrit(e) au sein de notre établissement pour l'année scolaire ${data.annee.libelle}.`;
  const lines = wrapText(texte, font, 80, width - 2 * MARGIN);
  for (const line of lines) {
    page.drawText(line, { x: MARGIN, y, size: 11, font });
    y -= 18;
  }

  y -= 30;
  page.drawText("En foi de quoi, la présente attestation est délivrée", {
    x: MARGIN,
    y,
    size: 11,
    font,
  });
  y -= 18;
  page.drawText("pour servir et valoir ce que de droit.", {
    x: MARGIN,
    y,
    size: 11,
    font,
  });

  // Date et signature
  y = 120;
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  page.drawText(`Fait à ${data.ecole.ville}, le ${dateStr}`, {
    x: MARGIN,
    y,
    size: 11,
    font,
  });

  if (data.ecole.chefEtablissement) {
    page.drawText("Le Chef d'établissement", {
      x: width - MARGIN - 120,
      y,
      size: 10,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(data.ecole.chefEtablissement, {
      x: width - MARGIN - 120,
      y: y - 15,
      size: 10,
      font: fontBold,
    });
  }
}

async function ajouterFicheRenseignements(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  data: {
    eleve: DonneesClasseur["eleves"][0];
    ecole: DonneesClasseur["ecole"];
    annee: { libelle: string };
    classe?: { nom: string; niveau: string };
  }
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // En-tête
  page.drawText("Fiche de renseignements", {
    x: MARGIN,
    y,
    size: 16,
    font: fontBold,
  });
  y -= 25;
  page.drawText(`${data.ecole.nom} — ${data.annee.libelle}`, {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 20;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 25;

  // Informations élève
  const fields: Array<[string, string]> = [
    ["Prénom", data.eleve.prenom],
    ["Nom", data.eleve.nom],
    ["Matricule", data.eleve.matricule ?? "—"],
    ["Sexe", data.eleve.sexe ?? "—"],
    [
      "Date de naissance",
      data.eleve.dateNaissance
        ? data.eleve.dateNaissance.toLocaleDateString("fr-FR")
        : "—",
    ],
    ["Classe", data.classe?.nom ?? "—"],
    ["Niveau", data.classe?.niveau ?? "—"],
  ];

  for (const [label, value] of fields) {
    page.drawText(label, { x: MARGIN, y, size: 11, font: fontBold });
    page.drawText(value, { x: MARGIN + 150, y, size: 11, font });
    y -= 20;
  }
}

async function ajouterReleveNotes(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  _fontItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bulletin: BulletinData
) {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  // En-tête compact
  page.drawText(`Relevé de notes — ${bulletin.elevePrenom} ${bulletin.eleveNom}`, {
    x: MARGIN,
    y,
    size: 14,
    font: fontBold,
  });
  y -= 18;
  page.drawText(`${bulletin.periodeNom} — ${bulletin.annee} — ${bulletin.eleveClasse}`, {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 20;

  // Tableau
  page.drawText("Matière", { x: MARGIN, y, size: 9, font: fontBold });
  page.drawText("Moyenne", { x: MARGIN + 200, y, size: 9, font: fontBold });
  page.drawText("Coef.", { x: MARGIN + 280, y, size: 9, font: fontBold });
  page.drawText("Rang", { x: MARGIN + 340, y, size: 9, font: fontBold });
  y -= 5;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 14;

  for (const note of bulletin.notes) {
    if (y < MARGIN + 40) break;

    page.drawText(note.matiereNom.substring(0, 25), { x: MARGIN, y, size: 9, font });
    page.drawText(
      note.moyenne !== null ? note.moyenne.toFixed(2) : "—",
      { x: MARGIN + 200, y, size: 9, font }
    );
    page.drawText(String(note.coefficient), { x: MARGIN + 280, y, size: 9, font });
    page.drawText(note.rang ? String(note.rang) : "—", {
      x: MARGIN + 340,
      y,
      size: 9,
      font,
    });
    y -= 14;
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: width - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;
  page.drawText("Moyenne générale:", {
    x: MARGIN + 100,
    y,
    size: 11,
    font: fontBold,
  });
  page.drawText(
    bulletin.moyenneGenerale !== null
      ? bulletin.moyenneGenerale.toFixed(2) + " / 20"
      : "—",
    { x: MARGIN + 250, y, size: 11, font: fontBold }
  );
}

// ============================================================
// UTILITAIRES
// ============================================================

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
