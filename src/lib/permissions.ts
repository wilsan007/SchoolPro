/**
 * EcolPro — Source unique de vérité de l'autorisation
 * ============================================================
 * Ce fichier est **pur** : aucun import de Prisma, de NextAuth ou d'audit.
 * C'est ce qui lui permet d'être chargé à trois endroits qui ne peuvent pas
 * partager de code lourd :
 *
 *   1. `src/middleware.ts`  — runtime Edge, pas de Prisma possible.
 *   2. `src/lib/rbac.ts`    — routes API (Node).
 *   3. `src/components/layout/Sidebar.tsx` — composant client (navigation).
 *
 * Avant, chacun portait sa propre copie de la matrice : trois vérités qui
 * divergeaient silencieusement. Une permission ajoutée ici ne s'appliquait
 * ni à la route ni au menu. C'est la cause des accès incohérents constatés.
 *
 * Modèle : permissions au format "<module>:<action>".
 *   - "*"            → toutes les permissions (plateforme)
 *   - "<module>:*"   → toutes les actions d'un module
 *   - "<module>:read" / ":write" / ":delete" / ":publish" / ":send" / ":valider"
 */

/** Les rôles du schéma Prisma, redéclarés pour rester Edge-safe. */
export type RoleKey =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "PRINCIPAL"
  | "SECRETARY"
  | "TEACHER"
  | "CLASS_TEACHER"
  | "COUNSELOR"
  | "NURSE"
  | "ACCOUNTANT"
  | "CAISSIER"
  | "SUPERVISOR"
  | "SUBJECT_LEAD"
  | "SITE_MANAGER"
  | "INSPECTOR"
  | "PARENT"
  | "STUDENT";

export type Permission = string;

