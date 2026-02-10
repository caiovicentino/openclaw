// ---------------------------------------------------------------------------
// Structured logger for the enterprise module.
//
// - No external dependencies (no pino/winston).
// - JSON output in production, human-readable in development.
// - Verbosity controlled via LOG_LEVEL env var (default: "info").
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (env in LEVEL_VALUES) return env as LogLevel;
  return "info";
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_VALUES[level] < LEVEL_VALUES[currentLevel()]) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const output = isDev()
    ? `[${entry.timestamp}] ${level.toUpperCase()} ${message}${
        context && Object.keys(context).length > 0 ? " " + JSON.stringify(context) : ""
      }`
    : JSON.stringify(entry);

  if (level === "error" || level === "warn") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    emit("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    emit("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>): void {
    emit("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    emit("error", message, context);
  },
};
