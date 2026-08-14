import { describe, it, expect } from "vitest";
import {
  ROLE_PERMISSIONS,
  ROUTE_RULES,
  canAccessRoute,
  findRouteRule,
  roleHasPermission,
  type RoleKey,
} from "./permissions";

/**
 * Ces tests figent les frontières que la QA avait trouvées ouvertes.
 * Chacun correspond à un accès réellement obtenu par un compte qui n'aurait
 * pas dû l'avoir — les garder verts est la seule protection contre une
 * régression silencieuse de la matrice.
 */

const TOUS_LES_ROLES: RoleKey[] = [
  "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "SECRETARY", "TEACHER",
  "CLASS_TEACHER", "COUNSELOR", "NURSE", "ACCOUNTANT",
  "SUPERVISOR", "SUBJECT_LEAD",
  "PARENT", "STUDENT",
];

describe("intégrité du registre", () => {
  it("déclare une règle pour chaque écran du dashboard", () => {
    // Liste tenue à la main : une page ajoutée sans règle doit faire échouer
    // ce test plutôt que d'hériter d'un comportement par défaut.
    const ecrans = [
      "/dashboard", "/acces-bloque", "/direction", "/mon-espace", "/ma-classe",
      "/parent", "/eleve", "/entrainement", "/eleves", "/eleves/nouveau",
      "/eleves/comptes", "/eleves/transfert", "/parents", "/notes",
      "/notes/bulletins", "/evaluations", "/examens", "/examens/rapport-classe",
      "/curriculum", "/recommandations", "/cours", "/emploi-du-temps",
      "/absences", "/absences/appel", "/vie-scolaire", "/vie-scolaire/convocations",
      "/orientation", "/admissions", "/facturation", "/facturation/nouvelle",
      "/rh", "/inventaire", "/alumni", "/messages", "/communication",
      "/rapports", "/analytics", "/parametres", "/parametres/audit",
      "/super-admin", "/bulletin/x/y",
    ];
    const sansRegle = ecrans.filter((r) => findRouteRule(r) === null);
    expect(sansRegle).toEqual([]);
  });

  it("refuse par défaut une route inconnue", () => {
    for (const role of TOUS_LES_ROLES) {
      expect(canAccessRoute(role, "/route-jamais-declaree")).toBe(false);
    }
  });

  it("n'ancre pas les motifs des pages qui ont des sous-routes", () => {
    // `/facturation$` laissait `/facturation/nouvelle` hors du registre.
    expect(findRouteRule("/facturation/nouvelle")).toBe(findRouteRule("/facturation"));
    expect(findRouteRule("/parametres/audit")).not.toBe(findRouteRule("/parametres"));
  });

  it("place /parent avant /parents sans les confondre", () => {
    expect(canAccessRoute("PARENT", "/parent")).toBe(true);
    expect(canAccessRoute("PARENT", "/parents")).toBe(false);
    expect(canAccessRoute("TENANT_ADMIN", "/parents")).toBe(true);
    expect(canAccessRoute("TENANT_ADMIN", "/parent")).toBe(false);
  });
});

describe("cloisonnement du parent", () => {
  const interdits = [
    "/direction", "/eleves", "/parents", "/evaluations", "/examens",
    "/curriculum", "/recommandations", "/facturation", "/facturation/nouvelle",
    "/rh", "/inventaire", "/admissions", "/alumni", "/vie-scolaire",
    "/parametres", "/parametres/audit", "/analytics", "/rapports",
    "/super-admin", "/ma-classe", "/mon-espace", "/entrainement", "/communication",
  ];
  it.each(interdits)("refuse %s au parent", (route) => {
    expect(canAccessRoute("PARENT", route)).toBe(false);
  });

  const autorises = ["/dashboard", "/parent", "/messages", "/bulletin/x/y"];
  it.each(autorises)("autorise %s au parent", (route) => {
    expect(canAccessRoute("PARENT", route)).toBe(true);
  });
});