// ============================================================
// 1. Matrice des permissions par rôle
// ============================================================
export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  // Plateforme EcolPro — accès total (y compris l'administration plateforme).
  SUPER_ADMIN: ["*"],

  // Directeur / Propriétaire — tout dans son établissement.
  TENANT_ADMIN: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "curriculum:*", "cours:*", "emploi-du-temps:*",
    "cahier-journal:read", "cahier-journal:write",
    "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:*", "finance:*", "inventaire:*", "alumni:*",
    "orientation:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "audit:read", "parametres:*",
    // Le directeur suit et valide, il ne fait pas les exercices.
    "entrainement:read", "entrainement:valider",
    // Gouvernance, mentorat et tâches : pilotage de l'établissement.
    "gouvernance:*", "mentorat:*", "taches:*",
  ],

  // Chef d'établissement — pédagogie et vie scolaire complètes ;
  // finance et RH en lecture seule, les paramètres aussi.
  PRINCIPAL: [
    "eleves:*", "parents:*", "enseignants:*", "classes:*", "matieres:*",
    "notes:*", "evaluations:*", "bulletins:*", "absences:*", "examens:*",
    "curriculum:*", "cours:*", "emploi-du-temps:*",
    "cahier-journal:read", "cahier-journal:write",
    "communication:*", "messages:*", "vie-scolaire:*",
    "admissions:*", "rh:read", "finance:read", "inventaire:*", "alumni:*",
    "orientation:*", "analytics:*", "rapports:*", "documents:*",
    "ai:*", "parametres:read",
    "entrainement:read", "entrainement:valider",
    // Gouvernance, mentorat et tâches : pilotage de l'établissement.
    "gouvernance:*", "mentorat:*", "taches:*",
  ],

  // Secrétariat — administratif. Ni pédagogie fine, ni finance, ni paramètres.
  SECRETARY: [
    "eleves:*", "parents:*", "classes:read", "matieres:read",
    "absences:*", "emploi-du-temps:*",
    "communication:read", "communication:send", "messages:*",
    "admissions:*", "examens:read", "inventaire:read",
    "documents:*", "alumni:read", "bulletins:read", "rapports:read",
    "taches:*",
  ],

  // Enseignant — sa pédagogie, de bout en bout.
  //
  // `curriculum:write` lui est indispensable : c'est la permission exigée par
  // la banque de questions LEARNOS. Elle n'était accordée à personne, donc
  // aucun enseignant ni directeur ne pouvait créer une question.
  //
  // Côté entraînement il **suit** et **valide** ; il ne compose pas de séance
  // à la place d'un élève — `entrainement:write` résout l'élève depuis la
  // session, un adulte n'y a pas d'identité d'élève.
  TEACHER: [
    "eleves:read", "parents:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:read", "absences:write",
    "bulletins:read", "examens:read",
    "curriculum:read", "curriculum:write",
    "cahier-journal:read", "cahier-journal:write",
    "cours:*", "emploi-du-temps:read", "messages:*",
    "entrainement:read", "entrainement:valider",
    "analytics:read", "documents:read", "ai:teacher",
    // L'enseignant gère ses propres tâches.
    "taches:*",
  ],

  // Professeur principal — enseignant + bulletins, conseil de classe,
  // vie scolaire et orientation de sa classe.
  CLASS_TEACHER: [
    "eleves:read", "parents:read", "classes:read", "matieres:read",
    "notes:*", "evaluations:*", "absences:*",
    "bulletins:read", "bulletins:write", "bulletins:publish",
    "examens:read", "curriculum:read", "curriculum:write",
    "cahier-journal:read", "cahier-journal:write",
    "cours:*", "emploi-du-temps:read", "messages:*",
    "vie-scolaire:*", "orientation:read", "orientation:write",
    "entrainement:read", "entrainement:valider",
    "analytics:read", "documents:read", "ai:teacher",
    // Le prof principal suit ses élèves en mentorat et gère ses tâches.
    "mentorat:read", "mentorat:write", "taches:*",
  ],

  // Conseiller / CPE — vie scolaire et orientation.
  // `entrainement:read` : l'évolution d'un élève est un élément d'orientation.
  COUNSELOR: [
    "eleves:read", "parents:read", "absences:read", "bulletins:read",
    "vie-scolaire:*", "orientation:*", "entrainement:read",
    "messages:*", "communication:read", "analytics:read", "documents:read",
    "cahier-journal:read",
    // Le CPE suit ses élèves en mentorat et gère ses tâches.
    "mentorat:read", "mentorat:write", "taches:*",
  ],

  // Infirmier(e) — strictement la santé et l'assiduité.
  NURSE: [
    "eleves:read", "absences:read",
    "messages:read", "messages:write", "documents:read",
  ],

  // Comptable — finance, paie et stock.
  // Peut également créer des candidatures et faire évoluer les dossiers
  // d'inscription (ajout de documents, passage EN_COURS → COMPLETE),
  // mais seule la direction valide et finalise l'inscription.
  ACCOUNTANT: [
    "finance:*", "rh:*", "inventaire:*",
    "eleves:read", "parents:read",
    "admissions:read", "admissions:write",
    "analytics:read", "rapports:read", "messages:*", "documents:read",
    "taches:*",
  ],

  // Caissier — saisie des recettes (encaissements), remise de caisse.
  // Il enregistre les paiements et déclare les remises au comptable ou
  // au directeur. Il ne gère ni budgets ni dépenses.
  CAISSIER: [
    "finance:read", "finance:write",
    "eleves:read", "parents:read",
    "messages:*", "documents:read",
  ],

  // Surveillant — vie scolaire opérationnelle : appel, retards,
  // justificatifs, retenues, mouvements d'entrée et de sortie.
  // C'est le rôle qui débloque la tâche quotidienne qu'aucun rôle ne couvrait
  // auparavant : faire l'appel et traiter les justificatifs sans être
  // enseignant ou secrétaire.
  SUPERVISOR: [
    "eleves:read", "classes:read",
    "absences:*", "vie-scolaire:*",
    "messages:*", "communication:read",
    "examens:read", "emploi-du-temps:read",
    "documents:read", "analytics:read",
    "taches:*",
  ],

  // Coordinateur de matière — la maille intermédiaire entre l'enseignant
  // (ses classes) et la direction (tout l'établissement) : une matière à
  // travers toutes les classes et tous les enseignants.
  SUBJECT_LEAD: [
    "eleves:read", "parents:read", "classes:read", "matieres:read",
    "notes:read", "evaluations:read", "bulletins:read",
    "absences:read", "examens:read",
    "curriculum:read", "curriculum:write",
    "cahier-journal:read", "cahier-journal:write",
    "cours:read", "emploi-du-temps:read",
    "analytics:read", "rapports:read", "documents:read",
    "messages:*", "vie-scolaire:read",
    "entrainement:read", "entrainement:valider",
    "ai:teacher",
    "taches:*",
  ],

  // Responsable d'exploitation site — salles, équipement, personnel de service.
  // Pas d'accès aux données pédagogiques (notes, bulletins, évaluations).
  SITE_MANAGER: [
    "eleves:read", "classes:read", "matieres:read",
    "emploi-du-temps:read", "inventaire:*",
    "messages:*", "communication:read",
    "documents:read", "rapports:read",
    "taches:*",
  ],

  // Inspecteur MENFOP — lecture seule, statistiques agrégées.
  // Pas de données nominatives inutiles (pas de notes par élève, pas de messages).
  INSPECTOR: [
    "eleves:read", "classes:read", "matieres:read",
    "absences:read", "emploi-du-temps:read",
    "analytics:read", "rapports:read",
    "bulletins:read", "examens:read",
    "curriculum:read", "cours:read",
    "cahier-journal:read",
  ],

  // Parent / Tuteur — le périmètre de ses enfants, en lecture.
  //
  // `entrainement:read` lui ouvre l'évolution d'entraînement de son enfant :
  // progression par compétence, régularité, plans en cours. Le filtrage à
  // *ses* enfants est fait par `eleveScopeFilter`, pas par cette matrice.
  PARENT: [
    "bulletins:read", "absences:read", "notes:read",
    "messages:*", "communication:read",
    "cours:read", "orientation:read", "emploi-du-temps:read",
    "entrainement:read", "documents:read", "ai:parent",
  ],

  // Élève — son périmètre, en lecture, plus l'entraînement.
  //
  // Un élève peut lire et répondre dans une conversation où il est déjà
  // participant, mais ne peut pas en initier une (règle École360).
  //
  // `entrainement:write` est la seule écriture ouverte à un élève. Elle ne
  // touche ni note ni bulletin : elle alimente la couche d'analyse LEARNOS,
  // dont les preuves sont explicitement moins fiables que le travail surveillé.
  // `cours:read` et non `cours:*` — un élève consulte un cours, il n'en
  // crée ni n'en supprime.
  STUDENT: [
    "bulletins:read", "absences:read", "notes:read",
    "messages:read", "messages:reply",
    "communication:read", "cours:read", "emploi-du-temps:read",
    "entrainement:read", "entrainement:write", "documents:read",
  ],
};

