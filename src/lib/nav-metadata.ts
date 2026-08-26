import {
  LayoutDashboard, Users, ClipboardList, BookOpen, Target, Sparkles,
  Gauge, HandHeart, Calendar, GraduationCap, MessageSquare, Receipt,
  Settings, School, UserCheck, BarChart3, Shield, ShieldCheck, UserPlus,
  Briefcase, Bell, FileText, Compass, Archive, Package, Crown, PlayCircle,
  ListTodo, NotebookPen, Sun, Wrench, ClipboardCheck, BookOpenCheck,
  Grid3x3, GitCompare, Wallet, Gavel, HeartHandshake, CheckSquare, Activity,
  Brain, type LucideIcon,
} from "lucide-react";

export interface RouteMeta {
  title: string;
  icon: LucideIcon;
  iconColor: string;
}

/**
 * Métadonnées des routes du dashboard — utilisées par le Workspace
 * (ouverture de la fenêtre initiale) et par la Sidebar (launchers).
 */
export const ROUTE_METADATA: Record<string, RouteMeta> = {
  "/dashboard": { title: "Dashboard", icon: LayoutDashboard, iconColor: "text-primary" },
  "/direction": { title: "Direction", icon: Gauge, iconColor: "text-primary" },
  "/mon-espace": { title: "Mon espace", icon: Briefcase, iconColor: "text-info" },
  "/ma-classe": { title: "Ma classe", icon: Users, iconColor: "text-info" },
  "/ma-matiere": { title: "Ma matière", icon: Target, iconColor: "text-accent" },
  "/couverture": { title: "Couverture", icon: ShieldCheck, iconColor: "text-primary" },
  "/devoirs": { title: "Devoirs", icon: NotebookPen, iconColor: "text-accent" },
  "/parent": { title: "Mon parcours", icon: HandHeart, iconColor: "text-accent" },
  "/eleve": { title: "Mon parcours élève", icon: Target, iconColor: "text-accent" },
  "/mon-emploi": { title: "Mon emploi", icon: Calendar, iconColor: "text-info" },
  "/travail": { title: "Travail", icon: ListTodo, iconColor: "text-accent" },
  "/ma-journee": { title: "Ma journée", icon: Sun, iconColor: "text-primary" },
  "/entrainement": { title: "Entraînement", icon: Sparkles, iconColor: "text-primary" },
  "/revision-semaine": { title: "Révision", icon: BookOpenCheck, iconColor: "text-info" },
  "/secretariat": { title: "Secrétariat", icon: FileText, iconColor: "text-info" },
  "/conseiller": { title: "Conseiller", icon: Compass, iconColor: "text-accent" },
  "/infirmerie": { title: "Infirmerie", icon: HandHeart, iconColor: "text-accent" },
  "/comptabilite": { title: "Comptabilité", icon: Receipt, iconColor: "text-info" },
  "/exploitation": { title: "Exploitation", icon: Wrench, iconColor: "text-muted-foreground" },
  "/inspection": { title: "Inspection", icon: ClipboardCheck, iconColor: "text-primary" },
  "/eleves": { title: "Élèves", icon: Users, iconColor: "text-accent" },
  "/notes": { title: "Notes", icon: BookOpen, iconColor: "text-info" },
  "/cahier-journal": { title: "Cahier journal", icon: NotebookPen, iconColor: "text-accent" },
  "/curriculum": { title: "Curriculum", icon: Target, iconColor: "text-accent" },
  "/recommandations": { title: "Recommandations", icon: Sparkles, iconColor: "text-accent" },
  "/plans-lecon": { title: "Plans de leçon", icon: BookOpenCheck, iconColor: "text-accent" },
  "/rubriques-evaluation": { title: "Rubriques", icon: Grid3x3, iconColor: "text-accent" },
  "/propositions-ia": { title: "Propositions IA", icon: ClipboardCheck, iconColor: "text-info" },
  "/evaluations": { title: "Examens", icon: GraduationCap, iconColor: "text-primary" },
  "/examens": { title: "Sessions examens", icon: ClipboardCheck, iconColor: "text-primary" },
  "/conseil-augmente": { title: "Conseil augmenté", icon: Brain, iconColor: "text-accent" },
  "/mentorat": { title: "Mentorat", icon: HeartHandshake, iconColor: "text-accent" },
  "/cours": { title: "Cours", icon: PlayCircle, iconColor: "text-accent" },
  "/emploi-du-temps": { title: "Emploi du temps", icon: Calendar, iconColor: "text-info" },
  "/fournitures": { title: "Fournitures", icon: Package, iconColor: "text-primary" },
  "/absences": { title: "Absences", icon: ClipboardList, iconColor: "text-primary" },
  "/veille-assiduite": { title: "Veille assiduité", icon: Activity, iconColor: "text-primary" },
  "/vie-scolaire": { title: "Vie scolaire", icon: Shield, iconColor: "text-destructive" },
  "/parents": { title: "Parents", icon: UserCheck, iconColor: "text-accent" },
  "/admissions": { title: "Admissions", icon: UserPlus, iconColor: "text-info" },
  "/facturation": { title: "Facturation", icon: Receipt, iconColor: "text-info" },
  "/caisse": { title: "Caisse", icon: Wallet, iconColor: "text-info" },
  "/rh": { title: "Ressources humaines", icon: Briefcase, iconColor: "text-primary" },
  "/inventaire": { title: "Inventaire", icon: Package, iconColor: "text-muted-foreground" },
  "/gouvernance": { title: "Gouvernance", icon: Gavel, iconColor: "text-muted-foreground" },
  "/messages": { title: "Messages", icon: MessageSquare, iconColor: "text-accent" },
  "/communication": { title: "Communication", icon: Bell, iconColor: "text-primary" },
  "/rapports": { title: "Rapports", icon: FileText, iconColor: "text-muted-foreground" },
  "/analytics": { title: "Analytics", icon: BarChart3, iconColor: "text-destructive" },
  "/intelligence": { title: "Intelligence", icon: Brain, iconColor: "text-accent" },
  "/comparateur": { title: "Comparateur", icon: GitCompare, iconColor: "text-info" },
  "/orientation": { title: "Orientation", icon: Compass, iconColor: "text-info" },
  "/alumni": { title: "Alumni", icon: Archive, iconColor: "text-accent" },
  "/taches": { title: "Tâches", icon: CheckSquare, iconColor: "text-muted-foreground" },
  "/super-admin": { title: "Super Admin", icon: Crown, iconColor: "text-primary" },
  "/parametres": { title: "Paramètres", icon: Settings, iconColor: "text-muted-foreground" },
  "/profil": { title: "Profil", icon: Users, iconColor: "text-primary" },
};

/** Récupère les métadonnées d'une route, avec un fallback générique */
export function getRouteMeta(route: string): RouteMeta {
  // Gérer les routes dynamiques (ex: /eleves/123 → /eleves)
  const baseRoute = "/" + (route.split("/")[1] ?? "");
  return (
    ROUTE_METADATA[route] ??
    ROUTE_METADATA[baseRoute] ?? {
      title: baseRoute.charAt(1).toUpperCase() + baseRoute.slice(2),
      icon: School,
      iconColor: "text-primary",
    }
  );
}
