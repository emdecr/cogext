// ============================================================================
// UNIT TESTS — Environment Configuration
// ============================================================================
//
// config.ts is tricky to test because it runs validation at MODULE LOAD TIME
// — the moment the file is imported, it reads process.env and throws if
// anything is wrong. This is by design (fail fast), but it means we can't
// just import { config } at the top of this test file and use it normally.
//
// KEY TECHNIQUE: vi.resetModules() + dynamic import
//   Standard imports are cached — once loaded, the module won't re-run.
//   vi.resetModules() clears the module registry, so the NEXT import()
//   call will execute the module fresh, re-running all the startup checks
//   with whatever process.env values we've set.
//
//   Pattern:
//     beforeEach(() => { vi.resetModules() })
//     it("throws when X is missing", async () => {
//       delete process.env.X
//       await expect(import("@/lib/config")).rejects.toThrow("...")
//     })
//
// NOTE: We save and restore process.env between tests to prevent leakage.
//   If test A sets DATABASE_URL and doesn't clean up, test B may pass
//   or fail based on test A's side effects — a "flaky test" nightmare.
// ============================================================================

describe("config", () => {
  // Store the original env to restore after each test
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Snapshot the current env
    originalEnv = { ...process.env };

    // Reset the module registry so config.ts re-runs on each dynamic import
    vi.resetModules();

    // Set a complete valid env as the baseline.
    // Individual tests will delete or change specific vars to test failure cases.
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test_db";
    process.env.JWT_SECRET = "a-very-long-secret-that-is-at-least-32-characters";
    process.env.VOYAGE_API_KEY = "test-voyage-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.STORAGE_PROVIDER = "local";

    // Ensure production checks are off unless a test turns them on
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  afterEach(() => {
    // Restore original env — crucial to prevent test pollution
    process.env = originalEnv;
  });

  // ---- Required variables ----

  it("throws a clear error when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("@/lib/config")).rejects.toThrow(
      "Missing required environment variable: DATABASE_URL"
    );
  });

  it("throws a clear error when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;

    await expect(import("@/lib/config")).rejects.toThrow(
      "Missing required environment variable: JWT_SECRET"
    );
  });

  it("throws a clear error when VOYAGE_API_KEY is missing", async () => {
    delete process.env.VOYAGE_API_KEY;

    await expect(import("@/lib/config")).rejects.toThrow(
      "Missing required environment variable: VOYAGE_API_KEY"
    );
  });

  it("throws a clear error when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(import("@/lib/config")).rejects.toThrow(
      "Missing required environment variable: ANTHROPIC_API_KEY"
    );
  });

  it("loads successfully when all required vars are set", async () => {
    // Should NOT throw
    const { config } = await import("@/lib/config");

    expect(config.db.url).toBe("postgres://test:test@localhost:5432/test_db");
    expect(config.auth.jwtSecret).toBe(
      "a-very-long-secret-that-is-at-least-32-characters"
    );
    expect(config.voyage.apiKey).toBe("test-voyage-key");
    expect(config.chat.anthropicApiKey).toBe("test-anthropic-key");
  });

  // ---- Optional variables with defaults ----

  it("uses default embed model when EMBED_MODEL is not set", async () => {
    delete process.env.EMBED_MODEL;
    const { config } = await import("@/lib/config");
    expect(config.voyage.embedModel).toBe("voyage-4-lite");
  });

  it("uses EMBED_MODEL when set", async () => {
    process.env.EMBED_MODEL = "custom-model";
    const { config } = await import("@/lib/config");
    expect(config.voyage.embedModel).toBe("custom-model");
  });

  it("defaults storage provider to 'local'", async () => {
    delete process.env.STORAGE_PROVIDER;
    const { config } = await import("@/lib/config");
    expect(config.storage.provider).toBe("local");
  });

  // ---- Production secret strength checks ----
  // These only run when NODE_ENV=production

  it("throws in production when JWT_SECRET is shorter than 32 chars", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.JWT_SECRET = "short"; // Only 5 chars

    await expect(import("@/lib/config")).rejects.toThrow(
      "JWT_SECRET must be at least 32 characters in production"
    );
  });

  it("throws in production when JWT_SECRET is a known default value", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    // This is the exact string someone might copy-paste from .env.example
    process.env.JWT_SECRET = "dev-secret-change-me-in-production";

    await expect(import("@/lib/config")).rejects.toThrow(
      "JWT_SECRET is set to a known default value"
    );
  });

  it("accepts a strong JWT_SECRET in production", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    // 64-char hex strings — what openssl rand -hex 32 produces
    process.env.JWT_SECRET =
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    process.env.CRON_SECRET =
      "f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1";

    // Should NOT throw
    await expect(import("@/lib/config")).resolves.toBeDefined();
  });

  it("throws in production when CRON_SECRET is missing", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.JWT_SECRET =
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    delete process.env.CRON_SECRET;

    await expect(import("@/lib/config")).rejects.toThrow(
      "CRON_SECRET must be set and at least 32 characters in production"
    );
  });

  it("throws in production when CRON_SECRET is too short", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.JWT_SECRET =
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    process.env.CRON_SECRET = "too-short";

    await expect(import("@/lib/config")).rejects.toThrow(
      "CRON_SECRET must be set and at least 32 characters in production"
    );
  });

  // ---- MinIO storage validation ----

  it("throws when STORAGE_PROVIDER=minio but STORAGE_ENDPOINT is missing", async () => {
    process.env.STORAGE_PROVIDER = "minio";
    process.env.STORAGE_ACCESS_KEY = "minioadmin";
    process.env.STORAGE_SECRET_KEY = "minioadmin";
    process.env.STORAGE_PUBLIC_URL = "http://localhost:9000";
    // STORAGE_ENDPOINT intentionally missing

    await expect(import("@/lib/config")).rejects.toThrow(
      "STORAGE_PROVIDER=minio requires STORAGE_ENDPOINT to be set"
    );
  });

  it("loads successfully when all MinIO vars are set", async () => {
    process.env.STORAGE_PROVIDER = "minio";
    process.env.STORAGE_ENDPOINT = "http://minio:9000";
    process.env.STORAGE_ACCESS_KEY = "minioadmin";
    process.env.STORAGE_SECRET_KEY = "minioadmin";
    process.env.STORAGE_PUBLIC_URL = "http://localhost:9000";

    const { config } = await import("@/lib/config");
    expect(config.storage.provider).toBe("minio");
    expect(config.storage.endpoint).toBe("http://minio:9000");
  });
});
