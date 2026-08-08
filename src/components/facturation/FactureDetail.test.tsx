import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FactureDetail } from "@/components/facturation/FactureDetail";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock server actions
vi.mock("@/lib/actions/facture", () => ({
  enregistrerPaiement: vi.fn(),
  annulerFacture: vi.fn(),
}));

// Mock confirm
global.confirm = vi.fn(() => true);

import { enregistrerPaiement, annulerFacture } from "@/lib/actions/facture";

const mockEnregistrerPaiement = enregistrerPaiement as ReturnType<typeof vi.fn>;
const mockAnnulerFacture = annulerFacture as ReturnType<typeof vi.fn>;

const baseFacture = {
  id: "f1",
  numero: "FAC-2025-00001",
  libelle: "Scolarité 2025",
  montant: 50000,
  devise: "DJF",
  statut: "EN_ATTENTE" as const,
  echeance: new Date("2025-12-31"),
  createdAt: new Date("2025-01-01"),
  eleve: {
    id: "e1",
    nom: "Doe",
    prenom: "John",
    matricule: "MAT001",
    classe: { nom: "6ème A", niveau: "Collège" },
    parents: [
      {
        parent: {
          nom: "Doe Sr",
          prenom: "Robert",
          phone: "+25312345678",
          email: "robert@example.com",
        },
      },
    ],
  },
  paiements: [
    {
      id: "p1",
      montant: 20000,
      devise: "DJF",
      methode: "waffi",
      reference: "REF001",
      date: new Date("2025-01-10"),
      enregistrePar: { id: "u1", name: "Admin" },
    },
  ],
  createdBy: { id: "u1", name: "Admin" },
};

