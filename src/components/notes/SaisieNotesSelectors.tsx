"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  classes: { id: string; nom: string }[];
  matieres: { id: string; nom: string }[];
  evaluations: { id: string; titre: string; type: string }[];
  selectedClasseId?: string;
  selectedMatiereId?: string;
  selectedEvaluationId?: string;
}

export function SaisieNotesSelectors({
  classes,
  matieres,
  evaluations,
  selectedClasseId = "",
  selectedMatiereId = "",
  selectedEvaluationId = "",
}: Props) {
  const router = useRouter();
  const t = useTranslations("notes");

  function handleClasseChange(classeId: string) {
    const params = new URLSearchParams();
    if (classeId) params.set("classeId", classeId);
    if (selectedMatiereId) params.set("matiereId", selectedMatiereId);
    router.push(`/notes?${params.toString()}`);
  }

  function handleMatiereChange(matiereId: string) {
    const params = new URLSearchParams();
    if (selectedClasseId) params.set("classeId", selectedClasseId);
    if (matiereId) params.set("matiereId", matiereId);
    router.push(`/notes?${params.toString()}`);
  }

  function handleEvaluationChange(evaluationId: string) {
    const params = new URLSearchParams();
    if (selectedClasseId) params.set("classeId", selectedClasseId);
    if (selectedMatiereId) params.set("matiereId", selectedMatiereId);
    if (evaluationId) params.set("evaluationId", evaluationId);
    router.push(`/notes?${params.toString()}`);
  }

  return (
    <div className="bg-background p-4 rounded-xl border shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("selectClassLabel")}</label>
        <select
          value={selectedClasseId}
          onChange={(e) => handleClasseChange(e.target.value)}
          className="w-full h-10 px-3 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t("selectClassPlaceholder")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("selectSubjectLabel")}</label>
        <select
          value={selectedMatiereId}
          onChange={(e) => handleMatiereChange(e.target.value)}
          className="w-full h-10 px-3 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t("selectSubjectPlaceholder")}</option>
          {matieres.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("selectExamLabel")}</label>
        <select
          value={selectedEvaluationId}
          onChange={(e) => handleEvaluationChange(e.target.value)}
          disabled={!selectedClasseId || !selectedMatiereId}
          className="w-full h-10 px-3 border rounded-lg bg-background text-sm disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t("selectExamPlaceholder")}</option>
          {evaluations.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.titre} ({ev.type})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
