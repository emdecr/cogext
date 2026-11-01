import { describe, expect, it } from "vitest";
import { mergeConnections } from "@/lib/connections";
import type { RelatedRecord } from "@/lib/validations/records";

const rec = (id: string): RelatedRecord => ({
  id,
  type: "note",
  title: id,
  preview: "",
  imagePath: null,
  sourceAuthor: null,
});

const link = (id: string, note: string | null = null) => ({
  linkId: `link-${id}`,
  note,
  record: rec(id),
});

describe("mergeConnections", () => {
  it("dedupes a record that is linked and mentioned both ways", () => {
    const merged = mergeConnections({
      connections: [link("a", "why")],
      mentionsIn: [rec("a")],
      mentionsOut: [rec("a")],
    });
    expect(merged).toEqual([
      {
        record: rec("a"),
        link: { linkId: "link-a", note: "why" },
        mentionsThis: true,
        mentionedHere: true,
      },
    ]);
  });

  it("orders linked+mentioned, then linked, then mention-only", () => {
    const merged = mergeConnections({
      connections: [link("linked1"), link("both"), link("linked2")],
      mentionsIn: [rec("in"), rec("both")],
      mentionsOut: [rec("out"), rec("in")],
    });
    expect(merged.map((c) => c.record.id)).toEqual([
      "both",
      "linked1",
      "linked2",
      "in",
      "out",
    ]);
    const inOnly = merged.find((c) => c.record.id === "in");
    expect(inOnly).toMatchObject({ mentionsThis: true, mentionedHere: true });
    expect(inOnly?.link).toBeUndefined();
  });

  it("returns nothing for no inputs", () => {
    expect(
      mergeConnections({ connections: [], mentionsIn: [], mentionsOut: [] }),
    ).toEqual([]);
  });
});
