import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FacturesTable } from "@/components/facturation/FacturesTable";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFactures = [
  {
    id: "f1",
    numero: "FAC-2025-00001",
    libelle: "Scolarité 2025",
    montant: 50000,
    devise: "DJF",
    statut: "PAYEE" as const,
    echeance: new Date("2025-12-31"),
    createdAt: new Date("2025-01-01"),
    eleve: {
      id: "e1",
      nom: "Doe",
      prenom: "John",
      matricule: "MAT001",
      classe: { nom: "6ème A" },
    },
    paiements: [{ montant: 50000, methode: "waffi" }],
    createdBy: { id: "u1", name: "Admin" },
  },
  {
    id: "f2",
    numero: "FAC-2025-00002",
    libelle: "Cantine",
    montant: 30000,
    devise: "DJF",
    statut: "EN_ATTENTE" as const,
    echeance: null,
    createdAt: new Date("2025-01-02"),
    eleve: {
      id: "e2",
      nom: "Smith",
      prenom: "Jane",
      matricule: "MAT002",
      classe: { nom: "5ème B" },
    },
    paiements: [{ montant: 10000, methode: "espèces" }],
    createdBy: null,
  },
  {
    id: "f3",
    numero: "FAC-2025-00003",
    libelle: "Transport",
    montant: 20000,
    devise: "DJF",
    statut: "EN_RETARD" as const,
    echeance: new Date("2020-01-01"),
    createdAt: new Date("2025-01-03"),
    eleve: {
      id: "e3",
      nom: "Brown",
      prenom: "Bob",
      matricule: "MAT003",
      classe: null,
    },
    paiements: [],
    createdBy: { id: "u2", name: "Secretary" },
  },
];

describe("FacturesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders table with factures", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getByText("FAC-2025-00001")).toBeInTheDocument();
    expect(screen.getByText("FAC-2025-00002")).toBeInTheDocument();
    expect(screen.getByText("FAC-2025-00003")).toBeInTheDocument();
  });

  it("renders empty state when no factures", () => {
    render(<FacturesTable factures={[]} />);
    expect(screen.getByText("noInvoices")).toBeInTheDocument();
  });

  it("displays student names correctly", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("displays createdBy name when present", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Secretary")).toBeInTheDocument();
  });

  it("displays dash when createdBy is null", () => {
    render(<FacturesTable factures={mockFactures} />);
    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("filters by search query (numero)", () => {
    render(<FacturesTable factures={mockFactures} />);
    const input = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "00001" } });
    expect(screen.getByText("FAC-2025-00001")).toBeInTheDocument();
    expect(screen.queryByText("FAC-2025-00002")).not.toBeInTheDocument();
  });

  it("filters by search query (student name)", () => {
    render(<FacturesTable factures={mockFactures} />);
    const input = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "smith" } });
    expect(screen.getByText("FAC-2025-00002")).toBeInTheDocument();
    expect(screen.queryByText("FAC-2025-00001")).not.toBeInTheDocument();
  });

  it("filters by search query (libelle)", () => {
    render(<FacturesTable factures={mockFactures} />);
    const input = screen.getByPlaceholderText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "cantine" } });
    expect(screen.getByText("FAC-2025-00002")).toBeInTheDocument();
    expect(screen.queryByText("FAC-2025-00001")).not.toBeInTheDocument();
  });

  it("shows filter panel when filter button clicked", () => {
    render(<FacturesTable factures={mockFactures} />);
    fireEvent.click(screen.getByText("filters"));
    expect(screen.getByText("status")).toBeInTheDocument();
  });

  it("filters by statut when filter selected", () => {
    render(<FacturesTable factures={mockFactures} />);
    fireEvent.click(screen.getByText("filters"));
    const select = screen.getByTestId("status-filter");
    fireEvent.change(select, { target: { value: "PAYEE" } });
    expect(screen.getByText("FAC-2025-00001")).toBeInTheDocument();
    expect(screen.queryByText("FAC-2025-00002")).not.toBeInTheDocument();
  });

  it("displays N/A when classe is null", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getAllByText(/notApplicable/).length).toBeGreaterThan(0);
  });

  it("displays status badges", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getByText("statusPaid")).toBeInTheDocument();
    expect(screen.getByText("statusPending")).toBeInTheDocument();
    expect(screen.getByText("statusOverdue")).toBeInTheDocument();
  });

  it("displays total invoiced, collected, and remaining", () => {
    render(<FacturesTable factures={mockFactures} />);
    expect(screen.getByText("totalInvoiced")).toBeInTheDocument();
    expect(screen.getByText("totalCollected")).toBeInTheDocument();
    expect(screen.getByText("balanceRemaining")).toBeInTheDocument();
  });

  it("renders detail links for each facture", () => {
    render(<FacturesTable factures={mockFactures} />);
    const links = screen.getAllByText("detail");
    expect(links).toHaveLength(3);
  });

  it("exports CSV when export button clicked", () => {
    const mockCreateObjectURL = vi.fn(() => "blob:url");
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
    const mockAppendChild = vi.spyOn(document.body, "appendChild");
    const mockRemoveChild = vi.spyOn(document.body, "removeChild");

    render(<FacturesTable factures={mockFactures} />);
    fireEvent.click(screen.getByText("export"));

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockAppendChild).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalled();

    mockAppendChild.mockRestore();
    mockRemoveChild.mockRestore();
  });
});
