import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { useModalA11y } from "./use-modal-a11y";

afterEach(cleanup);

const echap = () => fireEvent.keyDown(document, { key: "Escape" });

describe("useModalA11y", () => {
  it("expose role=dialog et aria-modal", () => {
    const { result } = renderHook(() => useModalA11y(() => {}));
    expect(result.current).toEqual({ role: "dialog", "aria-modal": true });
  });

  it("ferme la modale sur Échap", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(onClose));
    echap();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignore les autres touches et les modales fermées", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(onClose, false));
    echap();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ne ferme que la modale du dessus", () => {
    const dessous = vi.fn();
    const dessus = vi.fn();
    renderHook(() => useModalA11y(dessous));
    const haut = renderHook(() => useModalA11y(dessus));
    echap();
    expect(dessus).toHaveBeenCalledTimes(1);
    expect(dessous).not.toHaveBeenCalled();
    haut.unmount();
    echap();
    expect(dessous).toHaveBeenCalledTimes(1);
  });

  it("laisse passer un Échap déjà consommé (liste déroulante ouverte)", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(onClose));
    const consommer = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener("keydown", consommer, { capture: true });
    echap();
    document.removeEventListener("keydown", consommer, { capture: true });
    expect(onClose).not.toHaveBeenCalled();
  });
});
