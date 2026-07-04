"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, Send, Loader2, Check, Ban, AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingAction {
  type: "create_emploi_du_temps";
  classeId: string;
  classeNom: string;
  matiereId: string;
  matiereNom: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  jour: string;
  heureDebut: string;
  heureFin: string;
  salle: string | null;
}

interface BulkCreneauItem {
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiereId: string;
  matiereNom: string;
  enseignantId: string | null;
  enseignantNom: string | null;
  salle: string | null;
  groupe: "A" | "B" | null;
}

interface BulkPlan {
  type: "bulk_replace_emploi_du_temps";
  classeId: string;
  classeNom: string;
  nbCreneauxExistants: number;
  plan: BulkCreneauItem[];
  warnings: string[];
}

type ActionStatus = "applied" | "cancelled" | "error";

interface ActionItem {
  action: PendingAction;
  status?: ActionStatus;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: ActionItem[];
  bulkPlan?: BulkPlan;
  bulkStatus?: ActionStatus;
}

const JOUR_LABELS: Record<string, string> = {
  LUNDI: "Lundi",
  MARDI: "Mardi",
  MERCREDI: "Mercredi",
  JEUDI: "Jeudi",
  VENDREDI: "Vendredi",
  SAMEDI: "Samedi",
  DIMANCHE: "Dimanche",
};

const STORAGE_KEY = "ecolpro-ai-chat-messages";

