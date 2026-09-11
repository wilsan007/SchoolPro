/**
 * EcolPro — Logger structuré
 * ============================================================
 *
 * INF-3 (audit v2) : journalisation structurée pour la production.
 *
 * Pourquoi pas pino/winston ?
 * - Next.js App Router fonctionne en Edge et Node ; un logger externe
 *   ajoute une dépendance et une surface de sérialisation.
 * - Le format JSON structuré est trivial à produire avec `JSON.stringify`.
 * - En production, les logs sont captés par stdout (Vercel, Docker, Fly).
 *
 * Format de sortie : une ligne JSON par log, compatible avec les
 * agrégateurs standards (Loki, Datadog, Elasticsearch).
 *
 * Niveaux : debug, info, warn, error.
 * En production (NODE_ENV=production), debug est silencieux.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
