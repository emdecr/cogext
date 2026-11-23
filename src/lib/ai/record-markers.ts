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
//
// If a link's text runs past MAX_PENDING_LENGTH we stream the `[text` part
// anyway (so a stray `[` can't stall the reply) but remember the link is still
// open: `pending` restarts with CONTINUATION, a stand-in for the text already
// sent, so a `](R3)` that arrives later still resolves.
const CONTINUATION = "[…";
const CONTINUED_LINK_RE = /^\[…([^[\]\n]*)\]\((R\d+)\)/;

export async function* resolveRecordMarkersInStream(
  chunks: AsyncIterable<string>,
  markerToId: Map<string, string>
): AsyncGenerator<string> {
  let pending = "";
  let continuing = false;

  const drain = (final: boolean): string => {
    let out = "";

    if (continuing) {
      const closed = CONTINUED_LINK_RE.exec(pending);
      if (closed) {
        // The `[text` is already on the client, so a hallucinated marker can't
        // have its bracket removed — close it as plain `[text]` instead.
        const id = markerToId.get(closed[2]);
        out += closed[1] + (id ? `](/records/${id})` : "]");
        pending = pending.slice(closed[0].length);
        continuing = false;
      } else if (!final && PARTIAL_MARKER_LINK_RE.exec(pending)?.index === 0) {
        // Still inside the open link. Keep holding unless the text keeps
        // running long, in which case stream it and stay open.
        if (pending.length <= MAX_PENDING_LENGTH) return out;
        const tail = pending.slice(CONTINUATION.length);
        const labelEnd = tail.includes("]") ? tail.indexOf("]") : tail.length;
        out += tail.slice(0, labelEnd);
        pending = CONTINUATION + tail.slice(labelEnd);
        return out;
      } else {
        // Not a marker link after all — drop the stand-in and carry on.
        pending = pending.slice(CONTINUATION.length);
        continuing = false;
      }
    }

    if (final) {
      out += resolveRecordMarkers(pending, markerToId);
      pending = "";
      return out;
    }

    const partial = PARTIAL_MARKER_LINK_RE.exec(pending);
    if (!partial) {
      out += resolveRecordMarkers(pending, markerToId);
      pending = "";
      return out;
    }

    out += resolveRecordMarkers(pending.slice(0, partial.index), markerToId);
    const tail = pending.slice(partial.index);

    if (tail.length <= MAX_PENDING_LENGTH) {
      pending = tail;
    } else {
      // Overlong: stream the `[text`, hold whatever follows it, stay open.
      const labelEnd = tail.includes("]") ? tail.indexOf("]") : tail.length;
      out += tail.slice(0, labelEnd);
      pending = CONTINUATION + tail.slice(labelEnd);
      continuing = true;
    }
    return out;
  };

  for await (const chunk of chunks) {
    pending += chunk;
    const out = drain(false);
    if (out) yield out;
  }

  const out = drain(true);
  if (out) yield out;
}
