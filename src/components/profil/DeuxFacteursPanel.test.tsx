import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import fr from "@/i18n/fr.json";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";
import { DeuxFacteursPanel } from "@/components/profil/DeuxFacteursPanel";

const MESSAGES = { fr, en, so } as const;
type Locale = keyof typeof MESSAGES;

/**
 * Le setup global remplace `next-intl` par un écho de clés : pratique pour
 * repérer une clé absente, inutilisable pour vérifier qu'un texte français ne
 * fuit pas d'un écran — tout y ressemble à une clé. Ce test remonte donc les
 * vraies ressources `src/i18n/*.json` et peut changer de locale à la volée, ce
 * qui vérifie au passage le contenu réellement servi.
 */
const etat = vi.hoisted(() => ({ locale: "fr" }));

vi.mock("next-intl", async () => {
  const ressources: Record<string, Record<string, unknown>> = {
    fr: (await import("@/i18n/fr.json")).default as Record<string, unknown>,
    en: (await import("@/i18n/en.json")).default as Record<string, unknown>,
    so: (await import("@/i18n/so.json")).default as Record<string, unknown>,
  };

  function lire(cle: string): string {
    const valeur = cle.split(".").reduce<unknown>(
      (acc, partie) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[partie]
          : undefined,
      ressources[etat.locale]
    );
    return typeof valeur === "string" ? valeur : cle;
  }

  return {
    useLocale: () => etat.locale,
    useTranslations:
      (namespace?: string) =>
      (cle: string, valeurs: Record<string, unknown> = {}) => {
        let texte = lire(namespace ? `${namespace}.${cle}` : cle);
        for (const [nom, valeur] of Object.entries(valeurs)) {
          texte = texte.replace(`{${nom}}`, String(valeur));
        }
        return texte;
      },
  };
});

const mockFetch = vi.fn<typeof fetch>();

const SETUP = {
  qrCodeUri: "otpauth://totp/EcolPro:prof@ecole.dj?secret=ABCDEF234567",
  qrCodeDataUrl: "data:image/png;base64,AAAA",
  secretBase32: "ABCDEF234567",
  backupCodes: ["AAAA-BBBB", "CCCC-DDDD"],
};

function reponse(corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });
}

type Props = ComponentProps<typeof DeuxFacteursPanel>;

function rendre(locale: Locale, props: Partial<Props> = {}) {
  etat.locale = locale;
  return render(
    <DeuxFacteursPanel
      actifInitial={false}
      derniereVerification={null}
      obligatoire={false}
      {...props}
    />
  );
}

async function cliquer(nom: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nom }));
  });
}

/** Rend le panneau puis déclenche « setup » : on arrive à l'étape QR code. */
async function ouvrirConfiguration(locale: Locale) {
  const t = MESSAGES[locale].twoFactor;
  rendre(locale);
  mockFetch.mockResolvedValueOnce(reponse(SETUP));
  await cliquer(t.activer);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeuxFacteursPanel — traductions", () => {
  it.each(["en", "so"] as const)(
    "fournit une traduction non française pour chaque clé de twoFactor (%s)",
    (locale) => {
      const reference = MESSAGES.fr.twoFactor as Record<string, string>;
      const traductions = MESSAGES[locale].twoFactor as Record<string, string>;

      // Une clé ajoutée d'un côté seulement passerait inaperçue à l'écran :
      // le repli de next-intl afficherait la clé brute.
      expect(Object.keys(traductions).sort()).toEqual(Object.keys(reference).sort());

      for (const [cle, texte] of Object.entries(traductions)) {
        expect(texte.trim(), `twoFactor.${cle} vide en ${locale}`).not.toBe("");
        expect(texte, `twoFactor.${cle} est resté en français (${locale})`).not.toBe(
          reference[cle]
        );
      }
    }
  );

  it.each(["fr", "en", "so"] as const)("rend l'état inactif en %s", (locale) => {
    const t = MESSAGES[locale].twoFactor;
    rendre(locale);

    expect(screen.getByRole("heading", { name: t.statutInactif })).toBeInTheDocument();
    expect(screen.getByText(t.inactifDesc)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.activer })).toBeInTheDocument();
  });

  it("affiche l'avertissement renforcé quand le rôle impose la 2FA", () => {
    const t = MESSAGES.en.twoFactor;
    rendre("en", { obligatoire: true });

    expect(screen.getByText(t.inactifObligatoire)).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.fr.twoFactor.inactifObligatoire)).toBeNull();
  });

  it("n'affiche aucun libellé français sur l'écran de configuration en anglais", async () => {
    const t = await ouvrirConfiguration("en");

    expect(screen.getByRole("heading", { name: t.configurerTitre })).toBeInTheDocument();
    // Le texte alternatif du QR code doit être traduit lui aussi : c'est ce
    // qu'entend un utilisateur de lecteur d'écran.
    expect(screen.getByAltText(t.scannerQR)).toBeInTheDocument();
    expect(screen.getByText(SETUP.backupCodes[0])).toBeInTheDocument();
    expect(screen.getByLabelText(t.codesArchives)).toBeInTheDocument();

    for (const texte of Object.values(MESSAGES.fr.twoFactor)) {
      expect(screen.queryByText(texte), `texte français affiché : « ${texte} »`).toBeNull();
    }
  });
});

