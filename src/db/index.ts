// Database connection file
// This creates a single, reusable connection to Postgres
// that all our queries will go through.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// The connection string tells the driver WHERE and HOW to connect.
// Format: postgres://USER:PASSWORD@HOST:PORT/DATABASE
//
// We read it from an environment variable so we never hardcode credentials.
// In dev, this comes from .env.local (which Next.js loads automatically).
// In production, it comes from your hosting platform's env config.
//
// The `!` at the end is a TypeScript non-null assertion — it tells TS
// "trust me, this value exists." We add an explicit check below so we
// get a clear error message instead of a cryptic connection failure.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local:\n" +
      "DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE"
  );
}

// Create the underlying Postgres connection pool.
// This is the "driver" — it handles the actual TCP connection,
// sending SQL over the wire, and parsing responses.
//
// A connection POOL keeps multiple connections open and reuses them,
// instead of opening a new TCP connection for every query. Opening
// a connection takes ~5-20ms, so a page with 5 queries would waste
// 25-100ms just on connections without pooling.
const client = postgres(connectionString, {
  // Max connections in the pool. 10 is fine for local dev.
  // In production, tune based on VPS resources and concurrent load.
  max: 10,
});

// Wrap the driver with Drizzle.
// This gives us the type-safe query builder on top of the raw connection.
// We pass `schema` so Drizzle knows about our tables and can
// provide autocomplete and type checking on queries.
export const db = drizzle(client, { schema });
