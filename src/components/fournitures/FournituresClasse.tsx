"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, PencilRuler, Calculator, Package, ShoppingBag } from "lucide-react";
import type { TypeFourniture } from "@prisma/client";
import { useTranslations } from "next-intl";

interface FournitureItem {
  id: string;
  type: TypeFourniture;
  nom: string;
  description: string | null;
  quantite: number;
  format: string | null;
  prixEstime: number | null;
  matiere: { nom: string } | null;
}

const TYPE_ICONS: Record<TypeFourniture, typeof BookOpen> = {
  LIVRE: BookOpen,
  CAHIER: PencilRuler,
  INSTRUMENT: Calculator,
  AUTRE: Package,
};

const TYPE_LABEL_KEYS: Record<TypeFourniture, string> = {
  LIVRE: "typeLivre",
  CAHIER: "typeCahier",
  INSTRUMENT: "typeInstrument",
  AUTRE: "typeAutre",
};

export function FournituresClasse({ items, classeNom }: { items: FournitureItem[]; classeNom?: string }) {
  const t = useTranslations("fournitures");
  if (!items || items.length === 0) return null;

  // Grouper par type
  const parType: Record<string, FournitureItem[]> = {};
  for (const item of items) {
    const key = item.type;
    if (!parType[key]) parType[key] = [];
    parType[key].push(item);
  }

  const totalEstime = items.reduce((sum, i) => sum + (i.prixEstime ?? 0) * i.quantite, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" />
          {classeNom ? t("fournituresClasse", { classe: classeNom }) : t("titre")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Object.entries(parType).map(([type, typeItems]) => {
            const Icon = TYPE_ICONS[type as TypeFourniture];
            return (
              <div key={type}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {t(TYPE_LABEL_KEYS[type as TypeFourniture] as any)} ({typeItems.length})
                </h4>
                <div className="space-y-1.5">
                  {typeItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 text-sm py-1.5 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{item.nom}</span>
                        {item.matiere && (
                          <Badge variant="outline" className="ml-2 text-xs">{item.matiere.nom}</Badge>
                        )}
                        {item.format && (
                          <span className="text-xs text-muted-foreground ml-2">· {item.format}</span>
                        )}
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-sm font-medium">×{item.quantite}</span>
                        {item.prixEstime != null && (
                          <p className="text-xs text-muted-foreground">{item.prixEstime * item.quantite} FCFA</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {totalEstime > 0 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium">{t("coutTotalEstime")}</span>
              <span className="text-sm font-bold">{totalEstime} FCFA</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
