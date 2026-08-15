// ============================================================================
// STAR RATING (read-only display)
// ============================================================================
//
// Renders a 0–5 rating with half/fractional precision (e.g. 4.25) as filled
// stars. Book records use this on the card and detail views. Rating INPUT is a
// plain decimal number field in the create/edit forms — we want the nuance of
// arbitrary decimals, which star buttons can't express.
// ============================================================================

"use client";

function FractionalStar({ fill }: { fill: number }) {
  // A gray base star with a clipped gold star layered on top, its visible
  // width set to the fill fraction (0–1). Handles halves and decimals.
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <span className="relative inline-block leading-none">
      <span className="text-gray-300 dark:text-gray-600">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-amber-400"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        ★
      </span>
    </span>
  );
}

export function StarRating({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`${value} out of 5 stars`}
      title={`${value} / 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <FractionalStar key={i} fill={value - i} />
      ))}
    </span>
  );
}
