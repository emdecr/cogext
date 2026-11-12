import {
  INLINE_FILTER_TYPES,
  SHELF_FILTER,
  SHELF_FILTER_TYPES,
  isShelfFilter,
  matchesTypeFilter,
} from "@/lib/type-filter";

describe("type filter", () => {
  it("splits creatable types into inline pills and the Shelf menu", () => {
    expect(INLINE_FILTER_TYPES).toEqual(["note", "quote", "link", "image"]);
    expect(SHELF_FILTER_TYPES).toEqual(["book", "movie", "show", "music"]);
  });

  it("null matches everything", () => {
    expect(matchesTypeFilter("note", null)).toBe(true);
    expect(matchesTypeFilter("movie", null)).toBe(true);
  });

  it("'shelf' matches every shelf type and nothing else", () => {
    for (const t of ["book", "movie", "show", "music"]) {
      expect(matchesTypeFilter(t, SHELF_FILTER)).toBe(true);
    }
    for (const t of ["note", "quote", "link", "image", "article"]) {
      expect(matchesTypeFilter(t, SHELF_FILTER)).toBe(false);
    }
  });

  it("a single type matches only itself", () => {
    expect(matchesTypeFilter("movie", "movie")).toBe(true);
    expect(matchesTypeFilter("show", "movie")).toBe(false);
  });

  it("treats 'shelf' and single shelf types as a Shelf filter", () => {
    expect(isShelfFilter(SHELF_FILTER)).toBe(true);
    expect(isShelfFilter("book")).toBe(true);
    expect(isShelfFilter("note")).toBe(false);
    expect(isShelfFilter(null)).toBe(false);
  });
});
