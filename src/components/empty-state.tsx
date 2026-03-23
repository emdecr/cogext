// ============================================================================
// EMPTY STATE
// ============================================================================
//
// A reusable component for empty/zero-data states across the app.
// Shows a simple icon, a title, a description, and an optional action.
//
// Design philosophy: empty states should feel inviting, not broken.
// They're an opportunity to guide the user toward their first action.
// The icon gives visual weight, the copy explains *why* it's empty,
// and the action shows *what to do next*.
//
// Usage:
//   <EmptyState
//     icon="records"
//     title="No records yet"
//     description="Click the + button to save your first note."
//   />
// ============================================================================

type IconName =
  | "records"
  | "search"
  | "reflections"
  | "collections"
  | "conversations"
  | "tags"
  | "filter";

type Props = {
  icon?: IconName;
  title: string;
  description?: string;
  // Optional action — renders a button/link below the description
  action?: React.ReactNode;
  // Compact mode for inline contexts (popovers, sidebars)
  compact?: boolean;
};

// Simple SVG icons — one for each empty state context.
// These are intentionally minimal (outline style, 1 color) to feel
// calm and not draw too much attention to the empty state.
function EmptyIcon({ name, compact }: { name: IconName; compact?: boolean }) {
  const size = compact ? "h-8 w-8" : "h-12 w-12";

  const icons: Record<IconName, React.ReactNode> = {
    records: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    search: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    reflections: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M17.72 17.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M17.72 6.28l1.06-1.06" />
        <circle cx="12" cy="12" r="3" strokeWidth={1} />
      </svg>
    ),
    collections: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    conversations: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    tags: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    filter: (
      <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
  };

  return (
    <div className="text-gray-300 dark:text-gray-600">
      {icons[name]}
    </div>
  );
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        {icon && <EmptyIcon name={icon} compact />}
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {title}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {description}
          </p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700">
      {icon && <EmptyIcon name={icon} />}
      <p className="mt-3 text-lg font-medium text-gray-500 dark:text-gray-400">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-400 dark:text-gray-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