describe("DeuxFacteursPanel — parcours", () => {
  it("configure puis active la 2FA, et confirme en anglais", async () => {
    const t = await ouvrirConfiguration("en");

    const valider = screen.getByRole("button", { name: t.verifier });
    // Les codes de secours non archivés interdisent l'activation : la garde
    // est dans le code, pas seulement dans la copie.
    expect(valider).toBeDisabled();

    fireEvent.change(screen.getByLabelText(t.entrerCode), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByLabelText(t.codesArchives));
    expect(valider).toBeEnabled();

    mockFetch.mockResolvedValueOnce(reponse({ success: true }));
    await cliquer(t.verifier);

    expect(mockFetch).toHaveBeenLastCalledWith("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token: "123456" }),
    });
    expect(toast.success).toHaveBeenCalledWith(t.activee);
    expect(screen.getByRole("heading", { name: t.statutActif })).toBeInTheDocument();
  });

  it("remplace « Code TOTP invalide » par la marche à suivre traduite", async () => {
    const t = await ouvrirConfiguration("en");

    mockFetch.mockResolvedValueOnce(
      reponse(
        { code: "STATUT_INVALIDE", error: "Statut invalide", detail: "Code TOTP invalide" },
        400
      )
    );
    fireEvent.change(screen.getByLabelText(t.entrerCode), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByLabelText(t.codesArchives));
    await cliquer(t.verifier);

    expect(toast.error).toHaveBeenCalledWith(t.codeRefuse);
    expect(toast.error).not.toHaveBeenCalledWith("Code TOTP invalide");
  });

  it("affiche un motif serveur inconnu tel quel plutôt qu'un générique", async () => {
    rendre("fr");
    mockFetch.mockResolvedValueOnce(
      reponse({ code: "ERREUR_SERVEUR", error: "Erreur serveur", detail: "Quota dépassé" }, 500)
    );
    await cliquer(MESSAGES.fr.twoFactor.activer);

    expect(toast.error).toHaveBeenCalledWith("Quota dépassé");
    expect(toast.error).not.toHaveBeenCalledWith("Erreur lors de l'opération");
  });

  it("traduit le code stable « rate_limited » renvoyé sans détail", async () => {
    rendre("en");
    mockFetch.mockResolvedValueOnce(reponse({ success: false, error: "rate_limited" }, 429));
    await cliquer(MESSAGES.en.twoFactor.activer);

    expect(toast.error).toHaveBeenCalledWith(MESSAGES.en.common.security.rateLimited);
  });

  it("désactive la 2FA après confirmation, avec un message traduit", async () => {
    const t = MESSAGES.fr.twoFactor;
    const invitation = vi.fn(() => "123456");
    vi.stubGlobal("prompt", invitation);
    rendre("fr", { actifInitial: true });

    mockFetch.mockResolvedValueOnce(reponse({ success: true }));
    await cliquer(t.desactiver);

    expect(invitation).toHaveBeenCalledWith(t.confirmerDesactivation);
    expect(mockFetch).toHaveBeenLastCalledWith("/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", token: "123456" }),
    });
    expect(toast.success).toHaveBeenCalledWith(t.desactivee);
    expect(screen.getByRole("heading", { name: t.statutInactif })).toBeInTheDocument();
  });

  it("date la dernière vérification dans la locale active", () => {
    rendre("en", {
      actifInitial: true,
      derniereVerification: "2026-09-07T10:00:00.000Z",
    });

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});