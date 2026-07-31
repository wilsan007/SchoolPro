"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

export function PrintButton() {
  const t = useTranslations("bulletins");
  return (
    <Button size="sm" className="gap-2" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      {t("printPdf")}
    </Button>
  );
}
