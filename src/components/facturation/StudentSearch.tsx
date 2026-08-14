"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StudentOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  classe?: { nom: string } | null;
}

interface StudentSearchProps {
  students: StudentOption[];
  value: string;
  onChange: (studentId: string, displayText: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

export function StudentSearch({
  students,
  value,
  onChange,
  placeholder = "Rechercher un élève…",
  emptyMessage = "Aucun élève trouvé",
  disabled,
  className,
}: StudentSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => students.find((s) => s.id === value), [students, value]);

  useEffect(() => {
    if (selected) {
      setQuery(`${selected.prenom} ${selected.nom} — ${selected.matricule}`);
    } else {
      setQuery("");
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return students.slice(0, 50);
    return students
      .filter(
        (s) =>
          s.nom.toLowerCase().includes(q) ||
          s.prenom.toLowerCase().includes(q) ||
          s.matricule.toLowerCase().includes(q) ||
          s.classe?.nom?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [students, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [filtered.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1 < filtered.length ? i + 1 : i));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i > 0 ? i - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = filtered[highlighted];
      if (s) selectStudent(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function selectStudent(s: StudentOption) {
    const display = `${s.prenom} ${s.nom} — ${s.matricule}`;
    setQuery(display);
    onChange(s.id, display);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
          if (value) {
            // Si l'utilisateur modifie le texte, on reset la sélection
            onChange("", e.target.value);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-input bg-background shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <ul className="py-1">
              {filtered.map((s, idx) => (
                <li
                  key={s.id}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm hover:bg-accent",
                    idx === highlighted && "bg-accent"
                  )}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => selectStudent(s)}
                >
                  <div className="font-medium">{s.prenom} {s.nom}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.matricule} {s.classe?.nom ? `· ${s.classe.nom}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
