// ============================================================================
// PASSWORD HASHING
// ============================================================================
//
// We NEVER store plain-text passwords. Instead we store a "hash" — a
// one-way transformation that can't be reversed back to the original.
//
// bcrypt is the go-to algorithm for password hashing because:
//   1. It's intentionally SLOW (configurable via "salt rounds"), making
//      brute-force attacks impractical. Each guess takes ~100ms instead
//      of nanoseconds.
//   2. It automatically generates and embeds a random "salt" — a random
//      string mixed into the hash. This means two users with the same
//      password get DIFFERENT hashes, defeating pre-computed lookup tables
//      (called "rainbow tables").
//   3. The output contains everything needed to verify later: the
//      algorithm version, the salt rounds, the salt itself, and the hash.
//
// What a bcrypt hash looks like:
//   $2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
//    │  │  └── salt + hash (combined)
//    │  └── cost factor (10 = 2^10 = 1024 iterations)
//    └── algorithm version
// ============================================================================

import bcrypt from "bcryptjs";

// Salt rounds = the "cost factor." Higher = slower = more secure.
// 12 is a good balance: ~250ms to hash on modern hardware.
// For context: 10 = ~100ms, 12 = ~250ms, 14 = ~1s.
// An attacker trying billions of passwords gets slowed to a crawl.
const SALT_ROUNDS = 12;

/**
 * Hash a plain-text password for storage.
 * Call this during registration (and when a user changes their password).
 *
 * @example
 *   const hash = await hashPassword("mySecurePassword123");
 *   // Store `hash` in the database — never the original password.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain-text password against a stored hash.
 * Call this during login to verify the user's identity.
 *
 * bcrypt.compare() hashes the attempt with the SAME salt that was used
 * originally (it extracts the salt from the stored hash), then compares.
 *
 * @example
 *   const isValid = await verifyPassword("mySecurePassword123", storedHash);
 *   if (!isValid) throw new Error("Wrong password");
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
