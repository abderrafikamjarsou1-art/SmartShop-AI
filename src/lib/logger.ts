/**
 * Structured logger.
 * - development: pretty, colorized console output
 * - production: single-line JSON (parsed by Vercel log drains / Datadog / Axiom)
 *
 * Zero dependencies. If the project later needs transports/sampling,
 * swap the internals for pino without changing any call site (SOLID: DIP).
 */

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",  // cyan
  warn: "\x1b[33m",  // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

function log(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();

  if (isProd) {
    // JSON logs: machine-readable, greppable, drain-friendly
    const entry = JSON.stringify({ level, timestamp, message, ...context });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
    return;
  }

  // Dev logs: human-readable
  const color = COLORS[level];
  const prefix = `${color}[${level.toUpperCase()}]${RESET} ${timestamp}`;
  const args: unknown[] = [`${prefix} ${message}`];
  if (context && Object.keys(context).length > 0) args.push(context);

  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export const logger = {
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext & { error?: unknown }) => {
    // Normalize Error objects so stack traces survive JSON serialization
    if (context?.error instanceof Error) {
      const { error, ...rest } = context;
      log("error", message, {
        ...rest,
        errorName: error.name,
        errorMessage: error.message,
        stack: isProd ? error.stack : undefined,
      });
      if (!isProd) console.error(error);
      return;
    }
    log("error", message, context);
  },
};
