// ============================================================================
// MOCK STORAGE PROVIDER
// ============================================================================
//
// The real storage provider writes files to disk (local) or MinIO (prod).
// In tests, we want neither — filesystem side effects make tests brittle
// and slow.
//
// This mock mirrors the REAL interface of src/lib/storage/index.ts so the
// same application code works with either. Keep the method names and return
// shapes in sync with that module:
//
//   saveFile(file)                     → Promise<string>  ("/uploads/<uuid>.<ext>")
//   saveBuffer(buffer, ext, contentType) → Promise<string>
//   deleteFile(urlPath)                → Promise<void>
//   getPublicUrl(urlPath)              → string
//
// Files are stored in an in-process Map keyed by the returned path, so tests
// can assert what was written without touching real infrastructure.
//
// Usage:
//   vi.mock("@/lib/storage", () => import("@/test/mocks/storage"))
//   beforeEach(() => resetStorageMock())
//   const url = await saveFile(new File([bytes], "photo.jpg"))
//   expect(mockStorageFiles.has(url)).toBe(true)
// ============================================================================

import { vi } from "vitest";

// In-memory file store — maps the returned path → file bytes.
export const mockStorageFiles = new Map<string, Buffer>();

// Deterministic counter so returned paths are stable and unique per test.
let counter = 0;

// saveFile: store the bytes and return the path the app would persist in the DB.
export const saveFile = vi.fn(async (file: File): Promise<string> => {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `/uploads/mock-${counter++}.${ext}`;
  mockStorageFiles.set(path, Buffer.from(await file.arrayBuffer()));
  return path;
});

// saveBuffer: same, for the post-compression path where we already have bytes.
export const saveBuffer = vi.fn(
  async (buffer: Buffer, ext: string, _contentType: string): Promise<string> => {
    const path = `/uploads/mock-${counter++}.${ext}`;
    mockStorageFiles.set(path, buffer);
    return path;
  }
);

// deleteFile: remove a stored file. Safe to call for a missing file (no throw),
// matching the real provider's forgiving behavior.
export const deleteFile = vi.fn(async (urlPath: string): Promise<void> => {
  mockStorageFiles.delete(urlPath);
});

// getPublicUrl: the stored path is already a usable URL in tests — return as-is.
export const getPublicUrl = vi.fn((urlPath: string): string => urlPath);

// reset: clear the store and spy history between tests.
export function resetStorageMock() {
  mockStorageFiles.clear();
  counter = 0;
  saveFile.mockClear();
  saveBuffer.mockClear();
  deleteFile.mockClear();
  getPublicUrl.mockClear();
}
