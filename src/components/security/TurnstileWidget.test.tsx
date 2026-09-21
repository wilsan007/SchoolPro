import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * Régression de la boucle de production : le widget Turnstile était détruit
 * puis re-créé à CHAQUE render du parent (les callbacks inline changeaient
 * l'identité de `renderWidget`, et le `useEffect` suivait). Un défi résolu
 * appelant `onVerify` → re-render → remontage → nouveau défi résolu → … la
 * page de connexion tournait en boucle sans laisser aucune action possible.
 */

// La sitekey est résolue AU CHARGEMENT du module : elle doit être posée avant
// l'import dynamique du composant.
process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY = "1x00000000000000000000AA";
const { default: TurnstileWidget } = await import("@/components/security/TurnstileWidget");

type TurnstileOpts = {
  sitekey: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
};

const renderFn = vi.fn((_el: HTMLElement, _opts: TurnstileOpts) => "widget-1");
const removeFn = vi.fn();

/** Déclenche le chargement du script api.js, que jsdom n'exécute jamais. */
async function chargerScript() {
  await act(async () => {
    document
      .querySelector('script[src*="challenges.cloudflare.com"]')
      ?.dispatchEvent(new Event("load"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { turnstile: unknown }).turnstile = {
    render: renderFn,
    remove: removeFn,
    reset: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
});

describe("TurnstileWidget — boucle de re-rendu", () => {
  it("ne remonte pas le widget quand le parent re-render avec des callbacks inline", async () => {
    const onVerify = vi.fn();

    const { rerender } = render(
      <TurnstileWidget onVerify={onVerify} onExpire={() => {}} />
    );

    await chargerScript();
    expect(renderFn).toHaveBeenCalledTimes(1);

    // Le défi auto-résolu remplit le jeton — dans la vraie page, cela
    // re-render le parent (setTurnstileToken).
    const opts = renderFn.mock.calls[0]?.[1];
    expect(opts?.callback).toBeDefined();
    act(() => opts?.callback?.("tok-1"));
    expect(onVerify).toHaveBeenCalledWith("tok-1");

    // Cinq re-renders du parent avec de NOUVELLES identités de callbacks
    // (fléchées inline) : frappe clavier, setTurnstileToken, etc.
    for (let i = 0; i < 5; i++) {
      rerender(<TurnstileWidget onVerify={onVerify} onExpire={() => {}} />);
    }

    // Le widget n'a été NI re-créé NI détruit : la boucle infinie de
    // production (défi résolu → remontage → nouveau défi → …) est rompue.
    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(removeFn).not.toHaveBeenCalled();

    // Les callbacks vivants restent branchés : le latest-ref livre bien
    // les événements postérieurs aux re-renders.
    act(() => opts?.callback?.("tok-2"));
    expect(onVerify).toHaveBeenCalledWith("tok-2");
  });

  it("nettoie le widget au démontage", async () => {
    const { unmount } = render(
      <TurnstileWidget onVerify={vi.fn()} onExpire={() => {}} />
    );

    await chargerScript();
    expect(renderFn).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeFn).toHaveBeenCalledWith("widget-1");
  });
});
