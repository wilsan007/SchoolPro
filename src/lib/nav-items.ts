import {
  LayoutDashboard, Users, ClipboardList, BookOpen, Target, Sparkles,
  Gauge, HandHeart, Calendar, GraduationCap, MessageSquare, Receipt,
  Settings, UserCheck, BarChart3, Shield, ShieldCheck, UserPlus,
  Briefcase, Bell, FileText, Compass, Archive, Package, Crown, PlayCircle,
  ListTodo, NotebookPen, Sun, Wrench, ClipboardCheck, BookOpenCheck,
  Grid3x3, GitCompare, Wallet, Gavel, HeartHandshake, CheckSquare, Activity,
  Brain, School, type LucideIcon,
} from "lucide-react";

/**
 * Registre unique de la navigation.
 * ============================================================
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * La même liste de modules était recopiée à quatre endroits : le dock du
 * workspace, la recherche Cmd+K, la navigation mobile et la barre latérale
 * (elle-même jamais rendue). Ajouter une page demandait de la déclarer quatre
 * fois ; oublier une copie faisait disparaître l'écran d'un seul point
 * d'entrée, en silence, parce que le filtre `canAccessRoute` masque aussi bien
 * une entrée interdite qu'une entrée absente de la liste.
 *
 * Désormais : une seule déclaration, consommée par `Dock`, `DockSearch` et
 * `MobileLayout`. La **visibilité** n'est pas décidée ici — chaque consommateur
 * applique `canAccessRoute(role, href, overrides)`, la même fonction que le
 * middleware et `guardPage`. Ce fichier dit seulement *ce qui existe*, pas
 * *qui y a droit*.
 *
 * Invariant verrouillé par `nav-items.test.ts` : chaque `href` déclaré ici doit
 * avoir une règle dans `ROUTE_RULES`. Un chemin ajouté au menu sans règle de
 * route serait refusé à tout le monde (fail-closed) et afficherait un lien mort.
 */
export interface NavItemDef {
  /** Clé de traduction dans le namespace `nav`. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroupDef {
  /** Clé de traduction du groupe, également son identifiant (`nav.<groupKey>`). */
  groupKey: string;
  /** Teinte d'accent du groupe (HSL), utilisée par les en-têtes et liserés. */
  accent: string;
  icon: LucideIcon;
  /** Classe Tailwind de couleur d'icône (présentation, propre à la navigation). */
  iconColor: string;
  items: NavItemDef[];
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    groupKey: "accueil",
    accent: "200 70% 46%",
    icon: School,
    iconColor: "text-primary",
    items: [
      { labelKey: "dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { labelKey: "direction", icon: Gauge, href: "/direction" },
      { labelKey: "monEspace", icon: Briefcase, href: "/mon-espace" },
      { labelKey: "maClasse", icon: Users, href: "/ma-classe" },
      { labelKey: "maMatiere", icon: Target, href: "/ma-matiere" },
      { labelKey: "couverture", icon: ShieldCheck, href: "/couverture" },
      { labelKey: "devoirs", icon: NotebookPen, href: "/devoirs" },
      // Espaces personnels : résolus par le lien relationnel du connecté
      // (parent → ses enfants, élève → lui-même).
      { labelKey: "monParcours", icon: HandHeart, href: "/parent" },
      { labelKey: "monParcoursEleve", icon: Target, href: "/eleve" },
      { labelKey: "monEmploi", icon: Calendar, href: "/mon-emploi" },
      { labelKey: "travail", icon: ListTodo, href: "/travail" },
      { labelKey: "maJournee", icon: Sun, href: "/ma-journee" },
      { labelKey: "entrainement", icon: Sparkles, href: "/entrainement" },
      { labelKey: "revisionSemaine", icon: BookOpenCheck, href: "/revision-semaine" },
      // Espaces dédiés par métier — chacun est l'accueil d'un rôle.
      { labelKey: "secretariat", icon: FileText, href: "/secretariat" },
      { labelKey: "conseiller", icon: Compass, href: "/conseiller" },
      { labelKey: "infirmerie", icon: HandHeart, href: "/infirmerie" },
      { labelKey: "comptabilite", icon: Receipt, href: "/comptabilite" },
      { labelKey: "exploitation", icon: Wrench, href: "/exploitation" },
      { labelKey: "inspection", icon: ClipboardCheck, href: "/inspection" },
    ],
  },
  {
    groupKey: "groupPedagogie",
    accent: "186 55% 42%",
    icon: BookOpen,
    iconColor: "text-info",
    items: [
      { labelKey: "eleves", icon: Users, href: "/eleves" },
      { labelKey: "notes", icon: BookOpen, href: "/notes" },
      { labelKey: "cahierJournal", icon: NotebookPen, href: "/cahier-journal" },
      { labelKey: "curriculum", icon: Target, href: "/curriculum" },
      { labelKey: "recommandations", icon: Sparkles, href: "/recommandations" },
      { labelKey: "plansLecon", icon: BookOpenCheck, href: "/plans-lecon" },
      { labelKey: "rubriquesEvaluation", icon: Grid3x3, href: "/rubriques-evaluation" },
      { labelKey: "propositionsIa", icon: ClipboardCheck, href: "/propositions-ia" },
      // `/evaluations` est le module « Examens » (planification + notes).
      { labelKey: "examens", icon: GraduationCap, href: "/evaluations" },
      { labelKey: "sessionsExamens", icon: ClipboardCheck, href: "/examens" },
      { labelKey: "conseilAugmente", icon: Brain, href: "/conseil-augmente" },
      { labelKey: "mentorat", icon: HeartHandshake, href: "/mentorat" },
      { labelKey: "cours", icon: PlayCircle, href: "/cours" },
      { labelKey: "emploi", icon: Calendar, href: "/emploi-du-temps" },
      { labelKey: "fournitures", icon: Package, href: "/fournitures" },
    ],
  },
  {
    groupKey: "groupVieScolaire",
    accent: "220 60% 50%",
    icon: Shield,
    iconColor: "text-primary",
    items: [
      { labelKey: "absences", icon: ClipboardList, href: "/absences" },
      { labelKey: "veilleAssiduite", icon: Activity, href: "/veille-assiduite" },
      { labelKey: "vieScolaire", icon: Shield, href: "/vie-scolaire" },
      { labelKey: "parents", icon: UserCheck, href: "/parents" },
    ],
  },
  {
    groupKey: "groupGestion",
    accent: "188 55% 45%",
    icon: Receipt,
    iconColor: "text-info",
    items: [
      { labelKey: "admissions", icon: UserPlus, href: "/admissions" },
      { labelKey: "facturation", icon: Receipt, href: "/facturation" },
      { labelKey: "caisse", icon: Wallet, href: "/caisse" },
      { labelKey: "rh", icon: Briefcase, href: "/rh" },
      { labelKey: "inventaire", icon: Package, href: "/inventaire" },
      { labelKey: "gouvernance", icon: Gavel, href: "/gouvernance" },
    ],
  },
  {
    groupKey: "groupCommunication",
    accent: "260 55% 58%",
    icon: Bell,
    iconColor: "text-accent",
    items: [
      { labelKey: "messages", icon: MessageSquare, href: "/messages" },
      { labelKey: "communication", icon: Bell, href: "/communication" },
    ],
  },
  {
    groupKey: "groupRapports",
    accent: "245 50% 55%",
    icon: BarChart3,
    iconColor: "text-accent",
    items: [
      { labelKey: "rapports", icon: FileText, href: "/rapports" },
      { labelKey: "analytics", icon: BarChart3, href: "/analytics" },
      { labelKey: "intelligence", icon: Brain, href: "/intelligence" },
      { labelKey: "comparateur", icon: GitCompare, href: "/comparateur" },
      { labelKey: "orientation", icon: Compass, href: "/orientation" },
      { labelKey: "alumni", icon: Archive, href: "/alumni" },
    ],
  },
  {
    groupKey: "systeme",
    accent: "210 18% 45%",
    icon: Settings,
    iconColor: "text-muted-foreground",
    items: [
      { labelKey: "taches", icon: CheckSquare, href: "/taches" },
      { labelKey: "superAdmin", icon: Crown, href: "/super-admin" },
      { labelKey: "parametres", icon: Settings, href: "/parametres" },
    ],
  },
];

