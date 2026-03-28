// =============================================================================
// IMAGE COMPRESSION
// =============================================================================
//
// Compresses uploaded images before storage using sharp.
// Goal: reduce file size for a small server (2GB Linode) without visible
// quality loss. Also shrinks weekly backup sizes.
//
// Strategy:
//   - Resize to max 1600px on the longest side (plenty for a personal app)
//   - Convert to WebP at quality 80 (~30-50% smaller than JPEG)
//   - Skip GIFs to preserve animation frames
//
// A typical 4MB phone photo becomes ~200-400KB after compression.
//
// sharp is the fastest Node.js image library — it wraps libvips (C library)
// and processes images in constant memory via streaming. It's also the engine
// behind Next.js built-in <Image> optimization.
// =============================================================================

import sharp from "sharp";

export interface CompressedImage {
  /** The compressed image data */
  data: Buffer;
  /** File extension (e.g. "webp", "gif") */
  ext: string;
  /** MIME type (e.g. "image/webp", "image/gif") */
  mime: string;
}

/**
 * Compress an image buffer for storage.
 *
 * - Resizes to fit within 1600x1600 (maintains aspect ratio, never enlarges)
 * - Converts to WebP at quality 80
 * - GIFs pass through unmodified (sharp would flatten animated frames)
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string
): Promise<CompressedImage> {
  // Don't compress GIFs — sharp would strip animation frames.
  // GIF uploads are rare in this app and usually small anyway.
  if (mimeType === "image/gif") {
    return { data: buffer, ext: "gif", mime: "image/gif" };
  }

  const compressed = await sharp(buffer)
    // fit: "inside" scales down to fit within the box, maintaining aspect ratio.
    // withoutEnlargement: true means a 800px image stays 800px (no upscaling).
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    // WebP at quality 80 is visually indistinguishable from the original
    // but typically 30-50% smaller than equivalent JPEG.
    .webp({ quality: 80 })
    .toBuffer();

  return { data: compressed, ext: "webp", mime: "image/webp" };
}
