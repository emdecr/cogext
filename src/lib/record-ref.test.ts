import { describe, expect, it } from "vitest";
import {
  escapeRecordRefLabel,
  extractRecordRefIds,
  isRecordType,
  parseRecordRefHref,
  recordRefIcon,
} from "@/lib/record-ref";

const id = "3f2a9c1e-1b2c-4d5e-8f90-123456789abc";

describe("parseRecordRefHref", () => {
  it("extracts the id from a record link", () => {
    expect(parseRecordRefHref(`/records/${id}`)).toBe(id);
  });

  it("tolerates a trailing slash, query, or hash and normalizes case", () => {
    expect(parseRecordRefHref(`/records/${id.toUpperCase()}/`)).toBe(id);
    expect(parseRecordRefHref(`/records/${id}?x=1`)).toBe(id);
    expect(parseRecordRefHref(`/records/${id}#top`)).toBe(id);
  });

  it("rejects anything that isn't a same-site record link", () => {
    expect(parseRecordRefHref(null)).toBeNull();
    expect(parseRecordRefHref("/records/abc")).toBeNull();
    expect(parseRecordRefHref(`https://evil.example/records/${id}`)).toBeNull();
    expect(parseRecordRefHref(`/records/${id}/edit`)).toBeNull();
  });
});

describe("record ref helpers", () => {
  it("escapes brackets and backslashes in labels", () => {
    expect(escapeRecordRefLabel("A [b] \\ c")).toBe("A \\[b\\] \\\\ c");
  });

  it("maps types to icons with a generic fallback", () => {
    expect(recordRefIcon("book")).toBe("📖");
    expect(recordRefIcon(null)).toBe("↗");
    expect(recordRefIcon("spaceship")).toBe("↗");
  });

  it("recognizes record types", () => {
    expect(isRecordType("book")).toBe(true);
    expect(isRecordType("spaceship")).toBe(false);
    expect(isRecordType("toString")).toBe(false);
  });
});

describe("extractRecordRefIds", () => {
  const other = "a1b2c3d4-0000-4000-8000-000000000001";

  it("returns ids in order of first appearance, deduped and lowercased", () => {
    const text = `See [B](/records/${other} "note") and [A](/records/${id.toUpperCase()}), then [B again](/records/${other}).`;
    expect(extractRecordRefIds(text)).toEqual([other, id]);
  });

  it("requires an id boundary", () => {
    expect(extractRecordRefIds(`/records/${id}-extra`)).toEqual([]);
    expect(extractRecordRefIds(`/records/${id}`)).toEqual([id]);
  });

  it("handles empty input", () => {
    expect(extractRecordRefIds(null)).toEqual([]);
    expect(extractRecordRefIds("")).toEqual([]);
  });
});
