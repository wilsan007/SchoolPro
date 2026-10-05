import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: vi.fn() } }));

import { formatNumeroFacture, reserverNumeroFacture, reserverNumerosFacture } from "./numerotation";

const client = (premier: unknown) => ({ $queryRaw: vi.fn(async () => [{ premier }]) });

describe("numérotation des factures", () => {
  it("formate sur cinq chiffres, sans tronquer au-delà", () => {
    expect(formatNumeroFacture(2026, 7)).toBe("FAC-2026-00007");
    expect(formatNumeroFacture("2026", 20125)).toBe("FAC-2026-20125");
    expect(formatNumeroFacture(2026, 123456)).toBe("FAC-2026-123456");
  });

  it("réserve un bloc en UN appel à la base et en déduit des numéros consécutifs", async () => {
    const c = client(20125);
    expect(await reserverNumerosFacture("t1", 2026, 3, c as never)).toEqual([
      "FAC-2026-20125", "FAC-2026-20126", "FAC-2026-20127",
    ]);
    expect(c.$queryRaw).toHaveBeenCalledTimes(1);
    // Le tenant, le préfixe et le nombre partent en paramètres liés.
    expect((c.$queryRaw.mock.calls[0] as unknown[]).slice(1)).toEqual(["t1", "2026", 3]);
  });

  it("ne touche pas à la base pour un bloc vide", async () => {
    const c = client(1);
    expect(await reserverNumerosFacture("t1", 2026, 0, c as never)).toEqual([]);
    expect(c.$queryRaw).not.toHaveBeenCalled();
  });

  it("échoue plutôt que d'inventer un numéro si la base ne répond pas un entier", async () => {
    await expect(reserverNumeroFacture("t1", 2026, client(null) as never)).rejects.toThrow(/indisponible/);
    await expect(reserverNumeroFacture("t1", 2026, client(0) as never)).rejects.toThrow(/indisponible/);
  });
});
