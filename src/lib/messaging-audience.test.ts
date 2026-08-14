import { describe, it, expect } from "vitest";
import {
  allowedGroups,
  allowedScopeKinds,
  canTarget,
  deriveConversationType,
  type AudienceSelector,
} from "@/lib/messaging-audience";
import { mergeFilters } from "@/lib/site-scope";
import type { Role } from "@prisma/client";

/**
 * La matrice d'autorisation du ciblage est la barrière qui empêche un
 * enseignant de diffuser à tout l'établissement, ou un parent de diffuser
 * tout court. Ces tests doivent rester rouges si la matrice s'élargit par
 * inadvertance.
 */

const target = (
  scope: AudienceSelector["scope"],
  group: AudienceSelector["group"]
): AudienceSelector => ({ scope, group });

describe("allowedScopeKinds", () => {
  it("réserve la portée « tout l'établissement » à la direction générale", () => {
    expect(allowedScopeKinds("TENANT_ADMIN")).toContain("TENANT");
    expect(allowedScopeKinds("SUPER_ADMIN")).toContain("TENANT");

    // Un chef d'établissement pilote son site, pas le groupe scolaire.
    expect(allowedScopeKinds("PRINCIPAL")).not.toContain("TENANT");
    expect(allowedScopeKinds("SECRETARY")).not.toContain("TENANT");
    expect(allowedScopeKinds("TEACHER")).not.toContain("TENANT");
  });

  it("limite l'enseignant à la classe", () => {
    expect(allowedScopeKinds("TEACHER")).toEqual(["CLASSE"]);
    expect(allowedScopeKinds("CLASS_TEACHER")).toEqual(["CLASSE"]);
  });

  it("interdit toute diffusion aux élèves et aux rôles support", () => {
    const sansDiffusion: Role[] = ["STUDENT", "NURSE", "ACCOUNTANT"];
    for (const role of sansDiffusion) {
      expect(allowedScopeKinds(role)).toEqual([]);
      expect(allowedGroups(role)).toEqual([]);
    }
  });

  // Un parent peut écrire aux autres parents des classes de ses enfants —
  // et à rien d'autre. La restriction aux classes de ses enfants est
  // appliquée en base par `parentClasseFilter`.
  it("limite le parent à la classe, et au seul public des parents", () => {
    expect(allowedScopeKinds("PARENT")).toEqual(["CLASSE"]);
    expect(allowedGroups("PARENT")).toEqual(["PARENTS"]);
  });
});

describe("canTarget", () => {
  it("laisse un enseignant écrire aux parents de sa classe", () => {
    expect(canTarget("TEACHER", target({ kind: "CLASSE", id: "c1" }, "PARENTS"))).toBe(true);
  });

  it("empêche un enseignant de viser un niveau ou un site entier", () => {
    expect(canTarget("TEACHER", target({ kind: "NIVEAU", value: "6e" }, "PARENTS"))).toBe(false);
    expect(canTarget("TEACHER", target({ kind: "SITE", id: "s1" }, "PARENTS"))).toBe(false);
    expect(canTarget("TEACHER", target({ kind: "TENANT" }, "ALL"))).toBe(false);
  });

  it("empêche un enseignant de viser le personnel ou la direction en masse", () => {
    expect(canTarget("TEACHER", target({ kind: "CLASSE", id: "c1" }, "DIRECTION"))).toBe(false);
    expect(canTarget("TEACHER", target({ kind: "CLASSE", id: "c1" }, "PERSONNEL"))).toBe(false);
  });

  it("laisse un parent écrire aux parents d'une classe, et rien de plus", () => {
    expect(canTarget("PARENT", target({ kind: "CLASSE", id: "c1" }, "PARENTS"))).toBe(true);
    // Ni les élèves, ni les enseignants, ni le personnel.
    expect(canTarget("PARENT", target({ kind: "CLASSE", id: "c1" }, "ELEVES"))).toBe(false);
    expect(canTarget("PARENT", target({ kind: "CLASSE", id: "c1" }, "ENSEIGNANTS"))).toBe(false);
    expect(canTarget("PARENT", target({ kind: "CLASSE", id: "c1" }, "ALL"))).toBe(false);
    // Et jamais au-delà de la classe.
    expect(canTarget("PARENT", target({ kind: "TENANT" }, "PARENTS"))).toBe(false);
    expect(canTarget("PARENT", target({ kind: "SITE", id: "s1" }, "PARENTS"))).toBe(false);
    expect(canTarget("PARENT", target({ kind: "NIVEAU", value: "6e" }, "PARENTS"))).toBe(false);
  });

  it("autorise la direction générale sur toute la combinatoire", () => {
    expect(canTarget("TENANT_ADMIN", target({ kind: "TENANT" }, "ALL"))).toBe(true);
    expect(canTarget("TENANT_ADMIN", target({ kind: "SITE", id: "s1" }, "ENSEIGNANTS"))).toBe(true);
    expect(canTarget("TENANT_ADMIN", target({ kind: "NIVEAU", value: "CM2" }, "PARENTS"))).toBe(true);
  });
});

