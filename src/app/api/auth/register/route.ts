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
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    // ---- 1. Parse the request body ----
    // The client sends JSON: { email: "...", password: "..." }
    // request.json() parses it into a JavaScript object.
    const body = await request.json();
    const { email, password } = body;

    // ---- 2. Validate input ----
    // Basic server-side validation. NEVER trust the client —
    // even if the frontend has validation, someone can send
    // requests directly with curl or Postman.
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 } // 400 = Bad Request
      );
    }

    // Simple email format check. In production you'd want a
    // more robust validation library (like zod — we'll add that later).
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Minimum password length. 8 characters is a common baseline.
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // ---- 3. Check if email is already registered ----
    // Drizzle query: SELECT * FROM users WHERE email = ? LIMIT 1
    // We use the relational query API here (.query.users.findFirst)
    // which returns a single object or undefined.
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
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
        email: email.toLowerCase(), // normalize to lowercase
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
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 } // 500 = Internal Server Error
    );
  }
}
