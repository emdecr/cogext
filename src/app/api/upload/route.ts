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
import { saveBuffer, MAX_FILE_SIZE, ALLOWED_TYPES } from "@/lib/storage";
import { compressImage } from "@/lib/storage/compress";
import { getSession } from "@/lib/auth/session";
import { uploadLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ============================================================================
// ALLOWED FILE SIGNATURES (MAGIC BYTES)
// ============================================================================
//
// Every file format has a unique byte sequence at the beginning called a
// "magic number" or "file signature." These are baked into the format spec
// and can't be spoofed without breaking the file.
//
// Why check magic bytes instead of just MIME type?
//   The browser sets the MIME type based on the file extension, which is
//   trivially spoofable: rename malware.exe → image.jpg and the browser
//   sends "image/jpeg". Magic bytes verify the ACTUAL file content.
//
// Format signatures:
//   JPEG: starts with FF D8 FF (always)
//   PNG:  starts with 89 50 4E 47 (the letters "PNG" preceded by 0x89)
//   GIF:  starts with "GIF87a" or "GIF89a" (ASCII)
//   WebP: starts with "RIFF" at offset 0 and "WEBP" at offset 8
//
// We only need to check the first 12 bytes of the file.
// ============================================================================
// Magic byte signatures for image format validation.
// hasValidMagicBytes checks these inline for readability:
//   JPEG: FF D8 FF
//   PNG:  89 50 4E 47
//   GIF:  "GIF87a" or "GIF89a"
//   WebP: "RIFF" at offset 0, "WEBP" at offset 8

/**
 * Verify that a file's actual bytes match a known image format.
 * Returns true if the file is a genuine image, false if spoofed.
 */
function hasValidMagicBytes(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer).slice(0, 12);

  // Check JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;

  // Check PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;

  // Check GIF: "GIF87a" or "GIF89a"
  const gifHeader = String.fromCharCode(...bytes.slice(0, 6));
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return true;

  // Check WebP: "RIFF" at offset 0 + "WEBP" at offset 8
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === "RIFF" && webp === "WEBP") return true;

  return false;
}

export async function POST(request: NextRequest) {
  // ---- Auth check ----
  // Even though middleware protects the page, API routes should
  // independently verify auth. A malicious user could call this
  // endpoint directly without going through the UI.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by user ID — prevents one user from flooding storage.
  const rl = uploadLimiter(session.userId);
  if (!rl.success) return rateLimitResponse(rl);

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

    // ---- Validate file type (two layers) ----
    //
    // Layer 1: MIME type check (fast, catches honest mistakes)
    // The browser sets this based on the file extension. It's easy to spoof
    // but catches the 99% case of a user accidentally selecting a .pdf.
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Layer 2: Magic byte check (thorough, catches spoofing)
    // Read the first 12 bytes of the file and compare against known
    // image format signatures. This verifies the ACTUAL file content,
    // not just what the browser claims it is.
    //
    // Why both layers? MIME check is fast and gives a good error message
    // ("you uploaded a PDF"). Magic bytes are the real security gate.
    const fileBuffer = await file.arrayBuffer();
    if (!hasValidMagicBytes(fileBuffer)) {
      logger.warn("Upload rejected: MIME type passed but magic bytes failed", {
        userId: session.userId,
        claimedType: file.type,
        fileName: file.name,
      });
      return NextResponse.json(
        { error: "File content doesn't match a valid image format" },
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

    // ---- Compress the image ----
    // Resize to max 1600px, convert to WebP at quality 80.
    // GIFs pass through unmodified to preserve animation.
    // A typical 4MB phone photo → ~200-400KB WebP.
    const rawBuffer = Buffer.from(fileBuffer);
    const { data, ext, mime } = await compressImage(rawBuffer, file.type);

    logger.info("Image compressed", {
      userId: session.userId,
      originalSize: rawBuffer.byteLength,
      compressedSize: data.byteLength,
      reduction: `${Math.round((1 - data.byteLength / rawBuffer.byteLength) * 100)}%`,
      format: ext,
    });

    // ---- Save the compressed file ----
    const path = await saveBuffer(data, ext, mime);

    // Return the public URL path. The client will use this as the
    // imagePath when creating the record.
    return NextResponse.json({ path });
  } catch (error) {
    logger.error("File upload failed", { userId: session.userId, error });
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}
