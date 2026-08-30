import { describe, it, expect } from "vitest";
import {
  getGridConfig,
  computeEndTime,
  getValidStartSlots,
  isFineGridType,
  timeToMinutes,
  minutesToTime,
  MAX_MINUTES_PAR_JOUR,
  DEBUT_MIN,
  FIN_MIN,
} from "@/lib/grid-config";

describe("grid-config", () => {
  describe("isFineGridType", () => {
    it("renvoie true pour MATERNELLE et PRIMAIRE", () => {
      expect(isFineGridType("MATERNELLE")).toBe(true);
      expect(isFineGridType("PRIMAIRE")).toBe(true);
    });

    it("renvoie false pour COLLEGE, LYCEE", () => {
      expect(isFineGridType("COLLEGE")).toBe(false);
      expect(isFineGridType("LYCEE")).toBe(false);
    });

    it("renvoie false pour null/undefined/inconnu (fail-safe standard)", () => {
      expect(isFineGridType(null)).toBe(false);
      expect(isFineGridType(undefined)).toBe(false);
      expect(isFineGridType("INCONNU")).toBe(false);
    });
  });

  describe("getGridConfig", () => {
    it("grille fine pour MATERNELLE/PRIMAIRE : 10 min, 24px, durées 10-50", () => {
      const cfg = getGridConfig("PRIMAIRE");
      expect(cfg.stepMinutes).toBe(10);
      expect(cfg.slotHeight).toBe(24);
      expect(cfg.isFineGrid).toBe(true);
      expect(cfg.durations).toEqual([10, 15, 20, 30, 35, 45, 50]);
    });

    it("grille standard pour COLLEGE/LYCEE : 30 min, 48px, durées 30-120", () => {
      const cfg = getGridConfig("COLLEGE");
      expect(cfg.stepMinutes).toBe(30);
      expect(cfg.slotHeight).toBe(48);
      expect(cfg.isFineGrid).toBe(false);
      expect(cfg.durations).toEqual([30, 60, 90, 120]);
    });

    it("null → grille standard par défaut", () => {
      const cfg = getGridConfig(null);
      expect(cfg.stepMinutes).toBe(30);
      expect(cfg.isFineGrid).toBe(false);
    });

    it("les slots commencent à 07:00 et finissent avant 18:00", () => {
      const fine = getGridConfig("PRIMAIRE");
      expect(fine.slots[0]).toBe("07:00");
      // dernier slot de début : 18:00 - step (un créneau doit tenir avant 18:00
      // au minimum pour une durée = step, mais buildSlots exclut 18:00)
      expect(fine.slots[fine.slots.length - 1]).toBe("17:50");

      const std = getGridConfig("COLLEGE");
      expect(std.slots[0]).toBe("07:00");
      expect(std.slots[std.slots.length - 1]).toBe("17:30");
    });

    it("grille fine a plus de slots que grille standard", () => {
      expect(getGridConfig("PRIMAIRE").slots.length).toBeGreaterThan(getGridConfig("COLLEGE").slots.length);
    });
  });

  describe("computeEndTime", () => {
    it("calcule l'heure de fin", () => {
      expect(computeEndTime("08:00", 60)).toBe("09:00");
      expect(computeEndTime("08:00", 45)).toBe("08:45");
      expect(computeEndTime("16:30", 90)).toBe("18:00");
    });

    it("gère le passage d'heure", () => {
      expect(computeEndTime("11:45", 20)).toBe("12:05");
      expect(computeEndTime("09:50", 15)).toBe("10:05");
    });
  });

  describe("getValidStartSlots", () => {
    it("exclut les slots où le créneau dépasserait 18:00", () => {
      const std = getGridConfig("COLLEGE");
      const valid60 = getValidStartSlots(std.slots, 60);
      // 17:30 + 60 = 18:30 > 18:00 → exclu ; 17:00 + 60 = 18:00 OK
      expect(valid60).toContain("17:00");
      expect(valid60).not.toContain("17:30");

      const valid120 = getValidStartSlots(std.slots, 120);
      // 16:00 + 120 = 18:00 OK ; 16:30 + 120 = 18:30 > 18:00 → exclu
      expect(valid120).toContain("16:00");
      expect(valid120).not.toContain("16:30");
    });

    it("grille fine : 17:50 + 10 = 18:00 est valide", () => {
      const fine = getGridConfig("PRIMAIRE");
      const valid10 = getValidStartSlots(fine.slots, 10);
      expect(valid10).toContain("17:50");
      // 17:50 + 50 = 18:40 > 18:00 → exclu pour durée 50
      const valid50 = getValidStartSlots(fine.slots, 50);
      expect(valid50).not.toContain("17:50");
    });
  });

  describe("conversions", () => {
    it("timeToMinutes / minutesToTime round-trip", () => {
      expect(timeToMinutes("08:30")).toBe(510);
      expect(minutesToTime(510)).toBe("08:30");
      expect(minutesToTime(0)).toBe("00:00");
    });
  });

  describe("constantes", () => {
    it("plage 07:00-18:00 et limite 765 min/jour", () => {
      expect(DEBUT_MIN).toBe(420);
      expect(FIN_MIN).toBe(1080);
      expect(MAX_MINUTES_PAR_JOUR).toBe(765);
    });
  });
});
