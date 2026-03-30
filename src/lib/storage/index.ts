// =============================================================================
// FILE STORAGE ABSTRACTION
// =============================================================================
//
// This module provides a unified interface for file storage. The rest of
// the app calls saveFile(), deleteFile(), getPublicUrl() and never knows
// (or cares) whether files are on the local filesystem or in MinIO.
//
// Backends:
//   local  — writes to public/uploads/ on disk. Next.js serves these
//            as static files at /uploads/*. Dev only.
//   minio  — uploads to MinIO via the S3 API. Files are served from
//            STORAGE_PUBLIC_URL (e.g. https://files.yourdomain.com). Prod.
//
// The backend is selected by the STORAGE_PROVIDER env var (see config.ts).
//
// Why this pattern (provider abstraction)?
//   - Decouples app logic from infrastructure
//   - Switching from local → MinIO → real S3 requires zero changes to upload
//     routes, record actions, or components
//   - Easy to mock in tests
// =============================================================================

import { config } from "@/lib/config";

// -----------------------------------------------------------------------------
// Shared constants (used by the upload API route for validation)
// -----------------------------------------------------------------------------

// Maximum file size in bytes (5MB). Enforced at the API route boundary.
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed image MIME types.
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// =============================================================================
// LOCAL BACKEND
// =============================================================================
// Used in development. Files are written to the public/uploads/ directory
// which Next.js serves as static assets at /uploads/*.
// =============================================================================

// Lazy-loaded Node.js modules. We import these only when the local backend
// is active so they don't get bundled/imported in prod (where they're unused).
async function getLocalModules() {
  const { writeFile, unlink, mkdir } = await import("fs/promises");
  const path = await import("path");
  const { randomUUID } = await import("crypto");
  return { writeFile, unlink, mkdir, path, randomUUID };
}

async function saveFileLocal(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "jpg";
  return saveBufferLocal(buffer, ext, file.type);
}

async function saveBufferLocal(
  buffer: Buffer,
  ext: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contentType: string
): Promise<string> {
  const { writeFile, mkdir, path, randomUUID } = await getLocalModules();

  const uploadDir = path.join(process.cwd(), "public", "uploads");

  // Create the uploads directory if it doesn't exist.
  // recursive: true makes this idempotent (like mkdir -p).
  await mkdir(uploadDir, { recursive: true });

  // UUID filename prevents collisions: two "photo.jpg" uploads get
  // different names.
  const filename = `${randomUUID()}.${ext}`;
  const filepath = path.join(uploadDir, filename);

  await writeFile(filepath, buffer);

  // Return a URL path. "/uploads/abc.jpg" is served by Next.js static files.
  // This value is stored in records.image_path.
  return `/uploads/${filename}`;
}

async function deleteFileLocal(urlPath: string): Promise<void> {
  const { unlink, path } = await getLocalModules();

  // Convert URL path back to filesystem path.
  // "/uploads/abc.jpg" → "/path/to/project/public/uploads/abc.jpg"
  const filename = path.basename(urlPath);
  const filepath = path.join(process.cwd(), "public", "uploads", filename);

  try {
    await unlink(filepath);
  } catch {
    // File already deleted — not an error worth crashing over.
    // We warn (not error) so it shows up in logs if unexpected.
    console.warn(`[storage] Local file not found for deletion: ${filepath}`);
  }
}

function getPublicUrlLocal(urlPath: string): string {
  // In local dev, the URL path IS the public URL — Next.js serves it.
  // Nothing to prepend.
  return urlPath;
}

// =============================================================================
// MINIO BACKEND
// =============================================================================
// Used in production. Files are uploaded to MinIO via the S3-compatible API.
// MinIO stores them at STORAGE_ENDPOINT/STORAGE_BUCKET/filename.
// They're served at STORAGE_PUBLIC_URL/filename (via Nginx or direct).
//
// Why @aws-sdk/client-s3?
//   MinIO implements the same HTTP API as AWS S3. The AWS SDK works unchanged —
//   you just point it at your MinIO server instead of amazonaws.com.
//   No MinIO-specific SDK needed.
//
// Why forcePathStyle: true?
//   S3 normally uses bucket subdomains: my-bucket.s3.amazonaws.com/key
//   MinIO doesn't support subdomain buckets — it uses path-style URLs:
//   minio:9000/my-bucket/key
//   forcePathStyle forces the SDK to use path-style URLs.
// =============================================================================