// ============================================================
// 2. Vérification de permission
// ============================================================
export function roleHasPermission(role: RoleKey | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as RoleKey] ?? [];
  if (perms.includes("*")) return true;
  if (perms.includes(permission)) return true;
  const moduleName = permission.split(":")[0];
  return perms.includes(`${moduleName}:*`);
}

/** Vrai si le rôle satisfait au moins une des permissions demandées (OU logique). */
export function roleHasAnyPermission(
  role: RoleKey | string,
  permission: Permission | Permission[]
): boolean {
  const needed = Array.isArray(permission) ? permission : [permission];
  return needed.some((p) => roleHasPermission(role, p));
}

/** Toutes les permissions distinctes de la matrice, triées, pour l'UI d'override. */
export const ALL_PERMISSIONS: string[] = [
  ...new Set(
    Object.values(ROLE_PERMISSIONS).flat().filter((p) => p !== "*")
  ),
].sort();

// ============================================================
// 3. Registre des routes
// ============================================================
/**
 * Une entrée par écran du dashboard. Premier motif qui correspond = gagnant,
 * donc les sous-routes plus spécifiques passent **avant** leur parent
 * (`/notes/bulletins` avant `/notes`, `/parametres/audit` avant `/parametres`).
 *
 * Règle : ne jamais ancrer un motif avec `$` sauf si la page n'a réellement
 * aucune sous-route. Les motifs ancrés laissaient `/facturation/nouvelle` et
 * `/parametres/audit` totalement ouverts.
 */
export type RouteRule = {
  pattern: RegExp;
  /** Permission(s) requise(s) ; `null` = tout utilisateur authentifié. */
  permission: Permission | Permission[] | null;
  /** Restriction supplémentaire par rôle, pour les écrans personnels. */
  roles?: RoleKey[];
};

