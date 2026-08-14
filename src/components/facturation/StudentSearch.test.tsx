import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StudentSearch } from "./StudentSearch";

const mockStudents = [
  { id: "s1", nom: "Doe", prenom: "John", matricule: "MAT001", classe: { nom: "6ème A" } },
  { id: "s2", nom: "Smith", prenom: "Jane", matricule: "MAT002", classe: { nom: "5ème B" } },
  { id: "s3", nom: "Brown", prenom: "Bob", matricule: "MAT003", classe: null },
];

const mockOnChange = vi.fn();

describe("StudentSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders input and shows selected student", () => {
    render(<StudentSearch students={mockStudents} value="s1" onChange={mockOnChange} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toContain("John Doe");
    expect(input.value).toContain("MAT001");
  });

  it("shows dropdown on focus", () => {
    render(<StudentSearch students={mockStudents} value="" onChange={mockOnChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("filters students by query", () => {
    render(<StudentSearch students={mockStudents} value="" onChange={mockOnChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "smith" } });
    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("filters students by matricule", () => {
    render(<StudentSearch students={mockStudents} value="" onChange={mockOnChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MAT003" } });
    expect(screen.queryByText("John Doe")).not.toBeInTheDocument();
    expect(screen.getByText("Bob Brown")).toBeInTheDocument();
  });

  it("calls onChange when selecting a student", () => {
    render(<StudentSearch students={mockStudents} value="" onChange={mockOnChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Jane Smith"));
    expect(mockOnChange).toHaveBeenCalledWith("s2", expect.stringContaining("Jane Smith"));
  });

  it("shows empty message when no match", () => {
    render(<StudentSearch students={mockStudents} value="" onChange={mockOnChange} emptyMessage="Aucun" />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzzz" } });
    expect(screen.getByText("Aucun")).toBeInTheDocument();
  });
});
