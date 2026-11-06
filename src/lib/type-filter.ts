// ============================================================================
// TYPE FILTER — dashboard type filtering, shared by bar, drawer and grid
// ============================================================================
// The filter value is either null (everything), a record type, or the
// pseudo-type "shelf" (every shelf type at once: books, movies, shows). Shelf
// types share one "Shelf" pill instead of a pill each, so the bar doesn't grow
// with every new medium.
// ============================================================================

import {
  CREATABLE_RECORD_TYPES,
  isShelfType,
  type RecordType,
  type ShelfType,
} from "@/lib/validations/records";

export const SHELF_FILTER = "shelf";

export type TypeFilter = RecordType | typeof SHELF_FILTER | null;

// Types that get their own pill (note, quote, link, image).
export const INLINE_FILTER_TYPES = CREATABLE_RECORD_TYPES.filter(
  (t) => !isShelfType(t),
);

// Shelf types offered in the Shelf menu, in create-UI order.
export const SHELF_FILTER_TYPES = CREATABLE_RECORD_TYPES.filter(
  (t): t is (typeof CREATABLE_RECORD_TYPES)[number] & ShelfType =>
    isShelfType(t),
);

export function matchesTypeFilter(recordType: string, filter: TypeFilter): boolean {
  if (filter === null) return true;
  if (filter === SHELF_FILTER) return isShelfType(recordType);
  return recordType === filter;
}

// True when the Shelf pill should look active ("shelf" or one shelf type).
export function isShelfFilter(filter: TypeFilter): boolean {
  return filter === SHELF_FILTER || isShelfType(filter);
}
