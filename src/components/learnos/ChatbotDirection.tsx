"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, BarChart3, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// ScrollArea n'existe pas dans le projet — utiliser un div avec overflow.

interface Message {
  role: "user" | "assistant";
  texte: string;
  horsPerimetre?: boolean;
  outil?: string;
}

/**
 * Chatbot d'analyse de données pour la direction.
 *
 * L'IA ne peut qu'appeler des outils fermés — jamais de SQL libre.
 * Hors périmètre → message borné qui le signale.
 *
 * Réservé à TENANT_ADMIN, PRINCIPAL, SUPER_ADMIN.
 */
export function ChatbotDirection() {
  const t = useTranslations("learnos.chatbotDirection");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function envoyer() {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setMessages((prev) => [...prev, { role: "user", texte: question }]);
    setInput("");
    setLoading(true);

    // Construire l'historique à partir des messages existants (sans le message qu'on vient d'ajouter).
    const historique = messages.map((m) => ({
      role: m.role,
      content: m.texte,
    }));

    try {
      const res = await fetch("/api/learnos/chatbot-direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, historique }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          texte: data.texte,
          horsPerimetre: data.horsPerimetre,
          outil: data.outilAppele,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          texte: error instanceof Error ? error.message : "Erreur de connexion",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    t("suggestions.effectifs"),
    t("suggestions.absences"),
    t("suggestions.programme"),
    t("suggestions.impayes"),
  ];

  return (
    <Card className="flex h-[600px] flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          {t("titre")}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="space-y-3 pr-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("introduction")}</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      onClick={() => setInput(s)}
                      disabled={loading}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-1",
                  msg.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 text-sm",
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : msg.horsPerimetre
                        ? "border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-muted"
                  )}
                >
                  {msg.horsPerimetre && (
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium">
                      <AlertCircle className="h-3 w-3" />
                      {t("horsPerimetre")}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.texte}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start">
                <div className="max-w-[80%] rounded-lg bg-muted p-3 text-sm">
                  <span className="animate-pulse">{t("analyse")}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && envoyer()}
            placeholder={t("placeholder")}
            disabled={loading}
            maxLength={500}
          />
          <Button onClick={envoyer} disabled={loading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