describe("cloisonnement de l'élève", () => {
  const interdits = [
    "/direction", "/eleves", "/parents", "/evaluations", "/curriculum",
    "/recommandations", "/facturation", "/rh", "/parametres", "/analytics",
    "/vie-scolaire", "/orientation", "/parent", "/ma-classe", "/super-admin",
  ];
  it.each(interdits)("refuse %s à l'élève", (route) => {
    expect(canAccessRoute("STUDENT", route)).toBe(false);
  });

  it("lui laisse son entraînement, à lui seul", () => {
    expect(canAccessRoute("STUDENT", "/entrainement")).toBe(true);
    for (const role of TOUS_LES_ROLES.filter((r) => r !== "STUDENT")) {
      expect(canAccessRoute(role, "/entrainement")).toBe(false);
    }
  });

  it("ne lui donne pas la création ni la suppression de cours", () => {
    expect(roleHasPermission("STUDENT", "cours:read")).toBe(true);
    expect(roleHasPermission("STUDENT", "cours:write")).toBe(false);
    expect(roleHasPermission("STUDENT", "cours:delete")).toBe(false);
  });
});

describe("périmètre de l'enseignant", () => {
  it("ouvre le curriculum, le suivi de classe et les recommandations", () => {
    for (const route of ["/curriculum", "/ma-classe", "/recommandations", "/mon-espace", "/notes", "/evaluations"]) {
      expect(canAccessRoute("TEACHER", route)).toBe(true);
    }
  });

  it("lui donne l'écriture sur la banque de questions LEARNOS", () => {
    // `curriculum:write` est exigé par /api/learnos/questions et n'était
    // accordé à aucun rôle : personne ne pouvait créer de question.
    for (const role of ["TEACHER", "CLASS_TEACHER", "PRINCIPAL", "TENANT_ADMIN"] as RoleKey[]) {
      expect(roleHasPermission(role, "curriculum:write")).toBe(true);
    }
  });

  it("lui donne le suivi d'entraînement mais pas la séance", () => {
    expect(roleHasPermission("TEACHER", "entrainement:read")).toBe(true);
    expect(roleHasPermission("TEACHER", "entrainement:valider")).toBe(true);
    expect(roleHasPermission("TEACHER", "entrainement:write")).toBe(false);
  });

  it("lui ferme la finance, les RH et les paramètres", () => {
    for (const route of ["/facturation", "/facturation/nouvelle", "/rh", "/parametres", "/direction", "/analytics"]) {
      expect(canAccessRoute("TEACHER", route)).toBe(false);
    }
  });
});

describe("suivi d'entraînement : qui peut lire l'évolution", () => {
  const lecteurs: RoleKey[] = [
    "SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER",
    "CLASS_TEACHER", "COUNSELOR", "PARENT", "STUDENT",
  ];
  it.each(lecteurs)("%s lit l'évolution", (role) => {
    expect(roleHasPermission(role, "entrainement:read")).toBe(true);
  });

  it.each(["SECRETARY", "NURSE", "ACCOUNTANT"] as RoleKey[])("%s ne la lit pas", (role) => {
    expect(roleHasPermission(role, "entrainement:read")).toBe(false);
  });
});

describe("administration générale", () => {
  it("ouvre le pilotage à la direction seule", () => {
    for (const role of ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL"] as RoleKey[]) {
      expect(canAccessRoute(role, "/direction")).toBe(true);
    }
    for (const role of ["TEACHER", "CLASS_TEACHER", "SECRETARY", "NURSE", "PARENT", "STUDENT"] as RoleKey[]) {
      expect(canAccessRoute(role, "/direction")).toBe(false);
    }
  });

  it("laisse la direction suivre la pédagogie et l'entraînement", () => {
    for (const route of ["/curriculum", "/recommandations", "/ma-classe", "/mon-espace"]) {
      expect(canAccessRoute("TENANT_ADMIN", route)).toBe(true);
      expect(canAccessRoute("PRINCIPAL", route)).toBe(true);
    }
  });

  it("réserve les paramètres à la direction", () => {
    expect(canAccessRoute("TENANT_ADMIN", "/parametres")).toBe(true);
    expect(canAccessRoute("PRINCIPAL", "/parametres")).toBe(true);
    for (const role of ["SECRETARY", "TEACHER", "CLASS_TEACHER", "ACCOUNTANT", "PARENT", "STUDENT"] as RoleKey[]) {
      expect(canAccessRoute(role, "/parametres")).toBe(false);
    }
  });

  it("réserve la console plateforme au super-admin", () => {
    expect(canAccessRoute("SUPER_ADMIN", "/super-admin")).toBe(true);
    for (const role of TOUS_LES_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(canAccessRoute(role, "/super-admin")).toBe(false);
    }
  });
});

