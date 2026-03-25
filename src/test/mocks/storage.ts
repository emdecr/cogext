// ============================================================================
// MOCK STORAGE PROVIDER
// ============================================================================
//
// The real storage provider writes files to disk (local) or MinIO (prod).
// In tests, we want neither — filesystem side effects make tests brittle
// and slow.
//
// This mock stores files in a Map (in process memory) and resets between
// tests. It mirrors the interface of the real storage provider so the
// same application code works with either.
//
// Primarily used for integration tests that exercise the upload flow
// end-to-end without hitting real infrastructure.
//
// Usage:
//   beforeEach(() => mockStorageProvider.clear())
//   // Upload a file
//   await mockStorageProvider.upload(Buffer.from("..."), "photo.jpg")
//   // Check it was stored
//   expect(mockStorageProvider.has("photo.jpg")).toBe(true)
// ============================================================================

import { vi } from "vitest";

// In-memory file store — maps filename → file bytes
const fileStore = new Map<string, Buffer>();

export const mockStorageProvider = {
  // upload: store the buffer and return the path the app would use
  upload: vi.fn().mockImplementation(async (buffer: Buffer, filename: string) => {
    fileStore.set(filename, buffer);
    // Return the same path format the real provider would return.
    // In Phase 7 this becomes /api/uploads/:filename.
    return `/uploads/${filename}`;
  }),

  // get: retrieve a stored file by filename
  get: vi.fn().mockImplementation(async (filename: string): Promise<Buffer | null> => {
    return fileStore.get(filename) ?? null;
  }),

  // delete: remove a stored file
  delete: vi.fn().mockImplementation(async (filename: string) => {
    fileStore.delete(filename);
  }),

  // has: check if a file was uploaded (useful in assertions)
  has: (filename: string) => fileStore.has(filename),

  // clear: reset between tests
  // Call this in beforeEach() to prevent test pollution
  clear: () => {
    fileStore.clear();
    mockStorageProvider.upload.mockClear();
    mockStorageProvider.get.mockClear();
    mockStorageProvider.delete.mockClear();
  },
};
