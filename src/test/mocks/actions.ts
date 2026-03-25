// ============================================================================
// MOCK SERVER ACTIONS
// ============================================================================
//
// Server Actions (createRecord, updateRecord, etc.) are server-side functions
// that client components call directly. In a test environment, they can't
// actually run — they'd try to connect to the database.
//
// This file provides reusable vi.fn() stubs with sensible defaults.
// Instead of writing vi.mock() boilerplate in every component test file,
// import and use these.
//
// Usage in a test file:
//
//   // 1. Tell Vitest to use our mocks instead of the real modules
//   vi.mock("@/lib/actions/records", () => ({
//     createRecord: mockCreateRecord,
//     updateRecord: mockUpdateRecord,
//     deleteRecord: mockDeleteRecord,
//   }))
//
//   // 2. Override the return value for a specific test
//   it("shows error when save fails", async () => {
//     mockCreateRecord.mockResolvedValueOnce({ success: false, error: "DB error" })
//     // ... render and interact ...
//   })
//
//   // 3. Verify the action was called
//   expect(mockCreateRecord).toHaveBeenCalledWith(expect.objectContaining({
//     type: "note",
//     content: "Hello world",
//   }))
//
// "mockResolvedValueOnce" overrides just ONE call, then reverts to the default.
// This is safer than mockResolvedValue (which changes ALL future calls).
// ============================================================================

import { vi } from "vitest";

// ---- Records ----
// Default: success with a fake record ID
export const mockCreateRecord = vi.fn().mockResolvedValue({
  success: true,
  recordId: "test-record-id",
});

export const mockUpdateRecord = vi.fn().mockResolvedValue({
  success: true,
});

export const mockDeleteRecord = vi.fn().mockResolvedValue({
  success: true,
});

// ---- Tags ----
export const mockAddTagToRecord = vi.fn().mockResolvedValue({
  success: true,
});

export const mockRemoveTagFromRecord = vi.fn().mockResolvedValue({
  success: true,
});

// ---- Collections ----
export const mockCreateCollection = vi.fn().mockResolvedValue({
  success: true,
  collectionId: "test-collection-id",
});

// ---- Helper: reset all mocks between tests ----
// Call this in a beforeEach() if you need a clean slate.
// Prevents call counts from leaking between tests.
export function resetActionMocks() {
  mockCreateRecord.mockClear();
  mockUpdateRecord.mockClear();
  mockDeleteRecord.mockClear();
  mockAddTagToRecord.mockClear();
  mockRemoveTagFromRecord.mockClear();
  mockCreateCollection.mockClear();
}
