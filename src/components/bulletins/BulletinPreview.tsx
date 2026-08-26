"use client";

import type { BulletinData } from "@/lib/pdf/bulletin-generator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslations } from "next-intl";

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

function fmt(v: number | null): string {
  return v !== null ? v.toFixed(2) : "—";
}

export function BulletinPreview({ data }: Props) {
  const t = useTranslations("bulletins");
  const maxExamNotes = Math.max(...data.notes.map((n) => n.notesExamen.length), 0);

  return (
    <div className="overflow-x-auto">
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
        {/*
          Coordonnées de l'établissement, lues sur le tenant. Une adresse
          générique était écrite en dur ici et s'imprimait sur chaque bulletin
          remis aux familles, quel que soit l'établissement.
        */}
        <div className="text-center font-bold mb-2">
          {data.ecoleName}
          {(data.ecoleEmail || data.ecoleTelephone) && (
            <span className="font-normal">
              {" — "}
              {[data.ecoleEmail, data.ecoleTelephone].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        
        {/* Ligne Infos Élève */}
        <table className="w-full border-collapse border border-black text-center mb-1">
          <tbody>
            <tr>
              <td className="border border-black bg-yellow-100 font-bold p-1 w-16">{t("nom")}</td>
              <td className="border border-black p-1 uppercase">{data.eleveNom} {data.elevePrenom}</td>
              <td className="border border-black p-1 w-16">{t("bornOn")}</td>
              <td className="border border-black p-1">{formatDateFr(data.eleveDateNaissance)}</td>
              <td className="border border-black p-1 w-16">{t("classe")}</td>
              <td className="border border-black p-1">{data.eleveClasse}</td>
              <td className="border border-black p-1 w-16">{t("carnet")}</td>
              <td className="border border-black p-1">{data.eleveMatricule}</td>
              <td className="border border-black w-24" rowSpan={2}>
                <div className="w-full h-full min-h-[80px] bg-gray-200 flex items-center justify-center text-gray-400 text-xs">{t("photo")}</div>
              </td>
            </tr>
            <tr>
              <td colSpan={8} className="border border-black bg-[#e0f2fe] text-center font-bold p-2">
                {t("schoolYear")} {data.annee}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tableau des Disciplines avec notes par examen */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-white text-[9px]">
            <th className="border border-black p-1 w-[18%]" rowSpan={2}>{t("disciplines")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("coef")}</th>
            {maxExamNotes > 0 && (
              <th className="border border-black p-1" colSpan={maxExamNotes}>{t("examNotes")}</th>
            )}
            <th className="border border-black p-1" rowSpan={2}>{t("studentAvg")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("classAvg")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("rankLabel")}</th>
            <th className="border border-black p-1" rowSpan={2}>M.N +</th>
            <th className="border border-black p-1" rowSpan={2}>M.N -</th>
            <th className="border border-black p-1 w-[20%]" rowSpan={2}>{t("observations")}</th>
          </tr>
          {maxExamNotes > 0 && (
            <tr className="font-bold bg-gray-50 text-[8px]">
              {Array.from({ length: maxExamNotes }, (_, i) => (
                <th key={i} className="border border-black p-0.5 min-w-[28px]">N{i + 1}</th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {data.notes.map((n) => (
            <tr key={n.matiereCode}>
              <td className="border border-black bg-[#ffe4e1] p-1 text-center">
                <div className="font-bold uppercase text-[#8b0000] text-[9px]">{n.matiereNom}</div>
                <div className="text-[8px] italic text-gray-700">{n.nomProfesseur ?? "PROFESSEUR"}</div>
              </td>
              <td className="border border-black p-1">{n.coefficient}</td>
              {maxExamNotes > 0 && Array.from({ length: maxExamNotes }, (_, i) => {
                const note = n.notesExamen[i];
                return (
                  <td key={i} className="border border-black p-0.5 text-[9px]">
                    {note ? (
                      <span title={`${note.intitule} (${note.type}) - ${formatDateFr(note.date)}`}>
                        {note.valeur !== null ? note.valeur.toFixed(2) : "—"}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                );
              })}
              <td className="border border-black bg-[#fffacd] p-1 font-bold">
                {fmt(n.moyenne)}
              </td>
              <td className="border border-black bg-[#e0f2fe] p-1 font-bold text-blue-800">
                {fmt(n.moyenneClasse)}
              </td>
              <td className="border border-black bg-[#fffacd] p-1 font-bold text-[#b8860b]">
                {getOrdinal(n.rang)}/{data.effectifClasse ?? "—"}
              </td>
              <td className="border border-black p-1 text-green-700 font-bold">
                {fmt(n.moyenneMax)}
              </td>
              <td className="border border-black p-1 text-red-600 font-bold">
                {fmt(n.moyenneMin)}
              </td>
              <td className="border border-black bg-[#e6f4ea] p-1 italic text-green-800 text-[9px]">
                {n.appreciation ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-[#fbcfe8] text-[10px]">
            <td className="border border-black p-1 text-left pl-2" colSpan={2 + maxExamNotes}>
              {t("generalAvg")}
            </td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">
              {fmt(data.moyenneGenerale)}
            </td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">
              {fmt(data.moyenneClasse)}
            </td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900">
              {getOrdinal(data.rang)}/{data.effectifClasse ?? "—"}
            </td>
            <td className="border border-black p-1 text-green-700">
              {fmt(data.moyennePremier)}
            </td>
            <td className="border border-black p-1">—</td>
            <td className="border border-black p-1 italic text-left">
              {data.appreciation ?? ""}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Tableau des Trimestres */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-[#fbcfe8] text-[10px]">
            <th className="border border-black p-2 w-[25%] text-left pl-2">{t("trimesters")}</th>
            <th className="border border-black p-2">MGC</th>
            <th className="border border-black p-2">MGE</th>
            <th className="border border-black p-2">POSITION</th>
            <th className="border border-black p-2">MG du 1er</th>
            <th className="border border-black p-2 w-[25%] text-left pl-2">{t("absencesHours")}</th>
          </tr>
        </thead>
        <tbody>
          {/* Trimestre 1 (Actuel ou non) */}
          <tr>
            <td className="border border-black p-2 text-left font-bold">{data.periodeNom.toUpperCase()}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{fmt(data.moyenneClasse)}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold">{fmt(data.moyenneGenerale)}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{getOrdinal(data.rang)}/{data.effectifClasse ?? "—"}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{fmt(data.moyennePremier)}</td>
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

      {/* Décision du conseil + Appréciation générale */}
      {(data.decision || data.appreciation) && (
        <table className="w-full border-collapse border border-black text-[10px] mb-4">
          <tbody>
            {data.appreciation && (
              <tr>
                <td className="border border-black p-2 font-bold w-[25%] bg-[#fbcfe8]">{t("councilAppreciation")}</td>
                <td className="border border-black p-2 text-left">{data.appreciation}</td>
              </tr>
            )}
            {data.decision && (
              <tr>
                <td className="border border-black p-2 font-bold w-[25%] bg-[#fbcfe8]">{t("decision")}</td>
                <td className="border border-black p-2 text-left font-bold">{data.decision}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Signature & Cachet du chef d'établissement */}
      <div className="flex justify-end mt-6">
        <div className="text-center text-[10px] w-[60mm]">
          <p className="mb-1">
            {data.ecoleVille}, le {formatDateFr(data.generatedAt)}
          </p>
          {data.chefEtablissement && <p className="font-bold">{data.chefEtablissement}</p>}
          {/*
            `next/image` est inapplicable ici : le cachet et la signature sont
            téléversés par chaque établissement (URL de stockage arbitraire ou
            `data:`), donc hors des `remotePatterns` de next.config, et ce bloc
            est dimensionné en millimètres pour l'impression — l'habillage de
            `next/image` en casserait la mise en page.
          */}
          <div className="relative mt-1 h-[26mm] flex items-center justify-center">
            {data.cachetUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.cachetUrl}
                alt="Cachet"
                className="absolute inset-0 m-auto max-h-[26mm] object-contain opacity-80"
              />
            )}
            {data.signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.signatureUrl}
                alt="Signature"
                className="relative max-h-[20mm] object-contain"
              />
            )}
          </div>
          <p className="border-t border-black pt-1">{t("headTeacher")}</p>
        </div>
      </div>
      </div>
    </div>
  );
}