export const ROUTE_RULES: RouteRule[] = [
  // — Écrans ouverts à tout compte authentifié —
  { pattern: /^\/dashboard/, permission: null },
  { pattern: /^\/acces-bloque/, permission: null },
  { pattern: /^\/profil/, permission: null },
  { pattern: /^\/messages/, permission: "messages:read" },

  // — Plateforme —
  { pattern: /^\/super-admin/, permission: null, roles: ["SUPER_ADMIN"] },
  { pattern: /^\/test-telegram/, permission: null, roles: ["SUPER_ADMIN"] },
  { pattern: /^\/test-whatsapp/, permission: null, roles: ["SUPER_ADMIN"] },

  // — Espaces personnels : résolus par le lien relationnel du connecté —
  // Motifs ancrés : `/parent` non ancré capturerait `/parents`, l'annuaire
  // des familles, et le fermerait à la direction.
  { pattern: /^\/parent$/, permission: "notes:read", roles: ["PARENT"] },
  // Détail d'une facture, vu par un parent. Le rôle PARENT n'a pas
  // `finance:read` (la route `/facturation` lui est interdite) : cette route
  // dédiée vérifie le périmètre familial côté serveur (`eleveScopeFilter`).
  { pattern: /^\/parent\/factures\//, permission: "notes:read", roles: ["PARENT"] },
  { pattern: /^\/eleve$/, permission: "notes:read", roles: ["STUDENT"] },
  { pattern: /^\/entrainement/, permission: "entrainement:write", roles: ["STUDENT"] },
  // Emploi du temps en lecture pour les familles : l'éditeur `/emploi-du-temps`
  // est fermé aux familles (plus haut), mais elles possèdent
  // `emploi-du-temps:read` pour consulter l'horaire de leur enfant. Cette route
  // est la vue lecture seule dédiée — le filtrage par élève est fait côté page.
  { pattern: /^\/mon-emploi$/, permission: "emploi-du-temps:read", roles: ["PARENT", "STUDENT"] },

  // — Travail à faire (cahier de textes) —
  // Les élèves et parents consultent les devoirs ; les enseignants aussi.
  // La saisie se fait sur /devoirs (plus bas). Placé AVANT `/cours` pour ne
  // pas être capturé par sa règle.
  { pattern: /^\/travail/, permission: "cours:read", roles: ["STUDENT", "PARENT", "TEACHER", "CLASS_TEACHER"] },
  { pattern: /^\/ma-journee/, permission: "cours:read", roles: ["STUDENT"] },

  // — Saisie des devoirs (enseignants) —
  { pattern: /^\/devoirs/, permission: "notes:write", roles: ["TEACHER", "CLASS_TEACHER", "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"] },

  // — Couverture des cours (direction) —
  { pattern: /^\/couverture/, permission: "analytics:read", roles: ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"] },

  // — Documents imprimables, hors groupe (dashboard) —
  // Volontairement sans liste `roles` : `bulletins:read` suffit ici, et les
  // familles doivent pouvoir imprimer le bulletin de leur enfant. Le filtrage
  // au périmètre de *ses* enfants est fait par le scope, pas par cette règle.
  { pattern: /^\/bulletin/, permission: "bulletins:read" },

  // — Pilotage —
  // `analytics:read` seul ne suffit pas ici : un enseignant l'a pour ses
  // propres classes, alors que ces deux écrans agrègent tout l'établissement.
  { pattern: /^\/exploitation/, permission: "inventaire:read", roles: ["SITE_MANAGER", "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"] },
  { pattern: /^\/inspection/, permission: "analytics:read", roles: ["INSPECTOR", "SUPER_ADMIN", "TENANT_ADMIN"] },
  { pattern: /^\/direction/, permission: "analytics:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
  ] },
  { pattern: /^\/analytics/, permission: "analytics:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "INSPECTOR",
  ] },
  // Comparateur inter-sites / inter-années : direction et inspection.
  // L'API refuse la comparaison inter-sites si le rôle n'est pas tenant-wide.
  { pattern: /^\/comparateur/, permission: "analytics:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "INSPECTOR",
  ] },
  // Intelligence du directeur : indices composites, risque de décrochage,
  // simulation de remédiation, efficacité pédagogique, etc.
  { pattern: /^\/intelligence/, permission: "analytics:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "INSPECTOR",
  ] },
  // `mon-espace` est l'espace de l'enseignant : planning « ma semaine » et
  // grille élèves × compétences. La direction a `notes:*` qui débloque la
  // permission, mais n'est pas enseignant → planning et grille vides, KPIs
  // qui dupliquent `/direction`. On restreint aux rôles qui ont un service.
  { pattern: /^\/mon-espace/, permission: "notes:write", roles: [
    "TEACHER", "CLASS_TEACHER",
  ] },
  // Suivi pédagogique d'une classe : ni le comptable ni l'infirmerie,
  // qui ont `eleves:read` pour des raisons administratives.
  // `ma-classe` filtre les classes dont l'utilisateur est professeur
  // principal. Un TEACHER ou SUBJECT_LEAD n'est pas prof principal → page
  // vide. La direction n'a pas « sa » classe : elle supervise via `/direction`
  // et `/eleves`. Seul CLASS_TEACHER a un périmètre utile ici.
  { pattern: /^\/ma-classe/, permission: "eleves:read", roles: [
    "CLASS_TEACHER",
  ] },
  { pattern: /^\/rapports/, permission: "rapports:read" },

  // — Pédagogie —
  // `/eleves/comptes` expose la génération de comptes de connexion :
  // action d'écriture, pas simple lecture de l'annuaire. Placé AVANT
  // `/eleves` pour ne pas être capturé par sa règle `eleves:read`.
  { pattern: /^\/eleves\/comptes/, permission: "eleves:write", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY",
  ] },
  { pattern: /^\/eleves/, permission: "eleves:read" },
  { pattern: /^\/parents/, permission: "parents:read" },
  // `/notes/bulletins` reste **avant** `/notes` : c'est la console de
  // **génération, validation et publication** des bulletins — un outil du
  // personnel. Les familles consultent le bulletin de *leur* enfant via la
  // route imprimable `/bulletin/{eleveId}/{periodeId}` (règle ci-dessous),
  // qui reste ouverte et est scopée par `eleveScopeFilter` côté API.
  //
  // `bulletins:read` est possédé par PARENT et STUDENT (ils en ont besoin pour
  // la route imprimable), mais cet écran-ci charge toutes les classes et tous
  // les élèves du tenant avec nom/prénom/matricule : sans liste `roles`, il
  // exposait l'annuaire nominatif de l'établissement aux familles. Même
  // correctif que pour `/notes` : on restreint l'écran sans toucher à la
  // permission, sinon les familles perdraient aussi l'accès à la route
  // imprimable côté API.
  { pattern: /^\/notes\/bulletins/, permission: "bulletins:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER",
  ] },
  // `notes:read` ne suffit pas comme critère d'accès à cet écran : PARENT et
  // STUDENT possèdent cette permission — ils en ont besoin pour leur propre
  // espace (`/parent`, `/eleve`) et pour les routes API — mais `/notes` est
  // l'interface de **saisie** des notes du personnel. Une permission dit ce
  // qu'un rôle a le droit de lire, elle ne dit pas dans quel écran il devrait
  // le lire : d'où la liste `roles`, limitée à ceux dont c'est l'outil de
  // travail (direction + enseignants). SECRETARY, COUNSELOR, NURSE et
  // ACCOUNTANT n'ont de toute façon pas `notes:read`.
  { pattern: /^\/notes/, permission: "notes:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER",
  ] },
  { pattern: /^\/evaluations/, permission: "evaluations:read" },
  { pattern: /^\/examens/, permission: "examens:read" },
  { pattern: /^\/curriculum/, permission: "curriculum:read" },
  // Page enseignant : formuler les demandes de fournitures par niveau.
  // Page secrétariat (/fournitures) : compiler, valider, publier.
  { pattern: /^\/fournitures\/enseignant/, permission: "curriculum:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
  ] },
  { pattern: /^\/fournitures/, permission: "eleves:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY",
  ] },
  // Même raisonnement que `/notes` : `cours:read` est accordé à PARENT et
  // STUDENT pour qu'ils voient les supports depuis leur espace, mais `/cours`
  // est la console de **création et de publication** des cours. On restreint
  // l'écran sans toucher à la permission, sinon les familles perdraient aussi
  // l'accès aux données côté API.
  { pattern: /^\/cours/, permission: "cours:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER",
  ] },
  // `emploi-du-temps:read` est possédé par les familles (elles doivent pouvoir
  // consulter l'horaire de leur enfant), mais cet écran est l'éditeur de
  // grille horaire de l'établissement. SECRETARY le garde : elle a
  // `emploi-du-temps:*`, la construction des emplois du temps est son métier.
  // Les enseignants le gardent en lecture (`emploi-du-temps:read`) : c'est là
  // qu'ils consultent leur service, on ne leur retire pas un accès existant.
  { pattern: /^\/emploi-du-temps/, permission: "emploi-du-temps:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "TEACHER", "CLASS_TEACHER",
  ] },

  // — Vie scolaire —
  // `absences:read` appartient aussi aux familles (suivi de l'assiduité de
  // leur enfant), alors que `/absences` est l'écran d'**appel** et de
  // justification du personnel. La liste `roles` reprend tout le personnel qui
  // détient déjà `absences:read`, sans en retirer à personne :
  //   - SECRETARY : `absences:*`, elle saisit et justifie les absences ;
  //   - COUNSELOR : vie scolaire, l'assiduité est son dossier de suivi ;
  //   - NURSE : `absences:read` seulement, mais elle est du personnel et
  //     rapproche les absences des passages à l'infirmerie — on lui conserve
  //     donc l'accès qu'elle a aujourd'hui, par prudence.
  // ACCOUNTANT n'a pas la permission, il n'est pas concerné.
  { pattern: /^\/absences/, permission: "absences:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY",
    "TEACHER", "CLASS_TEACHER", "COUNSELOR", "NURSE", "SUPERVISOR",
  ] },
  { pattern: /^\/vie-scolaire/, permission: "vie-scolaire:read" },
  { pattern: /^\/orientation/, permission: "orientation:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "COUNSELOR", "CLASS_TEACHER",
  ] },

  // — Gestion —
  { pattern: /^\/admissions/, permission: "admissions:read" },
  { pattern: /^\/facturation/, permission: "finance:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "CAISSIER",
  ] },
  { pattern: /^\/rh/, permission: "rh:read" },
  { pattern: /^\/inventaire/, permission: "inventaire:read" },
  { pattern: /^\/alumni/, permission: "alumni:read" },

  // — Communication —
  // Console d'émission des annonces, pas la boîte de réception : elle exige
  // `communication:send`. Les familles reçoivent, elles ne diffusent pas.
  { pattern: /^\/communication/, permission: "communication:send" },

  // — Espaces dédiés par métier —
  // Chacun de ces écrans est l'accueil d'un rôle qui n'avait pas d'espace à
  // lui : la permission d'entrée est détenue par ce rôle (et par la direction,
  // qui supervise tout). La liste `roles` empêche un autre rôle ayant la même
  // permission par hasard d'y atterrir.
  { pattern: /^\/infirmerie/, permission: "eleves:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "NURSE",
  ] },
  { pattern: /^\/secretariat/, permission: "admissions:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY",
  ] },
  { pattern: /^\/comptabilite/, permission: "finance:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "CAISSIER",
  ] },
  // Caisse — saisie des recettes, remise de caisse (caissier), confirmation
  // de réception (comptable ou directeur).
  { pattern: /^\/caisse/, permission: "finance:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "ACCOUNTANT", "CAISSIER",
  ] },
  { pattern: /^\/conseiller/, permission: "vie-scolaire:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "COUNSELOR",
  ] },
  // `ma-matiere` résout l'enseignant par `userId` puis sa première matière.
  // La direction n'est pas enseignant → la page retourne « aucune classe ».
  // Seul le coordinateur de matière (SUBJECT_LEAD) y a un périmètre utile.
  { pattern: /^\/ma-matiere/, permission: "notes:read", roles: [
    "SUBJECT_LEAD",
  ] },

  // — Configuration —
  { pattern: /^\/parametres\/audit/, permission: "audit:read" },
  { pattern: /^\/parametres\/demandes-lien/, permission: "parametres:read" },
  { pattern: /^\/parametres/, permission: "parametres:read" },

  // — LEARNOS : IA générative —
  // Révision de la semaine : ouverte aux élèves (leur propre révision),
  // parents (révision de leur enfant), et personnel avec entrainement:read.
  { pattern: /^\/revision-semaine/, permission: "entrainement:read" },
  // Chatbot directeur d'analyse de données : réservé à la direction.
  // L'IA ne peut qu'appeler des outils fermés — jamais de SQL libre.
  { pattern: /^\/chatbot-direction/, permission: "ai:*", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
  ] },
  // Propositions IA à valider (plans de leçon + rubriques) :
  //   - enseignants peuvent voir et ajuster (curriculum:write)
  //   - direction peut valider (ai:*)
  { pattern: /^\/propositions-ia/, permission: "curriculum:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
  ] },
  // Génération de plans de leçon : enseignants et direction.
  { pattern: /^\/plans-lecon/, permission: "curriculum:write", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
  ] },
  // Génération de rubriques d'évaluation : enseignants et direction.
  { pattern: /^\/rubriques-evaluation/, permission: "curriculum:write", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
  ] },

  // — Cahier journal —
  // Outil central de l'enseignant : saisie des séances, suivi du programme.
  // La direction a `cahier-journal:read` pour superviser, les enseignants
  // ont `cahier-journal:write` pour saisir. Le CPE et l'inspecteur consultent.
  { pattern: /^\/cahier-journal/, permission: "cahier-journal:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
    "COUNSELOR", "INSPECTOR", "SUPERVISOR",
  ] },

  // — Gouvernance —
  // Conseils d'établissement, réunions, résolutions : direction uniquement.
  { pattern: /^\/gouvernance/, permission: "gouvernance:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
  ] },

  // — Mentorat —
  // Suivi individualisé des élèves : direction, prof principal, CPE.
  { pattern: /^\/mentorat/, permission: "mentorat:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "CLASS_TEACHER", "COUNSELOR",
  ] },

  // — Conseil de classe augmenté —
  // Vue enrichie du conseil de classe avec signaux LEARNOS.
  // Mêmes rôles que `/notes/bulletins` : direction + enseignants.
  { pattern: /^\/conseil-augmente/, permission: "bulletins:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "TEACHER", "CLASS_TEACHER",
  ] },

  // — Tâches —
  // Gestion de tâches interne : ouvert à tout le personnel authentifié.
  // Le filtrage par assignation est fait côté page/API, pas par rôle.
  { pattern: /^\/taches/, permission: "taches:read" },

  // — Veille assiduité —
  // Surveillance prédictive de l'assiduité : direction, CPE, surveillant.
  { pattern: /^\/veille-assiduite/, permission: "absences:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "COUNSELOR", "SUPERVISOR",
  ] },

  // — Dossier de progression LEARNOS —
  // Vue longitudinale d'un élève : accessible au personnel pédagogique
  // qui a déjà accès à la fiche élève. Le filtrage par périmètre
  // (site, classe) est fait côté page.
  { pattern: /^\/dossier-progression/, permission: "eleves:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "TEACHER", "CLASS_TEACHER", "COUNSELOR",
  ] },

  // — Recommandations LEARNOS —
  // Propositions de prérequis et plans de remédiation générés par l'IA,
  // à valider par les enseignants et la direction.
  { pattern: /^\/recommandations/, permission: "curriculum:read", roles: [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL",
    "TEACHER", "CLASS_TEACHER", "SUBJECT_LEAD",
    "COUNSELOR", "INSPECTOR",
  ] },
];

export function findRouteRule(pathname: string): RouteRule | null {
  for (const rule of ROUTE_RULES) {
    if (rule.pattern.test(pathname)) return rule;
  }
  return null;
}

/**
 * Le rôle peut-il ouvrir cette route ?
 *
 * Utilisée par le middleware (blocage), `guardPage` (blocage serveur) et la
 * Sidebar (affichage). Un menu qui montre un lien menant à une redirection
 * est un bug d'interface ; les faire dériver de la même fonction l'élimine
 * par construction.
 *
 * Une route absente du registre est **refusée** : ajouter une page sans
 * déclarer sa règle ne doit pas l'ouvrir à tout le monde par défaut.
 */
export function canAccessRoute(role: RoleKey | string, pathname: string): boolean {
  const rule = findRouteRule(pathname);
  if (!rule) return false;
  if (rule.roles && !rule.roles.includes(role as RoleKey)) return false;
  if (rule.permission === null) return true;
  return roleHasAnyPermission(role, rule.permission);
}
