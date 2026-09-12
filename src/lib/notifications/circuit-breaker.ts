/**
 * EcolPro — Circuit Breaker pour les passerelles de notification
 * ============================================================
 *
 * Implémente le pattern Circuit Breaker pour protéger l'application
 * contre les défaillances des API externes (Africa's Talking SMS,
 * WhatsApp, Telegram, Resend).
 *
 * États :
 * - CLOSED : les requêtes passent normalement
 * - OPEN : les requêtes sont rejetées immédiatement (fail-fast)
 * - HALF_OPEN : quelques requêtes de test sont autorisées
 *
 * Si le taux d'erreur > SEUIL_ERREUR (20%), le circuit s'ouvre.
 * Après DELAI_RECOVERY, le circuit passe en HALF_OPEN pour tester.
 */

// ============================================================
// TYPES
// ============================================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Seuil de taux d'erreur (0-1) qui déclenche l'ouverture */
  seuilErreur: number;
  /** Nombre minimum de requêtes avant évaluation du seuil */
  minRequetes: number;
  /** Délai avant passage en HALF_OPEN (ms) */
  delaiRecovery: number;
  /** Nombre de requêtes de test en HALF_OPEN */
  maxTestsHalfOpen: number;
}

export interface CircuitStats {
  state: CircuitState;
  totalRequetes: number;
  totalErreurs: number;
  tauxErreur: number;
  dernierChangementEtat: number;
  requetesEnCours: number;
}

// ============================================================
// CONSTANTES PAR DÉFAUT
// ============================================================

const DEFAULTS: CircuitBreakerOptions = {
  seuilErreur: 0.2, // 20%
  minRequetes: 10,
  delaiRecovery: 60_000, // 1 minute
  maxTestsHalfOpen: 3,
};

// ============================================================
// CIRCUIT BREAKER
// ============================================================

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private totalRequetes = 0;
  private totalErreurs = 0;
  private fenetreRequetes = 0;
  private fenetreErreurs = 0;
  private dernierChangementEtat = Date.now();
  private requetesEnCours = 0;
  private testsHalfOpen = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = DEFAULTS
  ) {}

  /**
   * Exécute une fonction à travers le circuit breaker.
   * - Si CLOSED ou HALF_OPEN : exécute la fonction
   * - Si OPEN : rejette immédiatement
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`CircuitBreaker[${this.name}]: circuit OPEN — requêtes rejetées`);
    }

    this.requetesEnCours++;
    this.fenetreRequetes++;
    this.totalRequetes++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      this.requetesEnCours--;
    }
  }

  /** Vérifie si le circuit autorise l'exécution. */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case "CLOSED":
        return true;

      case "OPEN":
        // Vérifier si le délai de recovery est écoulé
        if (now - this.dernierChangementEtat >= this.options.delaiRecovery) {
          this.transitionTo("HALF_OPEN");
          this.testsHalfOpen = 0;
          return true;
        }
        return false;

      case "HALF_OPEN":
        // Autoriser seulement quelques requêtes de test
        if (this.testsHalfOpen < this.options.maxTestsHalfOpen) {
          this.testsHalfOpen++;
          return true;
        }
        return false;
    }
  }

  /** Enregistre un succès. */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      // En HALF_OPEN, un succès ferme le circuit
      this.transitionTo("CLOSED");
      this.resetFenetre();
    }
  }

  /** Enregistre un échec. */
  private onFailure(): void {
    this.fenetreErreurs++;
    this.totalErreurs++;

    if (this.state === "HALF_OPEN") {
      // En HALF_OPEN, un échec rouvre le circuit
      this.transitionTo("OPEN");
      return;
    }

    // En CLOSED, évaluer le seuil
    if (this.fenetreRequetes >= this.options.minRequetes) {
      const tauxErreur = this.fenetreErreurs / this.fenetreRequetes;
      if (tauxErreur >= this.options.seuilErreur) {
        this.transitionTo("OPEN");
        this.resetFenetre();
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.dernierChangementEtat = Date.now();
  }

  private resetFenetre(): void {
    this.fenetreRequetes = 0;
    this.fenetreErreurs = 0;
  }

  /** Retourne les statistiques courantes. */
  getStats(): CircuitStats {
    const tauxErreur = this.totalRequetes > 0
      ? this.totalErreurs / this.totalRequetes
      : 0;

    return {
      state: this.state,
      totalRequetes: this.totalRequetes,
      totalErreurs: this.totalErreurs,
      tauxErreur,
      dernierChangementEtat: this.dernierChangementEtat,
      requetesEnCours: this.requetesEnCours,
    };
  }

  /** Force la réinitialisation du circuit (pour tests ou administration). */
  reset(): void {
    this.state = "CLOSED";
    this.totalRequetes = 0;
    this.totalErreurs = 0;
    this.fenetreRequetes = 0;
    this.fenetreErreurs = 0;
    this.dernierChangementEtat = Date.now();
    this.requetesEnCours = 0;
    this.testsHalfOpen = 0;
  }
}

// ============================================================
// REGISTRE DES CIRCUITS (singleton par canal)
// ============================================================

const circuits = new Map<string, CircuitBreaker>();

/** Récupère ou crée un circuit breaker pour un canal donné. */
export function getCircuit(canal: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  let circuit = circuits.get(canal);
  if (!circuit) {
    circuit = new CircuitBreaker(canal, { ...DEFAULTS, ...options });
    circuits.set(canal, circuit);
  }
  return circuit;
}

/** Retourne les statistiques de tous les circuits. */
export function getAllCircuitStats(): Record<string, CircuitStats> {
  const stats: Record<string, CircuitStats> = {};
  for (const [canal, circuit] of circuits) {
    stats[canal] = circuit.getStats();
  }
  return stats;
}
