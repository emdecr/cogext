// ============================================================================
// POST /api/auth/register
// ============================================================================
//
// This is a Next.js "Route Handler." In the App Router, a file named
// `route.ts` inside the `app/` directory becomes an API endpoint.
// The path maps directly from the file system:
//   src/app/api/auth/register/route.ts  →  POST /api/auth/register
//
// We export named functions matching HTTP methods: GET, POST, PUT, DELETE, etc.
// Next.js calls the matching function when a request comes in.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zxcvbn } from "zxcvbn-typescript";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";
import { registerLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ============================================================================
// INPUT VALIDATION SCHEMA
// ============================================================================
//
// Zod gives us runtime type checking with clear error messages.
// This replaces the manual if-checks with a declarative schema.
//
// Why Zod instead of manual validation?
//   - Composable: you can reuse schemas across routes
//   - Type inference: TypeScript knows the parsed result is safe
//   - Clear errors: .safeParse() returns structured error objects
//   - Battle-tested: widely used in the Next.js ecosystem
//
// z.string().email() checks RFC 5322 compliance — much more robust than
// the previous `includes("@")` check, which would accept "@@@" as valid.
const registerSchema = z.object({
  email: z
    .string()
    .email("Invalid email format")
    .transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters"),
});

export async function POST(request: NextRequest) {
  // Rate limit by IP — prevents mass account creation from a single source.
  // 5 registrations per hour is generous for a real user, tight for a bot.
  const ip = getClientIp(request);
  const rl = registerLimiter(ip);
  if (!rl.success) return rateLimitResponse(rl);

  try {
    // ---- 1. Parse the request body ----
    // The client sends JSON: { email: "...", password: "..." }
    // request.json() parses it into a JavaScript object.
    const body = await request.json();

    // ---- 2. Validate input with Zod ----
    // Zod's .safeParse() validates the input against our schema and returns
    // either { success: true, data } or { success: false, error }.
    // Unlike .parse(), it doesn't throw — we handle the error ourselves.
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      // Zod errors are structured. We grab the first error message for a
      // clean user-facing response. The full error object is available in
      // parsed.error.issues if you need all of them.
      const firstError = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { email, password } = parsed.data;

    // ---- 2b. Password strength check with zxcvbn ----
    // zxcvbn is a password strength estimator created by Dropbox.
    // Unlike simple regex rules (must have uppercase + number + symbol),
    // it actually understands password patterns:
    //   - Dictionary words ("password" → score 0)
    //   - Keyboard patterns ("qwerty123" → score 0)
    //   - Common substitutions ("p@ssw0rd" → score 0)
    //   - Date patterns ("march2024" → score 1)
    //   - Repeated characters ("aaaaaaaaaa" → score 0)
    //
    // Scores range from 0 (terrible) to 4 (excellent).
    // We require score >= 2 (moderate), which rejects the obvious stuff
    // while being practical for real users.
    //
    // We pass the email as a "user input" so zxcvbn penalizes passwords
    // that contain parts of the email (e.g., email "alice@..." password "alice123...").
    const strength = zxcvbn(password, [email]);
    if (strength.score < 2) {
      // zxcvbn provides helpful feedback we can relay to the user.
      // feedback.warning is a human-readable string like
      // "This is a commonly used password" or "Straight rows of keys are easy to guess".
      const feedback =
        strength.feedback.warning ||
        strength.feedback.suggestions[0] ||
        "Password is too weak. Try a longer, more unique password.";
      return NextResponse.json({ error: feedback }, { status: 400 });
    }

    // ---- 3. Check if email is already registered ----
    // Drizzle query: SELECT * FROM users WHERE email = ? LIMIT 1
    // We use the relational query API here (.query.users.findFirst)
    // which returns a single object or undefined.
    // Note: email is already lowercased by the Zod transform above.
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 } // 409 = Conflict (resource already exists)
      );
    }

    // ---- 4. Hash the password ----
    // NEVER store plain-text passwords. bcrypt produces a one-way hash
    // that can't be reversed. See password.ts for details.
    const passwordHash = await hashPassword(password);

    // ---- 5. Insert the user into the database ----
    // Drizzle query: INSERT INTO users (email, password_hash) VALUES (?, ?)
    // .returning() tells Postgres to send back the inserted row,
    // so we get the auto-generated id and created_at without a second query.
    const [newUser] = await db
      .insert(users)
      .values({
        email, // already lowercased by Zod transform
        passwordHash,
      })
      .returning();

    // ---- 6. Create a session ----
    // This creates a JWT and sets it as an HTTP-only cookie.
    // After this, the browser will send the cookie with every request.
    await setSession(newUser.id);

    // ---- 7. Return success ----
    // We return the user data (minus the password hash!) so the
    // frontend can use it immediately without another request.
    // 201 = Created (a new resource was successfully created).
    return NextResponse.json(
      {
        user: {
          id: newUser.id,
          email: newUser.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // ---- Error handling ----
    // Log the full error for debugging, but send a generic message
    // to the client. Never expose internal error details — they can
    // reveal database structure, file paths, or other sensitive info.
    logger.error("Registration request failed", { ip, error });
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 } // 500 = Internal Server Error
    );
  }
}
