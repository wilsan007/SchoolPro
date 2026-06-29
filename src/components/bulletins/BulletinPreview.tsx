"use client";

import type { BulletinData } from "@/lib/pdf/bulletin-generator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface Props {
  data: BulletinData;
}

function getOrdinal(n: number | null): string {
  if (!n) return "—";
  return n === 1 ? "1er" : `${n}e`;
}

function formatDateFr(date?: Date | null) {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy", { locale: fr });
}

export function BulletinPreview({ data }: Props) {
  return (
    <div
      className="bg-white text-gray-900 font-sans text-[11px] print:text-[10px]"
      style={{ 
        width: "210mm", 
        minHeight: "297mm", 
        padding: "10mm", 
        margin: "0 auto", 
        boxSizing: "border-box",
        border: "1px solid #000"
      }}
    >
      {/* Header Info */}
      <div className="flex flex-col mb-4">
        <div className="text-center text-red-600 font-bold mb-2">
           Email: ecoleprivee@gmail.com {/* Placeholder per image */}
        </div>
        
        {/* Ligne Infos Élève */}
        <table className="w-full border-collapse border border-black text-center mb-1">
          <tbody>
            <tr>
              <td className="border border-black bg-yellow-100 font-bold p-1 w-16">Nom</td>
              <td className="border border-black p-1 uppercase">{data.eleveNom} {data.elevePrenom}</td>
              <td className="border border-black p-1 w-16">Né(e) le</td>
              <td className="border border-black p-1">{formatDateFr(data.eleveDateNaissance)}</td>
              <td className="border border-black p-1 w-16">Classe</td>
              <td className="border border-black p-1">{data.eleveClasse}</td>
              <td className="border border-black p-1 w-16">Carnet</td>
              <td className="border border-black p-1">{data.eleveMatricule}</td>
              <td className="border border-black w-24" rowSpan={2}>
                {/* Photo Placeholder */}
                <div className="w-full h-full min-h-[80px] bg-gray-200 flex items-center justify-center text-gray-400 text-xs">Photo</div>
              </td>
            </tr>
            <tr>
              <td colSpan={8} className="border border-black bg-[#e0f2fe] text-center font-bold p-2">
                ANNEE SCOLAIRE {data.annee}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tableau des Disciplines */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-white text-[10px]">
            <th className="border border-black p-2 w-[25%]">DISCIPLINES</th>
            <th className="border border-black p-2">COEF</th>
            <th className="border border-black p-2">MOY</th>
            <th className="border border-black p-2">RANG</th>
            <th className="border border-black p-2">M.N +</th>
            <th className="border border-black p-2">M.N -</th>
            <th className="border border-black p-2 w-[35%]">Observations & Appréciations</th>
          </tr>
        </thead>
        <tbody>
          {data.notes.map((n, i) => (
            <tr key={n.matiereCode}>
              <td className="border border-black bg-[#ffe4e1] p-1 text-center">
                <div className="font-bold uppercase text-[#8b0000]">{n.matiereNom}</div>
                <div className="text-[9px] italic text-gray-700">{n.nomProfesseur ?? "PROFESSEUR"}</div>
              </td>
              <td className="border border-black p-1">{n.coefficient}</td>
              <td className="border border-black bg-[#fffacd] p-1 font-bold">
                {n.moyenne !== null ? n.moyenne.toFixed(2) : "—"}
              </td>
              <td className="border border-black bg-[#fffacd] p-1 font-bold text-[#b8860b]">
                {getOrdinal(n.rang)}/{data.effectifClasse ?? "—"}
              </td>
              <td className="border border-black p-1 text-green-700 font-bold">
                {n.moyenneMax !== null ? n.moyenneMax.toFixed(2) : "—"}
              </td>
              <td className="border border-black p-1 text-red-600 font-bold">
                {n.moyenneMin !== null ? n.moyenneMin.toFixed(2) : "—"}
              </td>
              <td className="border border-black bg-[#e6f4ea] p-1 italic text-green-800 text-[10px]">
                {n.appreciation ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tableau des Trimestres */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-[#fbcfe8] text-[10px]">
            <th className="border border-black p-2 w-[25%] text-left pl-2">TRIMESTRES</th>
            <th className="border border-black p-2">MGC</th>
            <th className="border border-black p-2">MGE</th>
            <th className="border border-black p-2">POSITION</th>
            <th className="border border-black p-2">MG du 1er</th>
            <th className="border border-black p-2 w-[25%] text-left pl-2">ABSENCES (heures)</th>
          </tr>
        </thead>
        <tbody>
          {/* Trimestre 1 (Actuel ou non) */}
          <tr>
            <td className="border border-black p-2 text-left font-bold">{data.periodeNom.toUpperCase()}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{data.moyenneClasse?.toFixed(2) ?? "—"}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold">{data.moyenneGenerale?.toFixed(2) ?? "—"}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{getOrdinal(data.rang)}/{data.effectifClasse ?? "—"}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{data.moyennePremier?.toFixed(2) ?? "—"}</td>
            <td className="border border-black p-2 bg-[#dcfce7] text-green-700 text-left pl-2">{data.heuresAbsence ?? 0} h</td>
          </tr>
          {/* Lignes vides pour 2e et 3e Trimestre comme sur l'image */}
          <tr>
            <td className="border border-black p-2 text-left font-bold">2e TRIMESTRE</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
          </tr>
          <tr>
            <td className="border border-black p-2 text-left font-bold">3e TRIMESTRE</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
            <td className="border border-black p-2">-</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