/** Tous les items, groupes confondus — utilisé par la recherche et les tests. */
export const NAV_ITEMS: NavItemDef[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Raccourcis épinglés de la barre du bas (mobile), par rôle.
 *
 * Ce sont des préférences, pas des autorisations : `MobileLayout` confronte
 * chaque href à `canAccessRoute(role, href, overrides)` et laisse tomber ceux
 * qui ne passent pas. La liste n'en doit pas moins ne référencer que des écrans
 * réellement ouverts au rôle — un raccourci qui ne s'affiche jamais pour son
 * destinataire est un raccourci mal configuré. `nav-items.test.ts` le vérifie.
 */
export const PINNED_MOBILE: Record<string, string[]> = {
  SUPER_ADMIN: ["/dashboard", "/super-admin", "/parametres", "/analytics"],
  TENANT_ADMIN: ["/dashboard", "/direction", "/eleves", "/parametres"],
  PRINCIPAL: ["/dashboard", "/direction", "/eleves", "/absences"],
  SECRETARY: ["/dashboard", "/secretariat", "/eleves", "/absences"],
  TEACHER: ["/mon-espace", "/cahier-journal", "/notes", "/emploi-du-temps"],
  CLASS_TEACHER: ["/ma-classe", "/eleves", "/absences", "/notes"],
  COUNSELOR: ["/conseiller", "/eleves", "/orientation", "/mentorat"],
  NURSE: ["/infirmerie", "/eleves", "/absences", "/messages"],
  ACCOUNTANT: ["/comptabilite", "/facturation", "/caisse", "/parametres"],
  // CAISSIER n'a pas `parametres:read` : `/parametres` n'est pas un raccourci
  // pour lui, sa caisse l'est.
  CAISSIER: ["/caisse", "/facturation", "/comptabilite", "/messages"],
  SUPERVISOR: ["/vie-scolaire", "/absences", "/eleves", "/messages"],
  // SUBJECT_LEAD coordonne une matière : `/notes` est l'écran de saisie du
  // personnel enseignant et lui est fermé ; son outil est le cahier de textes.
  SUBJECT_LEAD: ["/ma-matiere", "/recommandations", "/cahier-journal", "/curriculum"],
  SITE_MANAGER: ["/exploitation", "/inventaire", "/eleves", "/messages"],
  INSPECTOR: ["/inspection", "/analytics", "/comparateur", "/eleves"],
  // Les familles n'ouvrent pas `/eleves` (annuaire du personnel) ni
  // `/facturation` : leurs écrans propres sont `/parent`, `/eleve`,
  // `/mon-emploi` et `/travail`.
  PARENT: ["/parent", "/mon-emploi", "/travail", "/messages"],
  STUDENT: ["/eleve", "/mon-emploi", "/entrainement", "/travail"],
};

/** Repli pour un rôle non listé : les raccourcis génériques du personnel. */
export const PINNED_MOBILE_DEFAUT = ["/dashboard", "/eleves", "/absences", "/messages"];

