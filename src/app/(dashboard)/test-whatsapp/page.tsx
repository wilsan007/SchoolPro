"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Send, MessageCircle, Smartphone, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function TestWhatsAppPage() {
  const [phone, setPhone] = useState("");
  const [eleveNom, setEleveNom] = useState("Kamil Abdullahi");
  const [ecoleNom, setEcoleNom] = useState("Lycée Mohamed Hashim Ledi");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch("/api/test/whatsapp")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() => {});
  }, []);

  async function sendTest(type: "test" | "absence" | "retard" | "sms") {
    if (!phone.trim()) {
      toast.error("Veuillez saisir un numéro de téléphone");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/test/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, type, eleveNom, ecoleNom }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        toast.success(data.simulated ? "Message simulé (pas de token réel)" : "Message envoyé avec succès !");
      } else {
        toast.error(data.error ?? "Échec de l'envoi");
      }
    } catch (e) {
      toast.error("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Test WhatsApp & SMS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envoyez un vrai message WhatsApp ou SMS pour vérifier l&apos;intégration
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
              <MessageCircle className="w-4 h-4" />
              <span className="font-medium">WhatsApp:</span>
              <span>{config.whatsapp?.token}</span>
              <span className="text-muted-foreground">|</span>
              <span>{config.whatsapp?.phoneNumberId}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Smartphone className="w-4 h-4" />
              <span className="font-medium">SMS (Africa&apos;s Talking):</span>
              <span>{config.sms?.apiKey}</span>
              <span className="text-muted-foreground">|</span>
              <span>{config.sms?.username}</span>
            </div>
            {(config.whatsapp?.token?.includes("❌") || config.sms?.apiKey?.includes("❌")) && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <p className="font-semibold mb-1">⚠️ Mode simulation actif</p>
                <p>Pour envoyer de vrais messages, configurez les variables dans <code>.env.local</code> :</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li><code>WHATSAPP_API_TOKEN</code> — Token API WhatsApp Business Cloud</li>
                  <li><code>WHATSAPP_PHONE_NUMBER_ID</code> — ID du numéro WhatsApp Business</li>
                  <li><code>AT_API_KEY</code> — Clé API Africa&apos;s Talking</li>
                  <li><code>AT_USERNAME</code> — Nom d&apos;utilisateur Africa&apos;s Talking</li>
                </ul>
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
            <label className="text-sm font-medium block mb-1">Numéro de téléphone (format international)</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: 253779876543 ou +253779876543"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Indicatif pays requis. Djibouti: 253, Sénégal: 221, Côte d&apos;Ivoire: 225
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
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => sendTest("test")}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Message test WhatsApp
        </Button>
        <Button
          onClick={() => sendTest("absence")}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          Notif absence WhatsApp
        </Button>
        <Button
          onClick={() => sendTest("retard")}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
          Notif retard WhatsApp
        </Button>
        <Button
          onClick={() => sendTest("sms")}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
          Test SMS
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
            {result.messageId && <div><span className="font-medium">Message ID:</span> <code>{result.messageId}</code></div>}
            {result.error && <div><span className="font-medium">Erreur:</span> <span className="text-red-600">{result.error}</span></div>}
            <div><span className="font-medium">Envoyé à:</span> {result.sentTo}</div>
            <div><span className="font-medium">Type:</span> {result.type}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
