import { describe, expect, it } from "vitest";
import {
  resolveRecordMarkers,
  resolveRecordMarkersInStream,
} from "@/lib/ai/record-markers";

const A = "3f2a9c1e-1b2c-4d5e-8f90-123456789abc";
const B = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
const markers = new Map([
  ["R1", A],
  ["R2", B],
]);

async function* from(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

async function collect(chunks: string[]) {
  const out: string[] = [];
  for await (const piece of resolveRecordMarkersInStream(from(chunks), markers)) {
    out.push(piece);
  }
  return out;
}

describe("resolveRecordMarkers", () => {
  it("rewrites known markers to record URLs", () => {
    expect(resolveRecordMarkers("See [the essay](R1) and [the quote](R2).", markers)).toBe(
      `See [the essay](/records/${A}) and [the quote](/records/${B}).`
    );
  });

  it("strips a hallucinated marker but keeps the text", () => {
    expect(resolveRecordMarkers("A [ghost](R9) here.", markers)).toBe("A ghost here.");
  });

  it("leaves ordinary links and bracketed text alone", () => {
    const text = "[site](https://example.com), [R1] and (R1) as prose.";
    expect(resolveRecordMarkers(text, markers)).toBe(text);
  });
});

describe("resolveRecordMarkersInStream", () => {
  it("resolves a marker link split across chunks", async () => {
    const out = await collect(["Loved [the ", "essay](", "R", "1) a lot."]);
    expect(out.join("")).toBe(`Loved [the essay](/records/${A}) a lot.`);
    // The raw marker never reaches the client.
    expect(out.some((piece) => piece.includes("(R"))).toBe(false);
  });

  it("streams text before a pending link straight away", async () => {
    const out = await collect(["Hello there [the", " essay](R2)"]);
    expect(out[0]).toBe("Hello there ");
    expect(out.join("")).toBe(`Hello there [the essay](/records/${B})`);
  });

  it("flushes a bracket that turns out not to be a link", async () => {
    const out = await collect(["Note [", "aside] then more"]);
    expect(out.join("")).toBe("Note [aside] then more");
    expect(out.at(-1)).toBe("Note [aside] then more".slice("Note ".length));
  });

  it("flushes an unfinished link at the end of the stream", async () => {
    expect((await collect(["Cut off [mid", "-link](R"])).join("")).toBe("Cut off [mid-link](R");
  });

  it("doesn't hold back a long run after a stray bracket", async () => {
    const long = "x".repeat(400);
    const out = await collect([`[${long}`, " tail"]);
    expect(out[0]).toBe(`[${long}`);
  });
});
