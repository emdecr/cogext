// ============================================================================
// RECORD MARKERS — inline record links in AI output
// ============================================================================
//
// Reflections and chat both show the model a list of records, each prefixed
// with a short marker (R1, R2, …), and tell it to cite a record inline as a
// markdown link with the marker as the URL:
//
//   [that essay on focus](R7)
//
// These helpers turn those links into real record URLs (`](/records/<uuid>)`).
// A marker that isn't in the map is a hallucination — the link wrapper is
// stripped but the visible text kept, so the sentence still reads. Markers
// only ever exist in the prompt/response; nothing marker-shaped is stored.
// ============================================================================

// A complete marker link: [text](R12). Link text can't contain brackets or a
// newline — keeps the match tight and lets the stream resolver (below) decide
// quickly that a `[` isn't the start of a marker link.
const MARKER_LINK_RE = /\[([^[\]\n]+)\]\((R\d+)\)/g;

// The tail of a buffer that could still grow into a marker link: `[`, `[text`,
// `[text]`, `[text](`, `[text](R`, `[text](R12`.
const PARTIAL_MARKER_LINK_RE = /\[[^[\]\n]*(?:\](?:\((?:R\d*)?)?)?$/;

// Longest tail we'll hold back waiting for a link to finish. Past this it's
// not a citation (link text is a short phrase) — flush it so the stream
// never stalls on a stray `[`.
const MAX_PENDING_LENGTH = 300;

export function resolveRecordMarkers(
  markdown: string,
  markerToId: Map<string, string>
): string {
  return markdown.replace(MARKER_LINK_RE, (_full, text: string, marker: string) => {
    const id = markerToId.get(marker);
    return id ? `[${text}](/records/${id})` : text;
  });
}

// Streaming version for chat. Resolves markers as chunks arrive, holding back
// only a trailing fragment that might be a marker link split across chunks —
// so the client never sees a raw `(R3)` and never has to re-render a link.
export async function* resolveRecordMarkersInStream(
  chunks: AsyncIterable<string>,
  markerToId: Map<string, string>
): AsyncGenerator<string> {
  let pending = "";

  for await (const chunk of chunks) {
    pending += chunk;

    const partial = PARTIAL_MARKER_LINK_RE.exec(pending);
    const holdFrom =
      partial && pending.length - partial.index <= MAX_PENDING_LENGTH
        ? partial.index
        : pending.length;

    const ready = pending.slice(0, holdFrom);
    pending = pending.slice(holdFrom);
    if (ready) yield resolveRecordMarkers(ready, markerToId);
  }

  if (pending) yield resolveRecordMarkers(pending, markerToId);
}
