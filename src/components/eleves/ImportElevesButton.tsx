"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImportElevesDialog } from "./ImportElevesDialog";

export function ImportElevesButton() {
  const t = useTranslations("import");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        {t("button")}
      </Button>
      {open && <ImportElevesDialog onClose={() => setOpen(false)} />}
    </>
  );
}
