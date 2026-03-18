// ============================================================================
// POST /api/auth/login
// ============================================================================
//
// Authenticates an existing user. Compares the submitted password
// against the stored bcrypt hash, and if it matches, creates a session.
//
// Security note: We return the SAME error message for "email not found"
// and "wrong password." This prevents USER ENUMERATION — an attacker
// can't figure out which emails are registered by trying different ones
// and seeing which get "user not found" vs "wrong password."
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";

// Generic error message — intentionally vague for security.
const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(request: NextRequest) {
  try {
    // ---- 1. Parse and validate ----
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // ---- 2. Look up the user by email ----
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    // User not found — but we don't say that.
    if (!user) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS },
        { status: 401 } // 401 = Unauthorized
      );
    }

    // ---- 3. Verify the password ----
    // bcrypt hashes the submitted password with the same salt that was
    // used when the user registered, then compares the results.
    const isValid = await verifyPassword(password, user.passwordHash);

    // Wrong password — same message as "user not found."
    if (!isValid) {
      return NextResponse.json(
        { error: INVALID_CREDENTIALS },
        { status: 401 }
      );
    }

    // ---- 4. Create a session ----
    await setSession(user.id);

    // ---- 5. Return success ----
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
