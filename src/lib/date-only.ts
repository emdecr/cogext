// Formats a Postgres `date` value ("YYYY-MM-DD") for display.
//
// `new Date("2026-11-01")` parses as UTC midnight, which renders as the
// previous day anywhere west of UTC. Build the Date from local parts instead
// so the day the user picked is the day they see.
export function formatDateOnly(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
}
