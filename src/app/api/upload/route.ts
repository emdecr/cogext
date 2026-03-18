// ============================================================================
// FILE UPLOAD API ROUTE
// ============================================================================
//
// POST /api/upload
//
// Receives a file via multipart form data, validates it, saves it to
// storage, and returns the public URL path.
//
// Why an API route instead of a server action?
//   - More control over the request (we can read headers, set status codes)
//   - Better for binary data (files) vs structured data (JSON)
//   - Can set explicit size limits via the request body
//   - Standard REST pattern that works with any client (not just React)
//
// The response returns { path: "/uploads/abc.jpg" } which the client
// then includes when creating a record (records.imagePath).
//
// Flow:
//   1. Client opens file picker → selects image
//   2. Client sends POST /api/upload with the file as FormData
//   3. This route validates the file (type, size)
//   4. Saves it to storage (local filesystem in dev)
//   5. Returns the public URL path
//   6. Client creates a record with imagePath = the returned path
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { saveFile, MAX_FILE_SIZE, ALLOWED_TYPES } from "@/lib/storage";
import { getSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  // ---- Auth check ----
  // Even though middleware protects the page, API routes should
  // independently verify auth. A malicious user could call this
  // endpoint directly without going through the UI.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ---- Parse the form data ----
    // request.formData() parses the multipart/form-data body.
    // We expect a single file field named "file".
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // ---- Validate file type ----
    // Check the MIME type against our allowlist. This is a basic check —
    // a determined attacker could spoof the MIME type, but combined with
    // the file extension check in storage, it catches most mistakes.
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // ---- Validate file size ----
    if (file.size > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Maximum size: ${maxMB}MB` },
        { status: 400 },
      );
    }

    // ---- Save the file ----
    const path = await saveFile(file);

    // Return the public URL path. The client will use this as the
    // imagePath when creating the record.
    return NextResponse.json({ path });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}
