import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ListeGroupee } from "./liste-groupee";
import type { AxeRegroupement } from "@/lib/regroupement";
import fr from "@/i18n/fr.json";
import en from "@/i18n/en.json";
import so from "@/i18n/so.json";

interface Eleve {
  id: number;
  classe: string;
  site: string;
}

const AXES: AxeRegroupement<Eleve>[] = [
  { id: "site", cle: (e) => e.site },
  { id: "classe", cle: (e) => e.classe },
];

const eleves = (n: number): Eleve[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, classe: `C${i % 4}`, site: i % 2 ? "Ambouli" : "Arhiba" }));

function Tableau({ n }: { n: number }) {
  return (
    <table>
      <tbody>
        <ListeGroupee
          variante="table"
          items={eleves(n)}
          axes={AXES}
          rendu={(e) => (
            <tr key={e.id} data-testid="ligne">
              <td>{e.id}</td>
            </tr>
          )}
        />
      </tbody>
    </table>
  );
}

describe("ListeGroupee", () => {
  it("laisse la liste telle quelle jusqu'à 20 éléments", () => {
    render(<Tableau n={20} />);
    expect(screen.getAllByTestId("ligne")).toHaveLength(20);
    expect(screen.queryByText("grouperPar")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("regroupe dès 21 éléments, sans perdre de ligne", () => {
    render(<Tableau n={21} />);
    expect(screen.getByText("grouperPar")).toBeInTheDocument();
    expect(screen.getAllByTestId("ligne")).toHaveLength(21);
    // 4 classes de ~5 élèves découpent mieux que 2 sites de ~10.
    expect(screen.getByRole("button", { name: "axes.classe" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(4);
  });

  it("change d'axe à la demande et replie un groupe", () => {
    render(<Tableau n={40} />);
    fireEvent.click(screen.getByRole("button", { name: "axes.site" }));
    const enTetes = screen.getAllByRole("button", { expanded: true });
    expect(enTetes.map((b) => within(b).getByText(/A/).textContent)).toEqual(["Ambouli", "Arhiba"]);

    fireEvent.click(enTetes[0]);
    expect(screen.getAllByTestId("ligne")).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: "toutReplier" }));
    expect(screen.queryAllByTestId("ligne")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "toutDeplier" }));
    expect(screen.getAllByTestId("ligne")).toHaveLength(40);
  });

  it("re-découpe par classe un site qui dépasse lui-même le seuil", () => {
    render(<Tableau n={80} />);
    fireEvent.click(screen.getByRole("button", { name: "axes.site" }));
    // 2 sites de 40 → chacun découpé en 2 classes de 20.
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(2 + 4);
    expect(screen.getAllByTestId("ligne")).toHaveLength(80);
  });

  it("variante liste : applique la grille à chaque groupe", () => {
    const { container } = render(
      <ListeGroupee
        className="grille"
        items={eleves(30)}
        axes={AXES}
        rendu={(e) => <div key={e.id} data-testid="carte" />}
      />,
    );
    expect(container.querySelectorAll(".grille")).toHaveLength(4);
    expect(screen.getAllByTestId("carte")).toHaveLength(30);
  });
});

describe("libellés des axes", () => {
  // Les identifiants d'axes déclarés par les écrans sont résolus à l'exécution :
  // un libellé manquant n'apparaîtrait qu'une fois la liste au-dessus du seuil.
  const IDS = [
    "site", "structure", "niveau", "classe", "matiere", "role", "statut", "categorie", "type", "etat",
    "annee", "semestre", "mois", "semaine", "jour", "initiale", "plan", "contrat", "enseignant",
    "promotion", "batiment", "pays", "caissier", "localisation", "action", "responsable", "priorite",
  ];
  it.each([["fr", fr], ["en", en], ["so", so]] as const)("%s couvre tous les axes utilisés", (_langue, messages) => {
    const axes = (messages as { regroupement: { axes: Record<string, string> } }).regroupement.axes;
    expect(IDS.filter((id) => !axes[id])).toEqual([]);
  });
});
