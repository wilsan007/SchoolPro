"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, Loader2, Image as ImageIcon, Save } from "lucide-react";
import { toast } from "sonner";

interface TenantSignature {
  name: string;
  chefEtablissement: string | null;
  signatureUrl: string | null;
  cachetUrl: string | null;
}

export function SignatureCachetManager({ tenant: initial }: { tenant: TenantSignature }) {
  const t = useTranslations("signature");
  const tCommon = useTranslations("common");
  const [tenant, setTenant] = useState(initial);
  const [chefEtablissement, setChefEtablissement] = useState(initial.chefEtablissement ?? "");
  const [signatureUrl, setSignatureUrl] = useState(initial.signatureUrl ?? "");
  const [cachetUrl, setCachetUrl] = useState(initial.cachetUrl ?? "");
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/parametres/signature-cachet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chefEtablissement, signatureUrl, cachetUrl }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? t("error"));
        }
        setTenant({ name: tenant.name, chefEtablissement, signatureUrl, cachetUrl });
        toast.success(t("saved"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  async function handleUpload(type: "signature" | "cachet") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      try {
        const res = await fetch("/api/parametres/upload-signature", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (type === "signature") setSignatureUrl(data.url);
        else setCachetUrl(data.url);
        toast.success(t("saved"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    };
    input.click();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
        <div className="space-y-2">
          <Label>{t("headMaster")}</Label>
          <Input
            placeholder="ex: M. Ahmed Ali"
            value={chefEtablissement}
            onChange={(e) => setChefEtablissement(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("signature")}</Label>
            <div className="flex items-center gap-3">
              {signatureUrl && <img src={signatureUrl} alt={t("signature")} className="h-16 object-contain border rounded" />}
              <Button variant="outline" size="sm" onClick={() => handleUpload("signature")} className="gap-2">
                <Upload className="h-4 w-4" /> {t("upload")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("cachet")}</Label>
            <div className="flex items-center gap-3">
              {cachetUrl && <img src={cachetUrl} alt={t("cachet")} className="h-16 object-contain border rounded" />}
              <Button variant="outline" size="sm" onClick={() => handleUpload("cachet")} className="gap-2">
                <Upload className="h-4 w-4" /> {t("upload")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tCommon("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
