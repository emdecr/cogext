// =============================================================================
// STRUCTURED LOGGER
// =============================================================================
//
// Replaces scattered `console.error/warn/log` calls with structured logging.
//
// Why structured logging matters in production:
//   `console.error("Login error:", error)` → unqueryable string in logs
//   `logger.error("Login failed", { ip, error })` → JSON with named fields
//
//   Log collectors (Loki, Datadog, CloudWatch) can then filter:
//     level=error AND route=/api/auth/login AND ip=1.2.3.4
//   You can't do that with free-text strings.
//
// Output format:
//   Development (NODE_ENV !== "production"):
//     [ERROR] 2026-03-24T02:00:00.000Z  Login failed  { ip: "1.2.3.4" }
//
//   Production (NODE_ENV === "production"):
//     {"level":"error","time":"2026-03-24T02:00:00.000Z","msg":"Login failed","ip":"1.2.3.4"}
//
// One line per log entry. Docker captures all stdout/stderr from containers.
// Pipe docker logs to your preferred collector:
//   docker logs cogext-app-1 | your-log-shipper
//
// Usage:
//   import { logger } from "@/lib/logger"
//   logger.info("Server started", { port: 3000 })
//   logger.warn("Rate limit approached", { userId, remaining: 1 })
//   logger.error("DB query failed", { route: "/api/chat", error })
// =============================================================================

// Log levels in increasing severity order.
type LogLevel = "debug" | "info" | "warn" | "error";

// Context fields — anything serializable. Pass whatever is relevant:
// userId, route, ip, duration, recordId, error, etc.
type LogContext = Record<string, unknown>;

// =============================================================================
// ERROR SERIALIZATION
// =============================================================================
// `JSON.stringify(new Error("foo"))` returns `"{}"` — Error properties are
// non-enumerable. We extract the important fields manually.
//
// We also handle non-Error thrown values (strings, numbers, plain objects)
// because JavaScript allows throwing anything: `throw "oops"`.

function serializeError(err: unknown): Record<string, string | undefined> {
  if (err instanceof Error) {
    return {
      errorName: err.name,              // "TypeError", "Error", etc.
      errorMessage: err.message,        // the human-readable message
      // Include stack in development only — it's verbose and usually not
      // useful in production logs (line numbers change with minification).
      ...(process.env.NODE_ENV !== "production" && { errorStack: err.stack }),
    };
  }

  // Thrown non-Error value (bad practice but it happens)
  return { errorMessage: String(err) };
}

// =============================================================================
// CORE LOG FUNCTION
// =============================================================================

const isProd = process.env.NODE_ENV === "production";

// Dev-mode level prefixes with color codes (ANSI escape codes).
// These only show in terminals — stripped by log collectors.
const DEV_PREFIX: Record<LogLevel, string> = {
  debug: "\x1b[90m[DEBUG]\x1b[0m", // gray
  info:  "\x1b[36m[INFO] \x1b[0m", // cyan
  warn:  "\x1b[33m[WARN] \x1b[0m", // yellow
  error: "\x1b[31m[ERROR]\x1b[0m", // red
};

function log(level: LogLevel, msg: string, ctx?: LogContext): void {
  // Extract and serialize the `error` field if present, so it expands
  // properly rather than showing as [object Error].
  const { error: rawError, ...rest } = ctx ?? {};
  const errorFields = rawError !== undefined ? serializeError(rawError) : {};

  if (isProd) {
    // Production: one JSON line per log entry.
    // Log collectors parse this and index the fields.
    const entry = {
      level,
      time: new Date().toISOString(),
      msg,
      ...rest,         // caller-supplied context (userId, ip, route, etc.)
      ...errorFields,  // serialized error fields (errorName, errorMessage)
    };

    // Route to console.error for error/warn so Docker captures them on stderr
    // (useful for alerting on stderr), and console.log for info/debug.
    if (level === "error" || level === "warn") {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  } else {
    // Development: human-readable with the level prefix and timestamp.
    // The context object is pretty-printed separately for readability.
    const time = new Date().toISOString();
    const prefix = DEV_PREFIX[level];
    const contextStr = {
      ...rest,
      ...errorFields,
    };
    const hasContext = Object.keys(contextStr).length > 0;

    if (level === "error") {
      console.error(prefix, time, msg, hasContext ? contextStr : "");
    } else if (level === "warn") {
      console.warn(prefix, time, msg, hasContext ? contextStr : "");
    } else {
      console.log(prefix, time, msg, hasContext ? contextStr : "");
    }
  }
}

// =============================================================================
// PUBLIC LOGGER INTERFACE
// =============================================================================
// Simple object with methods for each log level.
// Intentionally NOT a class — no instantiation, no `this` context needed.

export const logger = {
  // Fine-grained diagnostic info. Off by default in production.
  // Use for things like "entered function X with args Y" during debugging.
  debug(msg: string, ctx?: LogContext): void {
    // Skip debug logs in production to reduce noise.
    if (isProd) return;
    log("debug", msg, ctx);
  },

  // Normal operational events. "Server started", "Migration complete".
  info(msg: string, ctx?: LogContext): void {
    log("info", msg, ctx);
  },

  // Something unexpected happened but the app recovered.
  // "AI tagging failed, skipping tags", "File not found on deletion".
  warn(msg: string, ctx?: LogContext): void {
    log("warn", msg, ctx);
  },

  // Something failed that requires attention.
  // DB query failed, external API unreachable, unhandled exception.
  error(msg: string, ctx?: LogContext): void {
    log("error", msg, ctx);
  },
};
