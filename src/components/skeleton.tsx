// ============================================================================
// SKELETON LOADING COMPONENT
// ============================================================================
//
// Placeholder shapes that pulse while content is loading. Used to show
// the layout structure before data arrives — better than a blank screen
// or a spinner because it gives spatial context ("something will go here").
//
// Uses our custom shimmer animation (defined in globals.css) for a softer
// pulse than Tailwind's built-in animate-pulse.
//
// Usage:
//   <Skeleton className="h-4 w-32" />          → text line
//   <Skeleton className="h-36 w-full" />        → image placeholder
//   <Skeleton className="h-4 w-4 rounded-full" /> → avatar/icon
//
// The component accepts any additional className for sizing and shape.
// ============================================================================

type Props = {
  className?: string;
};

export default function Skeleton({ className = "" }: Props) {
  return (
    <div
      className={`rounded-md bg-gray-200 animate-[shimmer_1.5s_ease-in-out_infinite] dark:bg-gray-800 ${className}`}
    />
  );
}

// ============================================================================
// RECORD CARD SKELETON
// ============================================================================
// A pre-built skeleton that matches the RecordCard layout.
// Use this in grids to show loading state for record lists.

export function RecordCardSkeleton() {
  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:p-4">
      {/* Type badge */}
      <Skeleton className="mb-2 h-5 w-14 rounded-full" />
      {/* Title */}
      <Skeleton className="mb-2 h-4 w-3/4" />
      {/* Content lines */}
      <Skeleton className="mb-1.5 h-3 w-full" />
      <Skeleton className="mb-1.5 h-3 w-5/6" />
      <Skeleton className="mb-3 h-3 w-2/3" />
      {/* Timestamp */}
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

// ============================================================================
// REFLECTION SKELETON
// ============================================================================
// Matches the reflection list item layout.

export function ReflectionSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      {/* Period label */}
      <Skeleton className="mb-2 h-4 w-40" />
      {/* Preview text */}
      <Skeleton className="mb-1.5 h-3 w-full" />
      <Skeleton className="mb-1.5 h-3 w-5/6" />
      <Skeleton className="mb-3 h-3 w-3/4" />
      {/* Date */}
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