describe("restriction de périmètre — résistance à l'écrasement", () => {
  // Régression : `parentClasseFilter` renvoyait `{ id: { in: [...] } }`, une
  // clé de premier niveau. `mergeFilters` ne concatène que `AND` et écrase
  // tout le reste : le `{ id: scope.id }` de la portée CLASSE effaçait donc
  // la restriction, et un parent pouvait cibler n'importe quelle classe en
  // passant son identifiant. Encapsuler dans `AND` rend le filtre inviolable.
  it("préserve une restriction encapsulée dans AND face à une clé homonyme", () => {
    const restriction = { AND: [{ id: { in: ["classe-de-mon-enfant"] } }] };
    const portee = { id: "classe-d-un-autre" };

    const fusion = mergeFilters({ tenantId: "t1" }, restriction, portee);

    expect(fusion.AND).toEqual([{ id: { in: ["classe-de-mon-enfant"] } }]);
    expect(fusion.id).toBe("classe-d-un-autre");
  });

  it("montre qu'une clé de premier niveau serait, elle, effacée", () => {
    const restrictionFragile = { id: { in: ["classe-de-mon-enfant"] } };
    const portee = { id: "classe-d-un-autre" };

    const fusion = mergeFilters({ tenantId: "t1" }, restrictionFragile, portee);

    // Plus aucune trace de la restriction : c'était la faille.
    expect(fusion.id).toBe("classe-d-un-autre");
    expect(fusion.AND).toBeUndefined();
  });
});

describe("deriveConversationType", () => {
  it("traduit une annonce de classe et une annonce générale", () => {
    expect(deriveConversationType("ANNONCE", target({ kind: "CLASSE", id: "c1" }, "PARENTS"), 0))
      .toBe("CLASS_ANNOUNCEMENT");
    expect(deriveConversationType("ANNONCE", target({ kind: "TENANT" }, "ALL"), 0))
      .toBe("ADMIN_BROADCAST");
    expect(deriveConversationType("ANNONCE", target({ kind: "SITE", id: "s1" }, "PARENTS"), 0))
      .toBe("ADMIN_BROADCAST");
  });

  it("distingue un tête-à-tête d'un groupe de personnes nommées", () => {
    expect(deriveConversationType("MESSAGE", null, 1)).toBe("DIRECT");
    expect(deriveConversationType("MESSAGE", null, 3)).toBe("FREE");
  });

  it("route une discussion de classe et un groupe de personnel", () => {
    expect(deriveConversationType("GROUPE", target({ kind: "CLASSE", id: "c1" }, "ALL"), 0))
      .toBe("CLASS_DISCUSSION");
    expect(deriveConversationType("GROUPE", target({ kind: "SITE", id: "s1" }, "ENSEIGNANTS"), 0))
      .toBe("STAFF_GROUP");
    expect(deriveConversationType("MESSAGE", target({ kind: "SITE", id: "s1" }, "DIRECTION"), 0))
      .toBe("STAFF_GROUP");
  });

  it("ne produit jamais un type d'annonce pour une intention de message", () => {
    const types = (["CLASSE", "SITE", "TENANT"] as const).map((kind) =>
      deriveConversationType(
        "MESSAGE",
        target(kind === "CLASSE" ? { kind, id: "c" } : kind === "SITE" ? { kind, id: "s" } : { kind }, "PARENTS"),
        0
      )
    );
    expect(types).not.toContain("CLASS_ANNOUNCEMENT");
    expect(types).not.toContain("ADMIN_BROADCAST");
  });
});
