import { formatDateOnly } from "@/lib/date-only";

describe("formatDateOnly", () => {
  it("keeps the calendar day regardless of timezone", () => {
    expect(formatDateOnly("2026-11-01")).toBe(
      new Date(2026, 10, 1).toLocaleDateString(),
    );
  });

  it("passes through values that aren't YYYY-MM-DD", () => {
    expect(formatDateOnly("not a date")).toBe("not a date");
  });
});
