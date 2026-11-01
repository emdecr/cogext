// ============================================================================
// UNIFIED CONNECTIONS — merge links + mentions into one list
// ============================================================================
//
// The record page shows one "Connections" section: manual record_links plus
// records related through inline refs, in either direction. A record appears
// once, with flags for each way it's connected (the card renders them as
// badges). Presentation only — links and mentions stay separate in the data.
//
// Order: linked first (those that are also mentioned lead), then mention-only.
// Within a group the input orders are kept (links as getRecordConnections
// returns them, then incoming mentions, then outgoing).
// See plans/2026-11-01-unified-connections.md.
// ============================================================================

import type {
  RecordConnection,
  RelatedRecord,
} from "@/lib/validations/records";

export type UnifiedConnection = {
  record: RelatedRecord;
  // Present when a manual record_links row exists (either direction).
  link?: { linkId: string; note: string | null };
  // The other record refs this one in its content/note.
  mentionsThis: boolean;
  // This record refs the other one in its content/note.
  mentionedHere: boolean;
};

export function mergeConnections({
  connections,
  mentionsIn,
  mentionsOut,
}: {
  connections: RecordConnection[];
  mentionsIn: RelatedRecord[];
  mentionsOut: RelatedRecord[];
}): UnifiedConnection[] {
  const byId = new Map<string, UnifiedConnection>();

  const entry = (record: RelatedRecord) => {
    let item = byId.get(record.id);
    if (!item) {
      item = { record, mentionsThis: false, mentionedHere: false };
      byId.set(record.id, item);
    }
    return item;
  };

  for (const c of connections) {
    entry(c.record).link = { linkId: c.linkId, note: c.note };
  }
  for (const r of mentionsIn) entry(r).mentionsThis = true;
  for (const r of mentionsOut) entry(r).mentionedHere = true;

  // Map iteration follows insertion order, and sort is stable, so ranking by
  // group keeps the input order within each group.
  const rank = (c: UnifiedConnection) =>
    c.link ? (c.mentionsThis || c.mentionedHere ? 0 : 1) : 2;
  return [...byId.values()].sort((a, b) => rank(a) - rank(b));
}
