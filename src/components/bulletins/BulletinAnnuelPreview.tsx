"use client";

import type { BulletinAnnuelData } from "@/lib/pdf/bulletin-generator";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useTranslations } from "next-intl";

interface Props {
  data: BulletinAnnuelData;
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

export function BulletinAnnuelPreview({ data }: Props) {
  const t = useTranslations("bulletins");
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
        border: "1px solid #000",
      }}
    >
      {/* Header Info */}
      <div className="flex flex-col mb-4">
        <div className="text-center text-red-600 font-bold mb-2">
          Email: ecoleprivee@gmail.com
        </div>

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
                {t("bulletinAnnualTitle")} {data.annee}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tableau des Disciplines: Moyennes par trimestre + Moyenne annuelle */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-white text-[9px]">
            <th className="border border-black p-1 w-[20%]" rowSpan={2}>{t("disciplines")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("coef")}</th>
            <th className="border border-black p-1" colSpan={2}>{t("term1")}</th>
            <th className="border border-black p-1" colSpan={2}>{t("term2")}</th>
            <th className="border border-black p-1" colSpan={2}>{t("term3")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("annualStudentAvg")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("annualClassAvg")}</th>
            <th className="border border-black p-1" rowSpan={2}>{t("rankLabel")}</th>
          </tr>
          <tr className="font-bold bg-gray-50 text-[8px]">
            <th className="border border-black p-0.5">{t("student")}</th>
            <th className="border border-black p-0.5">{t("classShort")}</th>
            <th className="border border-black p-0.5">{t("student")}</th>
            <th className="border border-black p-0.5">{t("classShort")}</th>
            <th className="border border-black p-0.5">{t("student")}</th>
            <th className="border border-black p-0.5">{t("classShort")}</th>
          </tr>
        </thead>
        <tbody>
          {data.matieres.map((m) => (
            <tr key={m.matiereCode}>
              <td className="border border-black bg-[#ffe4e1] p-1 text-center">
                <div className="font-bold uppercase text-[#8b0000] text-[9px]">{m.matiereNom}</div>
              </td>
              <td className="border border-black p-1">{m.coefficient}</td>
              {/* T1 */}
              <td className="border border-black bg-[#fffacd] p-1 font-bold">{fmt(m.moyennesTrim[0])}</td>
              <td className="border border-black bg-[#e0f2fe] p-1 text-blue-800">{fmt(data.moyennesClasseTrim[0])}</td>
              {/* T2 */}
              <td className="border border-black bg-[#fffacd] p-1 font-bold">{fmt(m.moyennesTrim[1])}</td>
              <td className="border border-black bg-[#e0f2fe] p-1 text-blue-800">{fmt(data.moyennesClasseTrim[1])}</td>
              {/* T3 */}
              <td className="border border-black bg-[#fffacd] p-1 font-bold">{fmt(m.moyennesTrim[2])}</td>
              <td className="border border-black bg-[#e0f2fe] p-1 text-blue-800">{fmt(data.moyennesClasseTrim[2])}</td>
              {/* Moyenne annuelle */}
              <td className="border border-black bg-[#bae6fd] p-1 font-bold text-blue-900">{fmt(m.moyenneAnnuelle)}</td>
              <td className="border border-black p-1 text-blue-700">—</td>
              <td className="border border-black p-1 font-bold text-[#b8860b]">{getOrdinal(m.rangAnnuel)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold bg-[#fbcfe8] text-[10px]">
            <td className="border border-black p-1 text-left pl-2" colSpan={2}>
              {t("generalAvg")}
            </td>
            {/* T1 */}
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">{fmt(data.moyennesGeneralesTrim[0])}</td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900">{fmt(data.moyennesClasseTrim[0])}</td>
            {/* T2 */}
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">{fmt(data.moyennesGeneralesTrim[1])}</td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900">{fmt(data.moyennesClasseTrim[1])}</td>
            {/* T3 */}
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">{fmt(data.moyennesGeneralesTrim[2])}</td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900">{fmt(data.moyennesClasseTrim[2])}</td>
            {/* Moyenne annuelle générale */}
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold text-[12px]">{fmt(data.moyenneAnnuelle)}</td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">{fmt(data.moyenneClasseAnnuelle)}</td>
            <td className="border border-black bg-[#bae6fd] p-1 text-blue-900 font-bold">
              {getOrdinal(data.rangAnnuel)}/{data.effectifClasse ?? "—"}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Tableau récapitulatif des trimestres */}
      <table className="w-full border-collapse border border-black text-center mb-4">
        <thead>
          <tr className="font-bold bg-[#fbcfe8] text-[10px]">
            <th className="border border-black p-2 w-[25%] text-left pl-2">{t("trimesters")}</th>
            <th className="border border-black p-2">MGC</th>
            <th className="border border-black p-2">MGE</th>
            <th className="border border-black p-2">POSITION</th>
            <th className="border border-black p-2 w-[25%] text-left pl-2">{t("absencesHours")}</th>
          </tr>
        </thead>
        <tbody>
          {[t("term1"), t("term2"), t("term3")].map((label, i) => (
            <tr key={i}>
              <td className="border border-black p-2 text-left font-bold">{label}</td>
              <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">{fmt(data.moyennesClasseTrim[i])}</td>
              <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold">{fmt(data.moyennesGeneralesTrim[i])}</td>
              <td className="border border-black p-2 bg-[#bae6fd] text-blue-900">—</td>
              <td className="border border-black p-2 bg-[#dcfce7] text-green-700 text-left pl-2">{data.heuresAbsenceTrim[i] ?? 0} h</td>
            </tr>
          ))}
          <tr className="font-bold bg-[#fbcfe8]">
            <td className="border border-black p-2 text-left">{t("annualAverageLabel")}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold">{fmt(data.moyenneClasseAnnuelle)}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold text-[12px]">{fmt(data.moyenneAnnuelle)}</td>
            <td className="border border-black p-2 bg-[#bae6fd] text-blue-900 font-bold">
              {getOrdinal(data.rangAnnuel)}/{data.effectifClasse ?? "—"}
            </td>
            <td className="border border-black p-2 bg-[#dcfce7] text-green-700 text-left pl-2">
              {(data.heuresAbsenceTrim.filter(h => h !== null).reduce((a, b) => a + (b ?? 0), 0))} h
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature & Cachet */}
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