export function AiChatWidget({ greeting }: { greeting: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // La conversation ne vivait qu'en mémoire React : un rechargement de page
  // (ou un remount du composant) l'effaçait silencieusement, donnant
  // l'impression que l'IA "oubliait" ce qui avait été proposé. Persistée en
  // sessionStorage, elle survit à un rechargement de l'onglet (effacée à la
  // fermeture de l'onglet, comme un historique de conversation classique).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // stockage corrompu ou indisponible — on repart d'une conversation vide
    }
    hasLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // quota dépassé ou stockage indisponible — non bloquant
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur IA");

      const actions: ActionItem[] = [
        ...(data.pendingAction ? [{ action: data.pendingAction as PendingAction }] : []),
        ...((data.suggestedActions as PendingAction[] | undefined)?.map((action) => ({ action })) ?? []),
      ];

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, actions, bulkPlan: data.bulkPlan as BulkPlan | undefined },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Erreur"}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(messageIndex: number, actionIndex: number, action: PendingAction) {
    const key = `${messageIndex}-${actionIndex}`;
    setApplyingKey(key);
    try {
      const res = await fetch("/api/emploi-du-temps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId: action.classeId,
          matiereId: action.matiereId,
          enseignantId: action.enseignantId ?? "",
          jour: action.jour,
          heureDebut: action.heureDebut,
          heureFin: action.heureFin,
          salle: action.salle ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors de la création du créneau");

      setActionStatus(messageIndex, actionIndex, "applied");
      router.refresh();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Créneau créé : ${action.matiereNom} — ${action.classeNom}, ${JOUR_LABELS[action.jour] ?? action.jour} ${action.heureDebut}-${action.heureFin}.`,
        },
      ]);
    } catch (err) {
      setActionStatus(messageIndex, actionIndex, "error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : "Impossible de créer le créneau"}` },
      ]);
    } finally {
      setApplyingKey(null);
    }
  }

  function setActionStatus(messageIndex: number, actionIndex: number, status: ActionStatus) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = updated[messageIndex];
      if (!msg.actions) return prev;
      const actions = [...msg.actions];
      actions[actionIndex] = { ...actions[actionIndex], status };
      updated[messageIndex] = { ...msg, actions };
      return updated;
    });
  }

  function setBulkStatus(messageIndex: number, status: ActionStatus) {
    setMessages((prev) => {
      const updated = [...prev];
      if (!updated[messageIndex].bulkPlan) return prev;
      updated[messageIndex] = { ...updated[messageIndex], bulkStatus: status };
      return updated;
    });
  }

  async function confirmBulkPlan(messageIndex: number, plan: BulkPlan) {
    const key = `bulk-${messageIndex}`;
    setApplyingKey(key);
    try {
      const res = await fetch("/api/emploi-du-temps/bulk-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classeId: plan.classeId,
          creneaux: plan.plan.map((c) => ({
            matiereId: c.matiereId,
            enseignantId: c.enseignantId,
            jour: c.jour,
            heureDebut: c.heureDebut,
            heureFin: c.heureFin,
            salle: c.salle,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur lors du remplacement de l'emploi du temps");

      setBulkStatus(messageIndex, "applied");
      router.refresh();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `✅ Emploi du temps de ${plan.classeNom} remplacé : ${data.deleted} créneau(x) supprimé(s), ${data.created} créé(s).`,
        },
      ]);
    } catch (err) {
      setBulkStatus(messageIndex, "error");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : "Impossible de remplacer l'emploi du temps"} — tu peux redemander une régénération du plan.`,
        },
      ]);
    } finally {
      setApplyingKey(null);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[32rem] max-h-[70vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-semibold">Assistant IA EcolPro</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMessages([])}
                aria-label="Nouvelle conversation"
                title="Nouvelle conversation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && <p className="text-xs text-gray-400 leading-relaxed">{greeting}</p>}
            {messages.map((m, mi) => (
              <div key={mi} className="space-y-2">
                <div
                  className={cn(
                    "text-sm rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap",
                    m.role === "user"
                      ? "ml-auto bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                  )}
                >
                  {m.content}
                </div>

                {m.actions?.map(({ action, status }, ai) => {
                  const key = `${mi}-${ai}`;
                  return (
                    <div
                      key={key}
                      className="max-w-[90%] rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-3 text-xs space-y-2"
                    >
                      <p className="text-gray-700 dark:text-gray-300">
                        {action.matiereNom} — {action.classeNom}
                        <br />
                        {JOUR_LABELS[action.jour] ?? action.jour} {action.heureDebut}-{action.heureFin}
                        {action.salle ? ` · Salle ${action.salle}` : ""}
                        {action.enseignantNom ? ` · ${action.enseignantNom}` : ""}
                      </p>

                      {!status && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => confirmAction(mi, ai, action)}
                            disabled={applyingKey === key}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                          >
                            {applyingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Confirmer
                          </button>
                          <button
                            onClick={() => setActionStatus(mi, ai, "cancelled")}
                            disabled={applyingKey === key}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Annuler
                          </button>
                        </div>
                      )}
                      {status === "applied" && <p className="text-green-600 font-medium">✓ Créé</p>}
                      {status === "cancelled" && <p className="text-gray-400 font-medium">Annulé</p>}
                      {status === "error" && <p className="text-red-500 font-medium">Échec — voir message ci-dessus</p>}
                    </div>
                  );
                })}

                {m.bulkPlan && (
                  <div className="max-w-[95%] rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 text-xs space-y-2">
                    <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Remplacement complet — {m.bulkPlan.classeNom}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                      {m.bulkPlan.nbCreneauxExistants} créneau(x) actuel(s) seront supprimés et remplacés par {m.bulkPlan.plan.length} nouveau(x) créneau(x).
                    </p>

                    {m.bulkPlan.warnings.length > 0 && (
                      <ul className="list-disc list-inside text-amber-700 dark:text-amber-400 space-y-0.5">
                        {m.bulkPlan.warnings.map((w, wi) => (
                          <li key={wi}>{w}</li>
                        ))}
                      </ul>
                    )}

                    <div className="max-h-40 overflow-y-auto border border-red-100 dark:border-red-900 rounded-lg divide-y divide-red-100 dark:divide-red-900 bg-white/50 dark:bg-black/10">
                      {m.bulkPlan.plan.map((c, ci) => (
                        <div key={ci} className="px-2 py-1 flex justify-between gap-2">
                          <span>
                            {JOUR_LABELS[c.jour] ?? c.jour} {c.heureDebut}-{c.heureFin} · {c.matiereNom}
                            {c.groupe ? ` (Gr. ${c.groupe})` : ""}
                          </span>
                          <span className="text-gray-500 shrink-0">{c.enseignantNom ?? "—"}</span>
                        </div>
                      ))}
                    </div>

                    {!m.bulkStatus && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => confirmBulkPlan(mi, m.bulkPlan!)}
                          disabled={applyingKey === `bulk-${mi}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {applyingKey === `bulk-${mi}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Confirmer le remplacement
                        </button>
                        <button
                          onClick={() => setBulkStatus(mi, "cancelled")}
                          disabled={applyingKey === `bulk-${mi}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Annuler
                        </button>
                      </div>
                    )}
                    {m.bulkStatus === "applied" && <p className="text-green-600 font-medium">✓ Emploi du temps remplacé</p>}
                    {m.bulkStatus === "cancelled" && <p className="text-gray-400 font-medium">Annulé</p>}
                    {m.bulkStatus === "error" && <p className="text-red-500 font-medium">Échec — voir message ci-dessus</p>}
                  </div>
                )}
              </div>
            ))}
            {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>

          <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Posez votre question..."
              disabled={loading}
              className="flex-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 shrink-0"
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        title="Assistant IA"
      >
        {open ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>
    </>
  );
}
