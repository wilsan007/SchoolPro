"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface EdtEntry {
  id: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
  classe: { id: string; nom: string; niveau: string };
  matiere: { id: string; nom: string; code: string; couleur: string | null };
  enseignant: { id: string; user: { name: string | null } } | null;
}

const JOURS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"];

const JOURS_LABELS: Record<string, { fr: string; en: string; so: string }> = {
  LUNDI: { fr: "Lundi", en: "Monday", so: "Isniin" },
  MARDI: { fr: "Mardi", en: "Tuesday", so: "Talaado" },
  MERCREDI: { fr: "Mercredi", en: "Wednesday", so: "Arbaco" },
  JEUDI: { fr: "Jeudi", en: "Thursday", so: "Khamiis" },
  VENDREDI: { fr: "Vendredi", en: "Friday", so: "Jimco" },
  SAMEDI: { fr: "Samedi", en: "Saturday", so: "Sabti" },
};

export function ParentEdtView({ entries }: { entries: EdtEntry[] }) {
  const t = useTranslations("parentPortal");
  const locale = useTranslations()("parentPortal.locale") || "fr";

  const byDay = useMemo(() => {
    const map: Record<string, EdtEntry[]> = {};
    for (const j of JOURS) map[j] = [];
    for (const e of entries) {
      const j = (e.jour || "").toUpperCase();
      if (map[j]) map[j].push(e);
    }
    for (const j of JOURS) map[j].sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
    return map;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("edtVide")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {JOURS.filter((j) => byDay[j].length > 0).map((jour) => (
        <Card key={jour}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {JOURS_LABELS[jour]?.[locale as "fr" | "en" | "so"] ?? JOURS_LABELS[jour]?.fr ?? jour}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byDay[jour].map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 rounded-lg border p-2.5"
                style={{
                  borderLeftColor: e.matiere.couleur ?? "#6366f1",
                  borderLeftWidth: 3,
                }}
              >
                <div className="flex-shrink-0 text-xs font-medium text-muted-foreground">
                  {e.heureDebut} – {e.heureFin}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.matiere.nom}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {e.salle && <Badge variant="outline" className="text-xs">{e.salle}</Badge>}
                    {e.enseignant?.user?.name && (
                      <span className="text-xs text-muted-foreground">
                        {e.enseignant.user.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
