"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { ImportElevesDialog } from "./ImportElevesDialog";

interface Site {
  id: string;
  nom: string;
  code?: string | null;
}

interface ImportElevesButtonProps {
  sites?: Site[];
  currentSiteId?: string | null;
  tenantHasSites?: boolean;
}

export function ImportElevesButton({ sites = [], currentSiteId = null, tenantHasSites = false }: ImportElevesButtonProps) {
  const t = useTranslations("import");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        {t("button")}
      </Button>
      {open && (
        <ImportElevesDialog
          onClose={() => setOpen(false)}
          sites={sites}
          currentSiteId={currentSiteId}
          tenantHasSites={tenantHasSites}
        />
      )}
    </>
  );
}
