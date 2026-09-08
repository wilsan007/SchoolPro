import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { TimeMachineModal } from "./TimeMachineModal";

const mockFetch = vi.fn<typeof fetch>();
const activeDate = "2025-10-15T10:00:00.000Z";
const realNow = "2026-09-07T10:00:00.000Z";

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function openModal(enabled = true) {
  mockFetch.mockResolvedValueOnce(response({
    enabled,
    date: enabled ? activeDate : null,
    realNow,
  }));
  await act(async () => {
    render(<TimeMachineModal open onOpenChange={vi.fn()} />);
  });
}

async function clickButton(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TimeMachineModal", () => {
  describe.each(["appliquer", "retourReel"])("%s", (action) => {
    it.each([403, 429, 500])("refuse un succès et un rechargement après HTTP %s", async (status) => {
      await openModal();
      const timeout = vi.spyOn(globalThis, "setTimeout");
      mockFetch.mockResolvedValueOnce(response({
        error: status === 429 ? "rate_limited" : "Non autorisé",
      }, status));

      await clickButton(action);

      expect.soft(toast.success).not.toHaveBeenCalled();
      expect.soft(toast.error).toHaveBeenCalledExactlyOnceWith("erreur");
      expect.soft(timeout).not.toHaveBeenCalledWith(expect.any(Function), 500);
      expect.soft(screen.queryByText("modeDemo")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "appliquer" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "annuler" })).toBeEnabled();
      expect(mockFetch).toHaveBeenLastCalledWith("/api/demo-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: action === "retourReel" ? null : activeDate }),
      });
    });

    it("conserve l'état et libère les boutons après une erreur réseau", async () => {
      await openModal();
      const timeout = vi.spyOn(globalThis, "setTimeout");
      mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await clickButton(action);

      expect(toast.error).toHaveBeenCalledExactlyOnceWith("erreur");
      expect(toast.success).not.toHaveBeenCalled();
      expect(timeout).not.toHaveBeenCalledWith(expect.any(Function), 500);
      expect(screen.getByText("modeDemo")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
    });
  });

  it("active la date et programme le rechargement après un succès HTTP", async () => {
    await openModal(false);
    fireEvent.click(screen.getByRole("button", { name: /presetOctobre2025/ }));
    mockFetch.mockResolvedValueOnce(response({ enabled: true, date: activeDate }));
    const timeout = vi.spyOn(globalThis, "setTimeout");

    await clickButton("appliquer");

    expect(toast.success).toHaveBeenCalledExactlyOnceWith("dateActivee");
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText("modeDemo")).toBeInTheDocument();
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 500);
    expect(screen.getByRole("button", { name: "appliquer" })).toBeEnabled();
  });

  it("désactive la date et programme le rechargement après un succès HTTP", async () => {
    await openModal();
    mockFetch.mockResolvedValueOnce(response({ enabled: false, date: null }));
    const timeout = vi.spyOn(globalThis, "setTimeout");

    await clickButton("retourReel");

    expect(toast.success).toHaveBeenCalledExactlyOnceWith("dateDesactivee");
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText("modeReel")).toBeInTheDocument();
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 500);
    expect(mockFetch).toHaveBeenLastCalledWith("/api/demo-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: null }),
    });
  });

  it.each([403, 429, 500])("conserve l'état existant si le chargement retourne HTTP %s", async (status) => {
    mockFetch.mockResolvedValueOnce(response({ enabled: true, date: activeDate, realNow }));
    const onOpenChange = vi.fn();
    const view = render(<TimeMachineModal open={false} onOpenChange={onOpenChange} />);
    await act(async () => {
      view.rerender(<TimeMachineModal open onOpenChange={onOpenChange} />);
    });
    view.rerender(<TimeMachineModal open={false} onOpenChange={onOpenChange} />);
    mockFetch.mockResolvedValueOnce(response({ error: "Non autorisé" }, status));

    await act(async () => {
      view.rerender(<TimeMachineModal open onOpenChange={onOpenChange} />);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect.soft(screen.queryByText("modeDemo")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