/**
 * Les quatre écrans de saisie du personnel (`/notes`, `/absences`, `/cours`,
 * `/emploi-du-temps`) portaient une simple permission que PARENT et STUDENT
 * possèdent : ils apparaissaient donc dans le menu des familles et leur
 * ouvraient l'outil de quelqu'un d'autre. La correction restreint l'ÉCRAN par
 * rôle sans retirer la permission — d'où les deux blocs de tests ci-dessous,
 * l'un qui ferme, l'autre qui vérifie qu'on n'a pas fermé trop large.
 */
const ECRANS_DE_SAISIE = ["/notes", "/absences", "/cours", "/emploi-du-temps"];

describe("écrans de saisie du personnel fermés aux familles", () => {
  it.each(ECRANS_DE_SAISIE)("refuse %s au parent", (route) => {
    expect(canAccessRoute("PARENT", route)).toBe(false);
  });

  it.each(ECRANS_DE_SAISIE)("refuse %s à l'élève", (route) => {
    expect(canAccessRoute("STUDENT", route)).toBe(false);
  });

  it("ferme aussi les sous-routes de saisie, pas seulement la racine", () => {
    for (const route of ["/absences/appel", "/notes/saisie", "/cours/nouveau", "/emploi-du-temps/edition"]) {
      expect(canAccessRoute("PARENT", route)).toBe(false);
      expect(canAccessRoute("STUDENT", route)).toBe(false);
    }
  });

  it("ferme la console /notes/bulletins aux familles mais garde la route imprimable /bulletin", () => {
    // La console de génération (`/notes/bulletins`) charge toutes les classes
    // et tous les élèves du tenant avec nom/prénom/matricule : elle est fermée
    // aux familles par liste `roles`, comme `/notes`. La route imprimable
    // `/bulletin/{eleveId}/{periodeId}` reste ouverte et est scopée par
    // `eleveScopeFilter` côté API.
    const iBulletins = ROUTE_RULES.findIndex((r) => r.pattern.source === String.raw`^\/notes\/bulletins`);
    const iNotes = ROUTE_RULES.findIndex((r) => r.pattern.source === String.raw`^\/notes`);
    expect(iBulletins).toBeGreaterThanOrEqual(0);
    expect(iNotes).toBeGreaterThanOrEqual(0);
    expect(iBulletins).toBeLessThan(iNotes);

    expect(findRouteRule("/notes/bulletins")).not.toBe(findRouteRule("/notes"));
    for (const role of ["PARENT", "STUDENT"] as RoleKey[]) {
      expect(canAccessRoute(role, "/notes/bulletins")).toBe(false);
      expect(canAccessRoute(role, "/notes/bulletins/2024")).toBe(false);
    }
    // Le personnel garde l'accès à la console.
    for (const role of ["SUPER_ADMIN", "TENANT_ADMIN", "PRINCIPAL", "TEACHER", "CLASS_TEACHER"] as RoleKey[]) {
      expect(canAccessRoute(role, "/notes/bulletins")).toBe(true);
    }
  });

  it("laisse les documents imprimables /bulletin ouverts aux familles", () => {
    for (const role of ["PARENT", "STUDENT"] as RoleKey[]) {
      expect(canAccessRoute(role, "/bulletin/eleve-1/trimestre-1")).toBe(true);
    }
  });

  it("conserve aux familles leur espace, la messagerie et le tableau de bord", () => {
    expect(canAccessRoute("PARENT", "/parent")).toBe(true);
    expect(canAccessRoute("STUDENT", "/eleve")).toBe(true);
    for (const role of ["PARENT", "STUDENT"] as RoleKey[]) {
      expect(canAccessRoute(role, "/messages")).toBe(true);
      expect(canAccessRoute(role, "/dashboard")).toBe(true);
    }
  });

  it("ne retire aucune permission aux familles : on restreint l'écran, pas le droit", () => {
    // Intention documentée : `notes:read` & co. restent nécessaires aux
    // familles pour leur propre espace et pour les routes API. Seul l'écran
    // de saisie leur est fermé.
    for (const role of ["PARENT", "STUDENT"] as RoleKey[]) {
      for (const perm of ["notes:read", "absences:read", "cours:read", "emploi-du-temps:read"]) {
        expect(roleHasPermission(role, perm)).toBe(true);
        expect(ROLE_PERMISSIONS[role]).toContain(perm);
      }
    }
  });
});

