// ============================================================================
// needsImageAnalysis — which records get image analysis before a retag
// ============================================================================
// Pure decision; the DB/AI modules the file imports are stubbed so this runs
// without Postgres or provider keys. tagRecord itself is covered by
// src/lib/actions/tags-regenerate.integration.test.ts.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/ai", () => ({}));
vi.mock("@/lib/ai/analyze-image", () => ({ analyzeImage: vi.fn() }));
vi.mock("@/lib/ai/embed-record", () => ({ embedRecord: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ logAiOutcome: vi.fn() }));

import { needsImageAnalysis } from "@/lib/ai/tag-record";

const image = { type: "image", imagePath: "/uploads/a.jpg" };

describe("needsImageAnalysis", () => {
  it("is true for an image still on the placeholder", () => {
    expect(needsImageAnalysis({ ...image, content: "Image" })).toBe(true);
    expect(needsImageAnalysis({ ...image, content: "  image " })).toBe(true);
  });

  it("is true for an image with empty content", () => {
    expect(needsImageAnalysis({ ...image, content: "" })).toBe(true);
    expect(needsImageAnalysis({ ...image, content: "   " })).toBe(true);
  });

  it("is false once an image has a real description", () => {
    expect(
      needsImageAnalysis({ ...image, content: "A red bicycle by a river" }),
    ).toBe(false);
  });

  it("is false for an image record with no file", () => {
    expect(
      needsImageAnalysis({ type: "image", imagePath: null, content: "Image" }),
    ).toBe(false);
  });

  it("is false for non-image records, whatever the content", () => {
    expect(
      needsImageAnalysis({ type: "note", imagePath: null, content: "Image" }),
    ).toBe(false);
  });
});
