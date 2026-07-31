"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users, MessageSquare, Search, Wifi, WifiOff,
  Phone, Mail, BookOpen, AlertTriangle, ChevronDown,
  ChevronUp, TrendingUp, UserCheck, FileText,
} from "lucide-react";
import { cn, getInitials, calculerMoyenne, timeAgo } from "@/lib/utils";
import Link from "next/link";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EleveInfo {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  statut: string;
  classe: { nom: string; niveau: string } | null;
  absences: { id: string }[];
  notes: { valeur: number; noteMax: number; coefficient: number }[];
  bulletins: { moyenneGenerale: number | null; isPublie: boolean }[];
}

interface EleveParentInfo {
  eleve: EleveInfo;
}

interface ParentData {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  phone: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    lastLoginAt: Date | string | null;
  } | null;
  eleves: EleveParentInfo[];
}

interface ParentsViewProps {
  parents: ParentData[];
  tenantId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isENTActif(lastLoginAt: Date | string | null): boolean {
  if (!lastLoginAt) return false;
  const diff = Date.now() - new Date(lastLoginAt).getTime();
  return diff < 30 * 24 * 60 * 60 * 1000; // 30 jours
}

function getMoyenneColor(moyenne: number | null): string {
  if (moyenne === null) return "text-gray-400";
  if (moyenne >= 14) return "text-green-600 dark:text-green-400";
  if (moyenne >= 10) return "text-blue-600 dark:text-blue-400";
  if (moyenne >= 8) return "text-orange-500";
  return "text-red-600 dark:text-red-400";
}

// ─── Sous-composant : carte enfant ────────────────────────────────────────────

function EnfantCard({ enfant }: { enfant: EleveInfo }) {
  const t = useTranslations("parents");
  const moyenne = calculerMoyenne(enfant.notes);
  const absencesCount = enfant.absences.length;
  const bulletinsPublies = enfant.bulletins.filter((b) => b.isPublie);
  const dernierBulletin = bulletinsPublies[0];

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <BookOpen className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {enfant.prenom} {enfant.nom}
          </span>
          {enfant.classe && (
            <Badge className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20">
              {enfant.classe.nom}
            </Badge>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">{enfant.matricule}</p>

        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {/* Moyenne */}
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
            {moyenne !== null ? (
              <span className={cn("text-sm font-bold", getMoyenneColor(moyenne))}>
                {moyenne.toFixed(2)}/20
              </span>
            ) : (
              <span className="text-xs text-gray-400">{t("pvNoGrades")}</span>
            )}
          </div>

          {/* Absences */}
          {absencesCount > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                {t("pvAbsUnjust", { count: absencesCount })}
              </span>
            </div>
          )}

          {/* Bulletin */}
          {dernierBulletin && (
            <div className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">
                {t("pvBulletins", { count: bulletinsPublies.length })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sous-composant : carte parent ───────────────────────────────────────────

function ParentCard({ parent }: { parent: ParentData }) {
  const t = useTranslations("parents");
  const [expanded, setExpanded] = useState(true);
  const actif = isENTActif(parent.user?.lastLoginAt ?? null);
  const totalAbsences = parent.eleves.reduce(
    (sum, ep) => sum + ep.eleve.absences.length,
    0
  );

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        {/* En-tête parent */}
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 flex-shrink-0">
            {parent.user?.avatarUrl && (
              <AvatarImage src={parent.user.avatarUrl} alt={parent.nom} />
            )}
            <AvatarFallback className="bg-pink-100 text-pink-700 text-sm font-semibold">
              {getInitials(`${parent.prenom} ${parent.nom}`)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {parent.prenom} {parent.nom}
                </h3>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {parent.email && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Mail className="w-3 h-3" />
                      {parent.email}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    {parent.phone}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Badge ENT */}
                {parent.user ? (
                  <Badge
                    className={cn(
                      "text-xs gap-1",
                      actif
                        ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400"
                    )}
                  >
                    {actif ? (
                      <Wifi className="w-3 h-3" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    ENT {actif ? t("pvEntActive") : t("pvEntInactive")}
                  </Badge>
                ) : (
                  <Badge className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                    {t("pvNoAccount")}
                  </Badge>
                )}
              </div>
            </div>

            {/* Dernière connexion */}
            {parent.user?.lastLoginAt && (
              <p className="text-xs text-gray-400 mt-1">
                {t("pvLastLogin", { time: timeAgo(parent.user.lastLoginAt) })}
              </p>
            )}
          </div>
        </div>

        {/* Alertes absences */}
        {totalAbsences > 0 && (
          <div className="mt-3 px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <p className="text-xs text-orange-700 dark:text-orange-300">
              {t("pvAbsAlert", { count: totalAbsences })}
            </p>
          </div>
        )}

        {/* Enfants */}
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {t("pvChildren", { count: parent.eleves.length })}
            </span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {expanded && parent.eleves.length > 0 && (
            <div className="mt-2 space-y-2">
              {parent.eleves.map((ep) => (
                <EnfantCard key={ep.eleve.id} enfant={ep.eleve} />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
          <Link href="/messages" className="flex-1">
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs">
              <MessageSquare className="w-3.5 h-3.5" />
              {t("pvSendMessage")}
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="text-xs text-gray-500">
            {t("pvViewProfile")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function ParentsView({ parents }: ParentsViewProps) {
  const t = useTranslations("parents");
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "actif" | "inactif" | "sans_compte">("tous");

  // Statistiques
  const stats = useMemo(() => {
    const total = parents.length;
    const avecCompte = parents.filter((p) => p.user).length;
    const actifs = parents.filter((p) => isENTActif(p.user?.lastLoginAt ?? null)).length;
    const totalEnfants = parents.reduce((s, p) => s + p.eleves.length, 0);
    const totalAbsences = parents.reduce(
      (s, p) => s + p.eleves.reduce((s2, ep) => s2 + ep.eleve.absences.length, 0),
      0
    );
    return { total, avecCompte, actifs, totalEnfants, totalAbsences };
  }, [parents]);

  // Filtrage
  const parentsFiltres = useMemo(() => {
    return parents.filter((p) => {
      const nomComplet = `${p.prenom} ${p.nom} ${p.email ?? ""} ${p.phone}`.toLowerCase();
      const matchSearch = !search || nomComplet.includes(search.toLowerCase());

      let matchFiltre = true;
      if (filtre === "actif") matchFiltre = isENTActif(p.user?.lastLoginAt ?? null);
      else if (filtre === "inactif") matchFiltre = !!p.user && !isENTActif(p.user.lastLoginAt);
      else if (filtre === "sans_compte") matchFiltre = !p.user;

      return matchSearch && matchFiltre;
    });
  }, [parents, search, filtre]);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex justify-end">
        <a href="/parametres">
          <Button size="sm" className="gap-2">
            <UserCheck className="h-4 w-4" />
            {t("pvAddParent")}
          </Button>
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{t("pvTotalParents")}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-pink-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{t("pvEntActiveShort")}</p>
                <p className="text-2xl font-bold text-green-600 mt-0.5">{stats.actifs}</p>
                <p className="text-xs text-gray-400">{t("pvWithAccount", { count: stats.avecCompte })}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{t("pvChildrenFollowed")}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{stats.totalEnfants}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">{t("pvAbsUnjustified")}</p>
                <p className={cn(
                  "text-2xl font-bold mt-0.5",
                  stats.totalAbsences > 0 ? "text-orange-500" : "text-gray-900 dark:text-white"
                )}>
                  {stats.totalAbsences}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres & Recherche */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder={t("pvSearchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["tous", "actif", "inactif", "sans_compte"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltre(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    filtre === f
                      ? "bg-primary text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {f === "tous" && t("pvFilterAll")}
                  {f === "actif" && t("pvFilterActive")}
                  {f === "inactif" && t("pvFilterInactive")}
                  {f === "sans_compte" && t("pvFilterNoAccount")}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      {parentsFiltres.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-16 text-center">
            <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">{t("pvNoParentFound")}</p>
            {search && (
              <p className="text-xs text-gray-400 mt-1">
                {t("pvTryOtherSearch")}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {parentsFiltres.map((parent) => (
            <ParentCard key={parent.id} parent={parent} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        {t("pvCountDisplayed", { count: parentsFiltres.length })}
      </p>
    </div>
  );
}
