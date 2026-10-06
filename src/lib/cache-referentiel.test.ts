import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  referentiel,
  invaliderReferentiel,
  famillesAInvalider,
  TTL_REFERENTIEL_MS,
} from "@/lib/cache-referentiel";

/**
 * Le cache est neutralisé sous test (`NODE_ENV=test`) pour ne pas partager de
 * données simulées entre deux cas. On le réactive ici, le temps de le vérifier.
 */
describe("cache des données de référence", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    invaliderReferentiel("annees");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("ne charge qu'une fois une même clé, même en lectures simultanées", async () => {
    const charger = vi.fn(async () => ["2025-2026"]);

    const [a, b] = await Promise.all([
      referentiel("annees", "tenant-1", charger),
      referentiel("annees", "tenant-1", charger),
    ]);
    const c = await referentiel("annees", "tenant-1", charger);

    expect(charger).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(c).toBe(a);
  });

  it("sépare les clés : un tenant ne reçoit jamais la valeur d'un autre", async () => {
    const un = await referentiel("annees", "tenant-1", async () => "A");
    const deux = await referentiel("annees", "tenant-2", async () => "B");

    expect(un).toBe("A");
    expect(deux).toBe("B");
  });

  it("recharge après expiration", async () => {
    const charger = vi.fn(async () => "v");

    await referentiel("annees", "tenant-1", charger);
    vi.advanceTimersByTime(TTL_REFERENTIEL_MS + 1);
    await referentiel("annees", "tenant-1", charger);

    expect(charger).toHaveBeenCalledTimes(2);
  });

  it("recharge après invalidation de la famille", async () => {
    const charger = vi.fn(async () => "v");

    await referentiel("annees", "tenant-1", charger);
    invaliderReferentiel("annees");
    await referentiel("annees", "tenant-1", charger);

    expect(charger).toHaveBeenCalledTimes(2);
  });

  it("ne garde pas une erreur en cache", async () => {
    const charger = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("base injoignable"))
      .mockResolvedValueOnce("v");

    await expect(referentiel("annees", "tenant-1", charger)).rejects.toThrow("base injoignable");
    await expect(referentiel("annees", "tenant-1", charger)).resolves.toBe("v");
  });
});

describe("famillesAInvalider", () => {
  it("vide la famille d'un modèle de référence à l'écriture", () => {
    expect(famillesAInvalider("AnneesScolaires", "update")).toEqual(["annees"]);
    expect(famillesAInvalider("UserPermission", "upsert")).toEqual(["permissions"]);
    expect(famillesAInvalider("UserSite", "deleteMany")).toEqual(["sites"]);
    expect(famillesAInvalider("Eleve", "update")).toEqual(["blocage-financier"]);
  });

  it("ignore les lectures et les modèles hors référentiel", () => {
    expect(famillesAInvalider("AnneesScolaires", "findMany")).toBeNull();
    expect(famillesAInvalider("Note", "create")).toBeNull();
    expect(famillesAInvalider(undefined, "update")).toBeNull();
  });
});