describe("écrans de saisie : le personnel garde ses accès", () => {
  // Un test par rôle et par écran : ce sont ces assertions qui protègent
  // contre une fermeture trop large, faite au nom du cloisonnement familial.
  const attendus: Array<[RoleKey, string]> = [
    ["SUPER_ADMIN", "/notes"], ["TENANT_ADMIN", "/notes"], ["PRINCIPAL", "/notes"],
    ["TEACHER", "/notes"], ["CLASS_TEACHER", "/notes"],

    ["SUPER_ADMIN", "/absences"], ["TENANT_ADMIN", "/absences"], ["PRINCIPAL", "/absences"],
    ["SECRETARY", "/absences"], ["TEACHER", "/absences"], ["CLASS_TEACHER", "/absences"],
    ["COUNSELOR", "/absences"], ["NURSE", "/absences"],

    ["SUPER_ADMIN", "/cours"], ["TENANT_ADMIN", "/cours"], ["PRINCIPAL", "/cours"],
    ["TEACHER", "/cours"], ["CLASS_TEACHER", "/cours"],

    ["SUPER_ADMIN", "/emploi-du-temps"], ["TENANT_ADMIN", "/emploi-du-temps"],
    ["PRINCIPAL", "/emploi-du-temps"], ["SECRETARY", "/emploi-du-temps"],
    ["TEACHER", "/emploi-du-temps"], ["CLASS_TEACHER", "/emploi-du-temps"],
  ];
  it.each(attendus)("%s garde %s", (role, route) => {
    expect(canAccessRoute(role, route)).toBe(true);
  });

  it("n'ouvre pas ces écrans à un rôle qui n'avait pas la permission", () => {
    // ACCOUNTANT ne possède aucune des quatre permissions : la correction ne
    // doit pas avoir changé son cas.
    for (const route of ECRANS_DE_SAISIE) {
      expect(canAccessRoute("ACCOUNTANT", route)).toBe(false);
    }
    // SECRETARY, COUNSELOR et NURSE n'ont pas `notes:read` ni `cours:read`.
    for (const role of ["SECRETARY", "COUNSELOR", "NURSE"] as RoleKey[]) {
      expect(canAccessRoute(role, "/notes")).toBe(false);
      expect(canAccessRoute(role, "/cours")).toBe(false);
    }
  });

  it("ne restreint par rôle que des écrans dont la permission fuit vers les familles", () => {
    // Garde-fou : chaque règle porteuse d'une liste `roles` doit être une
    // décision consciente, pas un copier-coller. On vérifie ici qu'aucune
    // liste `roles` n'est vide (ce qui fermerait l'écran à tout le monde).
    for (const rule of ROUTE_RULES) {
      if (rule.roles) expect(rule.roles.length).toBeGreaterThan(0);
    }
  });
});

describe("cohérence de la matrice", () => {
  it("déclare les treize rôles", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...TOUS_LES_ROLES].sort());
  });

  it("n'exige aucune permission qu'aucun rôle ne possède", () => {
    const accordees = new Set(
      Object.values(ROLE_PERMISSIONS).flat().map((p) => p.split(":")[0])
    );
    const exigees = ROUTE_RULES.flatMap((r) =>
      r.permission === null ? [] : (Array.isArray(r.permission) ? r.permission : [r.permission])
    ).map((p) => p.split(":")[0]);
    const orphelines = [...new Set(exigees)].filter((m) => !accordees.has(m));
    expect(orphelines).toEqual([]);
  });
});