describe("FactureDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders facture header with numero and libelle", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("FAC-2025-00001")).toBeInTheDocument();
    expect(screen.getByText("Scolarité 2025")).toBeInTheDocument();
  });

  it("displays createdBy name when present", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });

  it("does not display createdBy section when null", () => {
    const f = { ...baseFacture, createdBy: null };
    render(<FactureDetail facture={f} />);
    const recordedByElements = screen.queryAllByText("recordedBy");
    expect(recordedByElements.length).toBe(1); // only in payment history table header
  });

  it("displays student info", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText(/John/)).toBeInTheDocument();
    expect(screen.getByText("MAT001")).toBeInTheDocument();
    expect(screen.getByText(/6ème A/)).toBeInTheDocument();
  });

  it("displays guardian info when present", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText(/Robert/)).toBeInTheDocument();
    expect(screen.getByText("+25312345678")).toBeInTheDocument();
  });

  it("displays noGuardian when no parent", () => {
    const f = {
      ...baseFacture,
      eleve: { ...baseFacture.eleve, parents: [] },
    };
    render(<FactureDetail facture={f} />);
    expect(screen.getByText("noGuardian")).toBeInTheDocument();
  });

  it("shows collect payment and cancel buttons for EN_ATTENTE", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("collectPayment")).toBeInTheDocument();
    expect(screen.getByText("cancel")).toBeInTheDocument();
  });

  it("does not show collect/cancel buttons for PAYEE", () => {
    const f = { ...baseFacture, statut: "PAYEE" as const };
    render(<FactureDetail facture={f} />);
    expect(screen.queryByText("collectPayment")).not.toBeInTheDocument();
    expect(screen.queryByText("cancel")).not.toBeInTheDocument();
  });

  it("does not show collect/cancel buttons for ANNULEE", () => {
    const f = { ...baseFacture, statut: "ANNULEE" as const };
    render(<FactureDetail facture={f} />);
    expect(screen.queryByText("collectPayment")).not.toBeInTheDocument();
  });

  it("shows print receipt button when PAYEE with payments", () => {
    const f = { ...baseFacture, statut: "PAYEE" as const };
    render(<FactureDetail facture={f} />);
    expect(screen.getByText("printReceipt")).toBeInTheDocument();
  });

  it("does not show print receipt when PAYEE but no payments", () => {
    const f = {
      ...baseFacture,
      statut: "PAYEE" as const,
      paiements: [],
    };
    render(<FactureDetail facture={f} />);
    expect(screen.queryByText("printReceipt")).not.toBeInTheDocument();
  });

  it("shows payment form when collect button clicked", () => {
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    expect(screen.getByText("validatePayment")).toBeInTheDocument();
  });

  it("hides payment form when cancel clicked", () => {
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    expect(screen.getByText("validatePayment")).toBeInTheDocument();
    // Click the cancel button inside the payment form (type="button")
    const cancelButtons = screen.getAllByText("cancel");
    const formCancel = cancelButtons.find((b) => b.closest("button[type=\"button\"]"));
    if (formCancel) fireEvent.click(formCancel);
    expect(screen.queryByText("validatePayment")).not.toBeInTheDocument();
  });

  it("renders payment history with enregistrePar name", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("paymentHistory")).toBeInTheDocument();
    expect(screen.getByText("REF001")).toBeInTheDocument();
    expect(screen.getByText("waffi")).toBeInTheDocument();
  });

  it("displays noPayments when no payments", () => {
    const f = { ...baseFacture, paiements: [] };
    render(<FactureDetail facture={f} />);
    expect(screen.getByText("noPayments")).toBeInTheDocument();
  });

  it("displays dash for payment without enregistrePar", () => {
    const f = {
      ...baseFacture,
      paiements: [
        {
          id: "p2",
          montant: 10000,
          devise: "DJF",
          methode: "espèces",
          reference: null,
          date: new Date("2025-01-05"),
          enregistrePar: null,
        },
      ],
    };
    render(<FactureDetail facture={f} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows Djibouti payment methods in dropdown", () => {
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    // waffi appears in both payment history and dropdown
    expect(screen.getAllByText("waffi").length).toBeGreaterThan(0);
    expect(screen.getAllByText("cacPay").length).toBeGreaterThan(0);
    expect(screen.getAllByText("dahabPlus").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sabaPay").length).toBeGreaterThan(0);
    expect(screen.getAllByText("faida").length).toBeGreaterThan(0);
  });

  it("does not show old payment methods (Wave, Orange Money)", () => {
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    expect(screen.queryByText("wave")).not.toBeInTheDocument();
    expect(screen.queryByText("orangeMoney")).not.toBeInTheDocument();
  });

  it("submits payment and shows receipt confirmation", async () => {
    mockEnregistrerPaiement.mockResolvedValue({ success: true, id: "p-new" });
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    const montantInput = document.getElementById("montant") as HTMLInputElement;
    fireEvent.change(montantInput, { target: { value: "30000" } });
    fireEvent.click(screen.getByText("validatePayment"));
    await waitFor(() => {
      expect(mockEnregistrerPaiement).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("paymentRecordedPrintReceipt")).toBeInTheDocument();
    });
  });

  it("shows error toast when payment fails", async () => {
    mockEnregistrerPaiement.mockRejectedValue(new Error("Server error"));
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("collectPayment"));
    const montantInput = document.getElementById("montant") as HTMLInputElement;
    fireEvent.change(montantInput, { target: { value: "30000" } });
    fireEvent.click(screen.getByText("validatePayment"));
    await waitFor(() => {
      expect(mockEnregistrerPaiement).toHaveBeenCalled();
    });
  });

  it("cancels invoice when cancel button clicked", async () => {
    mockAnnulerFacture.mockResolvedValue({ success: true });
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => {
      expect(mockAnnulerFacture).toHaveBeenCalledWith("f1");
    });
  });

  it("does not cancel when confirm returns false", async () => {
    global.confirm = vi.fn(() => false);
    render(<FactureDetail facture={baseFacture} />);
    fireEvent.click(screen.getByText("cancel"));
    expect(mockAnnulerFacture).not.toHaveBeenCalled();
    global.confirm = vi.fn(() => true);
  });

  it("renders financial summary (invoiced, collected, remaining)", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("invoiced")).toBeInTheDocument();
    expect(screen.getByText("collected")).toBeInTheDocument();
    expect(screen.getByText("remaining")).toBeInTheDocument();
  });

  it("renders PDF links for each payment", () => {
    render(<FactureDetail facture={baseFacture} />);
    const pdfLinks = screen.getAllByText("PDF");
    expect(pdfLinks).toHaveLength(1);
  });

  it("renders back to invoices link", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("backToInvoices")).toBeInTheDocument();
  });

  it("renders view profile link", () => {
    render(<FactureDetail facture={baseFacture} />);
    expect(screen.getByText("viewProfile")).toBeInTheDocument();
  });
});
