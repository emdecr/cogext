// ============================================================================
// UNIT TESTS — admin Data tab health signals
// ============================================================================

import {
  classifyEmbeddingModels,
  deriveDataWarnings,
  percentOf,
} from "@/lib/data-health";

describe("classifyEmbeddingModels", () => {
  it("labels groups against the current model and sorts current first", () => {
    const out = classifyEmbeddingModels(
      [
        { model: "voyage-3-lite", count: 4 },
        { model: null, count: 1 },
        { model: "voyage-4-lite", count: 40 },
        { model: "voyage-3", count: 9 },
      ],
      "voyage-4-lite"
    );
    expect(out.map((m) => [m.model, m.status])).toEqual([
      ["voyage-4-lite", "current"],
      ["voyage-3", "stale"],
      ["voyage-3-lite", "stale"],
      [null, "unlabeled"],
    ]);
  });

  it("handles no embedded records", () => {
    expect(classifyEmbeddingModels([], "voyage-4-lite")).toEqual([]);
  });
});

describe("deriveDataWarnings", () => {
  const healthy = {
    missingEmbedding: 0,
    untagged: 0,
    staleEmbedding: 0,
    currentModel: "voyage-4-lite",
  };

  it("is empty when everything is healthy", () => {
    expect(deriveDataWarnings(healthy)).toEqual([]);
  });

  it("missing embeddings are an error (search can't see them)", () => {
    const [w] = deriveDataWarnings({ ...healthy, missingEmbedding: 3 });
    expect(w.level).toBe("error");
    expect(w.message).toMatch(/^3 records have no embedding/);
  });

  it("uses singular grammar for one record", () => {
    const [w] = deriveDataWarnings({ ...healthy, untagged: 1 });
    expect(w.message).toBe(
      "1 record has no tags. Auto-tagging may have failed for it."
    );
  });

  it("stale embeddings and untagged records are warnings, in order", () => {
    const out = deriveDataWarnings({
      ...healthy,
      missingEmbedding: 2,
      staleEmbedding: 5,
      untagged: 4,
    });
    expect(out.map((w) => w.level)).toEqual(["error", "warning", "warning"]);
    expect(out[1].message).toMatch(/different model than voyage-4-lite/);
  });
});

describe("percentOf", () => {
  it("rounds, flags tiny shares, and guards an empty total", () => {
    expect(percentOf(1, 3)).toBe("33%");
    expect(percentOf(1, 1000)).toBe("<1%");
    expect(percentOf(0, 10)).toBe("0%");
    expect(percentOf(5, 0)).toBe("—");
  });
});
