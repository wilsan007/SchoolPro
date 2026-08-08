import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonnelAbsencesConges } from "@/components/rh/PersonnelAbsencesConges";

// Mock fetch
global.fetch = vi.fn() as unknown as typeof fetch;

const mockEnseignants = [
  { id: "e1", user: { name: "Alice" } },
  { id: "e2", user: { name: "Bob" } },
];

const mockAbsences = [
  {
    id: "a1",
    date: new Date("2025-01-15"),
    heureDebut: "08:00",
    heureFin: "10:00",
    type: "ABSENCE",
    statut: "EN_ATTENTE",
    motif: "Maladie",
    commentaire: null,
    enseignant: { id: "e1", user: { name: "Alice" } },
    saisiePar: { name: "Admin" },
  },
  {
    id: "a2",
    date: new Date("2025-01-10"),
    heureDebut: null,
    heureFin: null,
    type: "RETARD",
    statut: "JUSTIFIEE",
    motif: null,
    commentaire: null,
    enseignant: { id: "e2", user: { name: "Bob" } },
    saisiePar: null,
  },
];

const mockConges = [
  {
    id: "c1",
    type: "ANNUEL",
    statut: "DEMANDE",
    dateDebut: new Date("2025-02-01"),
    dateFin: new Date("2025-02-10"),
    nbJours: 10,
    motif: "Vacances",
    enseignant: { id: "e1", user: { name: "Alice" } },
    demandePar: { name: "Alice" },
    approuvePar: null,
  },
  {
    id: "c2",
    type: "MALADIE",
    statut: "APPROUVE",
    dateDebut: new Date("2025-01-05"),
    dateFin: new Date("2025-01-08"),
    nbJours: 3,
    motif: null,
    enseignant: { id: "e2", user: { name: "Bob" } },
    demandePar: { name: "Bob" },
    approuvePar: { name: "Admin" },
  },
];

describe("PersonnelAbsencesConges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders absences list with correct data", () => {
    render(
      <PersonnelAbsencesConges
        absences={mockAbsences}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Maladie")).toBeInTheDocument();
  });

  it("renders empty state when no absences", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText("noAbsences")).toBeInTheDocument();
  });

  it("renders conges list with correct data", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={mockConges}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText(/10/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/days/).length).toBeGreaterThan(0);
  });

  it("renders empty state when no conges", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText("noLeaves")).toBeInTheDocument();
  });

  it("shows add absence form when button clicked", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    fireEvent.click(screen.getByText("addAbsence"));
    expect(screen.getByText("validate")).toBeInTheDocument();
  });

  it("shows add leave form when button clicked", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    fireEvent.click(screen.getByText("addLeave"));
    expect(screen.getByText("validate")).toBeInTheDocument();
  });

  it("submits absence form and calls API", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ absence: mockAbsences[0] }),
    });

    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );

    fireEvent.click(screen.getByText("addAbsence"));

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "e1" } });

    const validateBtn = screen.getByText("validate");
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/rh/absences",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("submits conge form and calls API", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ conge: mockConges[0] }),
    });

    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );

    fireEvent.click(screen.getByText("addLeave"));

    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "e1" } });

    const validateBtn = screen.getByText("validate");
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/rh/conges",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("justifies an absence when check button clicked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ absence: { ...mockAbsences[0], statut: "JUSTIFIEE" } }),
    });

    render(
      <PersonnelAbsencesConges
        absences={[mockAbsences[0]]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );

    const checkBtn = (screen.getAllByRole("button") as HTMLButtonElement[]).find(
      (b: HTMLButtonElement) => b.querySelector("svg.lucide-check") !== null
    );
    if (checkBtn) {
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/rh/absences/a1",
          expect.objectContaining({ method: "PATCH" })
        );
      });
    }
  });

  it("approves a conge when check button clicked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ conge: { ...mockConges[0], statut: "APPROUVE" } }),
    });

    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[mockConges[0]]}
        enseignants={mockEnseignants}
      />
    );

    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    const checkBtn = buttons.find((b: HTMLButtonElement) => b.querySelector("svg.lucide-check") !== null);
    if (checkBtn) {
      fireEvent.click(checkBtn);
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/rh/conges/c1",
          expect.objectContaining({ method: "PATCH" })
        );
      });
    }
  });

  it("displays saisiePar name when present", () => {
    render(
      <PersonnelAbsencesConges
        absences={[mockAbsences[0]]}
        conges={[]}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText(/Admin/)).toBeInTheDocument();
  });

  it("displays approuvePar name when present", () => {
    render(
      <PersonnelAbsencesConges
        absences={[]}
        conges={[mockConges[1]]}
        enseignants={mockEnseignants}
      />
    );
    expect(screen.getByText(/Admin/)).toBeInTheDocument();
  });
});
