// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================
//
// This module is the single source of truth for all environment variables.
//
// Why centralize this?
//   1. Fail fast: if a required var is missing, we get a clear error at startup
//      ("Missing required env var: JWT_SECRET") instead of a cryptic error
//      deep inside a request (TypeError: Cannot read property of undefined).
//   2. Type safety: callers get typed config values, not `string | undefined`.
//   3. Discoverability: one file lists every env var the app uses.
//   4. Single validation point: instead of each file doing its own
//      `if (!process.env.X) throw new Error(...)`.
//
// Usage:
//   import { config } from "@/lib/config"
//   config.db.url        // string
//   config.auth.jwtSecret   // string
//   config.storage.provider // "local" | "minio"
//
// Important: this module runs on the SERVER only (env vars are not exposed
// to the browser). Never import it in client components.
// =============================================================================

// =============================================================================
// HELPER: require an env var or throw a clear error
// =============================================================================
// This is the key building block. It reads the var and throws immediately
// if it's not set — not later when the value is used.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Check your .env file (dev) or .env.prod file (production).`
    );
  }
  return value;
}

// =============================================================================
// HELPER: optional env var with a default fallback
// =============================================================================
function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

// =============================================================================
// CONFIG OBJECT
// =============================================================================
// Grouped by concern so callers can import only what they need.
// Built lazily — the `config` object is constructed when first imported.
// If any required var is missing, the server crashes on startup with a
// clear error message rather than at request time.
// =============================================================================

export const config = {
  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------
  db: {
    // Full Postgres connection string.
    // Dev:  postgres://cogext:cogext@localhost:5435/cogext
    // Prod: postgres://cogext:STRONG_PASS@db:5432/cogext
    //       Note "db" — the Docker service name, not "localhost"
    url: requireEnv("DATABASE_URL"),
  },

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------
  auth: {
    // Secret used to sign JWT tokens. Changing this invalidates all sessions.
    // Generate a strong one with: openssl rand -hex 32
    jwtSecret: requireEnv("JWT_SECRET"),
  },

  // ---------------------------------------------------------------------------
  // AI — Embeddings (Voyage AI)
  // ---------------------------------------------------------------------------
  voyage: {
    // Voyage AI API key. Required for generating embeddings.
    // Get your key at https://dash.voyageai.com/
    apiKey: requireEnv("VOYAGE_API_KEY"),

    // The embedding model name.
    embedModel: optionalEnv("EMBED_MODEL", "voyage-4-lite"),
  },

  // ---------------------------------------------------------------------------
  // AI — Chat + Tagging (Anthropic Claude)
  // ---------------------------------------------------------------------------
  chat: {
    // Anthropic API key. Required for chat, tagging, image analysis, etc.
    // Get your key at https://console.anthropic.com/settings/keys
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),

    // Claude model to use for chat and reflections.
    model: optionalEnv("CHAT_MODEL", "claude-sonnet-4-6"),
  },

  // ---------------------------------------------------------------------------
  // File Storage
  // ---------------------------------------------------------------------------
  storage: {
    // Which storage backend to use.
    // "local" → filesystem at public/uploads/ (dev only, not available in prod Docker)
    // "minio" → S3-compatible MinIO (prod)
    //
    // Why not use NODE_ENV for this?
    //   NODE_ENV=production doesn't mean MinIO. You might want local storage
    //   on a dev machine that happens to run NODE_ENV=production. Explicit is better.
    provider: optionalEnv("STORAGE_PROVIDER", "local") as "local" | "minio",

    // --- MinIO / S3 settings (only needed when provider = "minio") ---

    // The internal MinIO API endpoint.
    // Dev:  not used
    // Prod: http://minio:9000  (Docker service name, internal network)
    endpoint: process.env.STORAGE_ENDPOINT,

    // MinIO credentials (match MINIO_ROOT_USER / MINIO_ROOT_PASSWORD in compose).
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,

    // The bucket name where files are stored. Create this once in MinIO console.
    bucket: optionalEnv("STORAGE_BUCKET", "cogext-uploads"),

    // The public-facing base URL for serving files.
    // This is what gets prepended to filenames when building <img src> URLs.
    // Could be:
    //   https://files.yourdomain.com   (Nginx proxies to MinIO)
    //   http://your-vps-ip:9000/cogext-uploads  (direct, less ideal)
    // The stored DB value (imagePath) becomes: publicUrl + "/" + filename
    publicUrl: process.env.STORAGE_PUBLIC_URL,
  },

  // ---------------------------------------------------------------------------
  // App
  // ---------------------------------------------------------------------------
  app: {
    // The public URL of your app. Used for generating absolute URLs (e.g.,
    // in emails, webhooks, or cron job callbacks).
    // Dev:  http://localhost:3000
    // Prod: https://yourdomain.com
    url: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),

    // Secret token for protecting cron job endpoints (Phase 5).
    // Cron callers must include this in the Authorization header.
    // Generate with: openssl rand -hex 32
    cronSecret: process.env.CRON_SECRET,
  },
};

// =============================================================================
// VALIDATE SECRETS STRENGTH
// =============================================================================
// These checks run at module load time (server startup). They prevent the app
// from running with weak or default secrets that could compromise security.
//
// Why fail at startup instead of logging a warning?
//   A warning gets buried in logs. A crash forces you to fix it before
//   the server accepts any traffic. For secrets, this is the right trade-off.
//
// In development (NODE_ENV !== "production"), we skip these checks so you
// can use simple values like "dev-secret" without friction.
// =============================================================================
if (process.env.NODE_ENV === "production") {
  // JWT_SECRET must be at least 32 characters (256 bits of entropy when hex).
  // Shorter secrets are vulnerable to brute-force attacks.
  // The common default "dev-secret-change-me-in-production" is explicitly
  // rejected in case someone copies .env.example verbatim.
  if (config.auth.jwtSecret.length < 32) {
    throw new Error(
      `JWT_SECRET must be at least 32 characters in production.\n` +
        `Generate one with: openssl rand -hex 32`
    );
  }

  const knownDefaults = [
    "dev-secret-change-me-in-production",
    "dev-secret",
    "secret",
    "changeme",
  ];
  if (knownDefaults.includes(config.auth.jwtSecret.toLowerCase())) {
    throw new Error(
      `JWT_SECRET is set to a known default value. This is not safe for production.\n` +
        `Generate a strong one with: openssl rand -hex 32`
    );
  }
}

// =============================================================================
// VALIDATE MINIO CONFIG
// =============================================================================
// If STORAGE_PROVIDER=minio, the S3-specific vars become required.
// We check this at module load time so misconfiguration fails at startup.
if (config.storage.provider === "minio") {
  const required = [
    "STORAGE_ENDPOINT",
    "STORAGE_ACCESS_KEY",
    "STORAGE_SECRET_KEY",
    "STORAGE_PUBLIC_URL",
  ];
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(
        `STORAGE_PROVIDER=minio requires ${name} to be set.\n` +
          `Check your .env.prod file.`
      );
    }
  }
}
