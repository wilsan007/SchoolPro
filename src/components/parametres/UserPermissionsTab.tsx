"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Trash2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ALL_PERMISSIONS } from "@/lib/permissions";

interface UserPermission {
  id: string;
  userId: string;
  permission: string;
  mode: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function UserPermissionsTab({ users }: { users: User[] }) {
  const t = useTranslations("userPermissions");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [overrides, setOverrides] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newPerm, setNewPerm] = useState("");
  const [newMode, setNewMode] = useState<"grant" | "deny">("grant");

  useEffect(() => {
    if (!selectedUserId) return;
    setLoading(true);
    fetch(`/api/user-permissions?userId=${selectedUserId}`)
      .then((r) => r.json())
      .then((data) => setOverrides(Array.isArray(data) ? data : []))
      .catch(() => setOverrides([]))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  function addPermission() {
    if (!selectedUserId || !newPerm) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/user-permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, permission: newPerm, mode: newMode }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || t("error"));
        }
        const data = await res.json();
        setOverrides((prev) => {
          const filtered = prev.filter((o) => o.permission !== newPerm);
          return [...filtered, data].sort((a, b) => a.permission.localeCompare(b.permission));
        });
        toast.success(t("success"));
        setNewPerm("");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  function deletePermission(id: string, permission: string) {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/user-permissions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error(t("error"));
        setOverrides((prev) => prev.filter((o) => o.id !== id));
        toast.success(t("success"));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : t("error"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            {t("title")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">{t("selectUser")}</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) — {u.role}
                </option>
              ))}
            </select>
          </div>

          {selectedUserId && (
            <>
              <div className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1 w-full">
                  <label className="text-sm font-medium block mb-1">{t("permission")}</label>
                  <select
                    value={newPerm}
                    onChange={(e) => setNewPerm(e.target.value)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">—</option>
                    {ALL_PERMISSIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-32">
                  <label className="text-sm font-medium block mb-1">{t("mode")}</label>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as "grant" | "deny")}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="grant">{t("grant")}</option>
                    <option value="deny">{t("deny")}</option>
                  </select>
                </div>
                <Button
                  onClick={addPermission}
                  disabled={isPending || !newPerm}
                  className="gap-2 shrink-0"
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t("add")}
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : overrides.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{t("noPermissions")}</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  {overrides.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                      <code className="text-sm font-mono flex-1">{o.permission}</code>
                      <Badge variant={o.mode === "grant" ? "success" : "destructive"}>
                        {o.mode === "grant" ? t("grant") : t("deny")}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deletePermission(o.id, o.permission)}
                        disabled={isPending}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
