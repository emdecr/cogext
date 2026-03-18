// ============================================================================
// FILE STORAGE ABSTRACTION
// ============================================================================
//
// This module abstracts file storage so the rest of the app doesn't care
// WHERE files are stored — local filesystem, S3, MinIO, etc.
//
// In dev: files go to `public/uploads/` and are served by Next.js.
// In prod: you'd swap this to an S3-compatible implementation.
//
// The app code always calls these functions and never touches the
// filesystem or S3 SDK directly. Swapping storage backends is a change
// to THIS file only — no other code needs to know.
//
// Why this pattern matters:
//   - Decouples your app logic from infrastructure
//   - Makes testing easier (you can mock storage)
//   - Lets you change hosting without rewriting upload/download code
// ============================================================================

import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// ============================================================================
// CONFIGURATION
// ============================================================================

// The directory where uploaded files are stored on disk.
// `process.cwd()` returns the project root (where package.json lives).
// We store inside `public/` so Next.js serves them as static files.
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Maximum file size in bytes (5MB).
// We enforce this in the upload API route, but having it here as a
// shared constant keeps things consistent.
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Allowed image MIME types. We check this on upload to prevent
// users from uploading non-image files (or malicious files
// disguised as images).
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// ============================================================================
// SAVE FILE
// ============================================================================
// Takes a File object (from a form upload), saves it to disk, and returns
// the public URL path.
//
// The returned path is relative to the public directory, like
// "/uploads/a1b2c3d4-photo.jpg". This path can be:
//   - Stored in the database (records.imagePath)
//   - Used directly in <img src="..."> tags
//
// We generate a unique filename using UUID to prevent collisions.
// Two users uploading "photo.jpg" get different filenames.

export async function saveFile(file: File): Promise<string> {
  // Ensure the upload directory exists. `recursive: true` means it
  // creates parent directories too (like `mkdir -p`). This is
  // idempotent — does nothing if the directory already exists.
  await mkdir(UPLOAD_DIR, { recursive: true });

  // Generate a unique filename: uuid + original extension.
  // path.extname("photo.jpg") returns ".jpg"
  const ext = path.extname(file.name) || ".jpg";
  const filename = `${randomUUID()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // Convert the Web API File/Blob to a Node.js Buffer.
  // File.arrayBuffer() returns the raw binary data, which we wrap
  // in a Buffer (Node's binary data type) for writeFile.
  const buffer = Buffer.from(await file.arrayBuffer());

  // Write the file to disk.
  await writeFile(filepath, buffer);

  // Return the public URL path (not the filesystem path).
  // "/uploads/abc.jpg" maps to "public/uploads/abc.jpg" on disk.
  return `/uploads/${filename}`;
}

// ============================================================================
// DELETE FILE
// ============================================================================
// Removes a file from storage. Called when a record is deleted.
// Takes the same path format returned by saveFile ("/uploads/abc.jpg").

export async function deleteFile(urlPath: string): Promise<void> {
  // Convert the URL path back to a filesystem path.
  // "/uploads/abc.jpg" → "/path/to/project/public/uploads/abc.jpg"
  const filename = path.basename(urlPath);
  const filepath = path.join(UPLOAD_DIR, filename);

  try {
    await unlink(filepath);
  } catch (error) {
    // File might already be deleted — that's fine, don't crash.
    // Log it so we can investigate if it happens unexpectedly.
    console.warn(`Failed to delete file ${filepath}:`, error);
  }
}

// ============================================================================
// GET PUBLIC URL
// ============================================================================
// In local dev, the path IS the URL (Next.js serves /public as /).
// In production with S3, you'd prepend the CDN/bucket URL here.
// This function exists so the rest of the app doesn't need to know
// about the URL structure.

export function getPublicUrl(urlPath: string): string {
  // In dev, the path is already a valid URL
  // In prod, you'd do something like:
  // return `https://cdn.yourdomain.com${urlPath}`;
  return urlPath;
}