// Lazy singleton: the S3Client is created only on first use (not at module
// load time) and reused across requests. This avoids creating a new connection
// pool on every upload.
let _s3Client: import("@aws-sdk/client-s3").S3Client | null = null;

async function getS3Client() {
  if (_s3Client) return _s3Client;

  const { S3Client } = await import("@aws-sdk/client-s3");

  _s3Client = new S3Client({
    // The internal MinIO endpoint (Docker service name in prod).
    endpoint: config.storage.endpoint!,

    // MinIO ignores the region value, but the S3 SDK requires it.
    region: "us-east-1",

    credentials: {
      accessKeyId: config.storage.accessKey!,
      secretAccessKey: config.storage.secretKey!,
    },

    // Required for MinIO — use path-style URLs (endpoint/bucket/key)
    // instead of subdomain-style (bucket.endpoint/key).
    forcePathStyle: true,
  });

  return _s3Client;
}

async function saveFileMinio(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "jpg";
  return saveBufferMinio(buffer, ext, file.type);
}

async function saveBufferMinio(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { randomUUID } = await import("crypto");

  const s3 = await getS3Client();

  const filename = `${randomUUID()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
      // ContentLength helps S3 validate the upload; avoids chunked encoding issues.
      ContentLength: buffer.byteLength,
    })
  );

  // Return the public-facing URL for this file.
  // STORAGE_PUBLIC_URL is the base (e.g. https://files.yourdomain.com/cogext-uploads).
  // The stored value in records.image_path will be the full URL.
  return `${config.storage.publicUrl}/${filename}`;
}

async function deleteFileMinio(urlOrKey: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

  const s3 = await getS3Client();

  // Extract just the filename from either a full URL or a bare key.
  // "https://files.example.com/cogext-uploads/abc.jpg" → "abc.jpg"
  const filename = urlOrKey.split("/").pop()!;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.storage.bucket,
        Key: filename,
      })
    );
  } catch (error) {
    console.warn(`[storage] MinIO delete failed for key "${filename}":`, error);
  }
}

function getPublicUrlMinio(urlOrKey: string): string {
  // If it's already a full URL (starts with http), return as-is.
  if (urlOrKey.startsWith("http")) return urlOrKey;

  // Otherwise treat it as a bare key and prepend the public base URL.
  return `${config.storage.publicUrl}/${urlOrKey}`;
}

// =============================================================================
// PUBLIC API — provider-agnostic exports
// =============================================================================
// These are the only functions the rest of the app should call.
// They route to the correct backend based on STORAGE_PROVIDER.
// =============================================================================

/**
 * Save an uploaded file to storage.
 * Returns the stored path/URL — save this in records.image_path.
 *
 * Local:  returns "/uploads/abc.jpg"
 * MinIO:  returns "https://files.yourdomain.com/cogext-uploads/abc.jpg"
 */
export async function saveFile(file: File): Promise<string> {
  if (config.storage.provider === "minio") {
    return saveFileMinio(file);
  }
  return saveFileLocal(file);
}

/**
 * Save a raw buffer to storage. Used after image compression where we
 * already have the processed bytes and know the file extension/MIME type.
 *
 * @param buffer - The file data
 * @param ext - File extension without dot (e.g. "webp", "gif")
 * @param contentType - MIME type (e.g. "image/webp")
 */
export async function saveBuffer(
  buffer: Buffer,
  ext: string,
  contentType: string
): Promise<string> {
  if (config.storage.provider === "minio") {
    return saveBufferMinio(buffer, ext, contentType);
  }
  return saveBufferLocal(buffer, ext, contentType);
}

/**
 * Delete a file from storage.
 * Accepts the same value returned by saveFile().
 * Safe to call if the file doesn't exist (logs a warning, doesn't throw).
 */
export async function deleteFile(urlPath: string): Promise<void> {
  if (config.storage.provider === "minio") {
    return deleteFileMinio(urlPath);
  }
  return deleteFileLocal(urlPath);
}

/**
 * Get the public URL for serving a file.
 * In most cases the stored imagePath is already a public URL,
 * but this function is here as an explicit conversion point in case
 * you ever store bare keys in the DB.
 */
export function getPublicUrl(urlPath: string): string {
  if (config.storage.provider === "minio") {
    return getPublicUrlMinio(urlPath);
  }
  return getPublicUrlLocal(urlPath);
}
