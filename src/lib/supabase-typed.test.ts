import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/types/supabase-generated";

/**
 * Tests de typage du client Supabase généré par `supabase gen types typescript`.
 *
 * Le typage est vérifié à la COMPILATION (tsc --noEmit passe sans erreur).
 * Ces tests à l'exécution vérifient que les requêtes se construisent
 * correctement et que les objets typés sont utilisables.
 *
 * Aucune connexion réseau n'est nécessaire — l'URL/key sont fictives,
 * les requêtes sont construites mais non exécutées.
 */
describe("Client Supabase typé (Database generic)", () => {
  const url = "https://example.supabase.co";
  const key = "fake-service-role-key";
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false },
  });

  it("le client typé s'instancie avec le generic Database", () => {
    expect(supabase).toBeDefined();
    expect(supabase.from).toBeDefined();
    expect(typeof supabase.from).toBe("function");
  });

  it("TablesInsert<'eleves'> produit un objet valide", () => {
    const nouvelEleve: TablesInsert<"eleves"> = {
      id: "eleve-001",
      tenantId: "tenant-test",
      nom: "Test",
      prenom: "Élève",
      matricule: "TEST-001",
      anneeInscription: "2026-2027",
      dateNaissance: "2010-01-01",
      updatedAt: new Date().toISOString(),
    };
    expect(nouvelEleve.tenantId).toBe("tenant-test");
    expect(nouvelEleve.id).toBe("eleve-001");
    expect(nouvelEleve.matricule).toBe("TEST-001");
  });

  it("la requête SELECT sur eleves se construit avec typage", () => {
    const query = supabase
      .from("eleves")
      .select("id, nom, prenom, tenantId, statut")
      .eq("tenantId", "tenant-test")
      .limit(10);

    expect(query).toBeDefined();
    expect(typeof query.then).toBe("function"); // c'est une Promise
  });

  it("un filtre sur une colonne inexistante est rejeté à la compilation", () => {
    // @ts-expect-error — "inexistante" n'est pas une colonne de la table eleves
    const _q = supabase.from("eleves").select("*").eq("inexistante", "x");
    void _q;
    expect(true).toBe(true);
  });

  it("la requête sur learnos_questions filtre par actif + langue", () => {
    const query = supabase
      .from("learnos_questions")
      .select("id, enonce, palier, actif, langue")
      .eq("actif", true)
      .eq("langue", "fr")
      .limit(10);

    expect(query).toBeDefined();
  });

  it("le SELECT avec jointure (eleves → eleve_parents) se construit", () => {
    const query = supabase
      .from("eleves")
      .select("id, nom, eleve_parents(parentId, lien, isGardien)")
      .limit(1);

    expect(query).toBeDefined();
  });

  it("les Enums sont utilisables comme valeurs typées", () => {
    // StatutEleve est un enum — la compilation vérifie la valeur
    const statut: Database["public"]["Enums"]["StatutEleve"] = "ACTIF";
    const lien: Database["public"]["Enums"]["LienParente"] = "PERE";

    expect(statut).toBe("ACTIF");
    expect(lien).toBe("PERE");
  });

  it("Tables<'factures'> est accessible (table métier)", () => {
    const query = supabase
      .from("factures")
      .select("id, tenantId, montantTotal, statut")
      .eq("tenantId", "tenant-test")
      .limit(5);

    expect(query).toBeDefined();
  });
});
