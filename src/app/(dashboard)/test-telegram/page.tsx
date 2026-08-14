"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Send, CheckCircle2, XCircle, Loader2, RefreshCw, MessageCircle } from "lucide-react";

export default function TestTelegramPage() {
  const tc = useTranslations("common");
  const [chatId, setChatId] = useState("");
  const [eleveNom, setEleveNom] = useState("Kamil Abdullahi");
  const [ecoleNom, setEcoleNom] = useState("Lycée Mohamed Hashim Ledi");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  useEffect(() => {
    fetch("/api/test/telegram")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {});
  }, []);

  async function refreshChats() {
    setLoadingChats(true);
    try {
      const res = await fetch("/api/test/telegram?step=chatid");
      const data = await res.json();
      setChats(data.chats ?? []);
      if (data.chats?.length > 0) {
        toast.success(`${data.chats.length} chat(s) trouvé(s)`);
      } else {
        toast.info("Aucun chat trouvé. Envoyez /start au bot depuis Telegram.");
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setLoadingChats(false);
    }
  }

  async function sendTest(type: "test" | "absence" | "retard") {
    if (!chatId.trim()) {
      toast.error("Veuillez saisir un chat_id");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/test/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, type, eleveNom, ecoleNom }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        toast.success(data.simulated ? "Message simulé (pas de token réel)" : "Message envoyé avec succès !");
      } else {
        toast.error(data.error ?? "Échec de l'envoi");
      }
    } catch {
      toast.error(tc("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="w-6 h-6" />
          Test Telegram
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envoyez un vrai message Telegram pour vérifier l&apos;intégration
        </p>
      </div>

      {/* Configuration status */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">État de la configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Bot Token:</span>
              <span>{config.token ?? config.botInfo?.tokenStatus}</span>
            </div>
            {config.token?.includes("❌") && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠️ Mode simulation actif</p>
                <p className="mb-2">Pour envoyer de vrais messages :</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Ouvrez Telegram, cherchez <strong>@BotFather</strong></li>
                  <li>Envoyez <code>/newbot</code> et suivez les instructions</li>
                  <li>Copiez le token fourni</li>
                  <li>Ajoutez <code>TELEGRAM_BOT_TOKEN=votre_token</code> dans <code>.env.local</code></li>
                  <li>Redémarrez le serveur</li>
                  <li>Ouvrez votre bot dans Telegram et envoyez <code>/start</code></li>
                  <li>Cliquez sur &quot;Récupérer les chat_id&quot; ci-dessous</li>
                </ol>
              </div>
            )}
            {config.token?.includes("✅") && (
              <Button
                onClick={refreshChats}
                disabled={loadingChats}
                variant="outline"
                size="sm"
                className="gap-2 mt-2"
              >
                {loadingChats ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Récupérer les chat_id
              </Button>
            )}
            {chats.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Chats trouvés :</p>
                {chats.map((c) => (
                  <button
                    key={c.chatId}
                    onClick={() => setChatId(c.chatId)}
                    className="w-full text-left px-3 py-2 rounded border hover:bg-accent transition-colors text-sm flex items-center justify-between"
                  >
                    <span>
                      {c.firstName && `${c.firstName} `}
                      {c.username && `@${c.username}`}
                    </span>
                    <code className="text-xs text-muted-foreground">{c.chatId}</code>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Formulaire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Paramètres du test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Chat ID Telegram</label>
            <Input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="ex: 123456789"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              ID numérique du chat. Utilisez &quot;Récupérer les chat_id&quot; ou envoyez /start au bot puis vérifiez.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Nom de l&apos;élève</label>
              <Input value={eleveNom} onChange={(e) => setEleveNom(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Nom de l&apos;école</label>
              <Input value={ecoleNom} onChange={(e) => setEcoleNom(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Boutons d'envoi */}
      <div className="grid grid-cols-3 gap-3">
        <Button onClick={() => sendTest("test")} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Message test
        </Button>
        <Button onClick={() => sendTest("absence")} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          Notif absence
        </Button>
        <Button onClick={() => sendTest("retard")} disabled={loading} variant="outline" className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          Notif retard
        </Button>
      </div>

      {/* Résultat */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              Résultat de l&apos;envoi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="font-medium">Succès:</span> {result.success ? "✅ Oui" : "❌ Non"}</div>
            <div><span className="font-medium">Simulé:</span> {result.simulated ? "⚠️ Oui (pas de token réel)" : "✅ Non (envoi réel)"}</div>
            {result.messageId !== undefined && result.messageId !== -1 && (
              <div><span className="font-medium">Message ID:</span> <code>{result.messageId}</code></div>
            )}
            {result.error && <div><span className="font-medium">Erreur:</span> <span className="text-red-600">{result.error}</span></div>}
            <div><span className="font-medium">Envoyé à:</span> {result.sentTo}</div>
            <div><span className="font-medium">Type:</span> {result.type}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
