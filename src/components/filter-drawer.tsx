// ============================================================================
// FILTER DRAWER
// ============================================================================
//
// A slide-out panel from the right side of the screen. Houses tag filters
// (and eventually collection filters) — things that would clutter the
// main filter bar if shown inline.
//
// The drawer overlays the grid with a semi-transparent backdrop.
// Clicking the backdrop or the close button dismisses it.
//
// Filter state is still owned by RecordGrid (the parent). This component
// just renders the controls and calls callbacks — same pattern as FilterBar.
// ============================================================================

"use client";

type FilterDrawerProps = {
  isOpen: boolean;
  onClose: () => void;

  // Tag filtering
  activeTag: string | null;
  onTagChange: (tag: string | null) => void;
  availableTags: { name: string; count: number }[];
};

export default function FilterDrawer({
  isOpen,
  onClose,
  activeTag,
  onTagChange,
  availableTags,
}: FilterDrawerProps) {
  return (
    <>
      {/* ---- Backdrop ---- */}
      {/* Semi-transparent overlay behind the drawer. Clicking it closes
          the drawer. The transition classes handle the fade in/out. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* ---- Drawer panel ---- */}
      {/* translate-x-full moves it completely off-screen to the right.
          translate-x-0 slides it into view. The transition class animates
          between these states. */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-80 flex-col bg-white shadow-xl transition-transform duration-200 ease-in-out dark:bg-gray-900 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Filters
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* ---- Tags section ---- */}
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Tags
            </h3>

            {availableTags.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No tags yet. Tags appear as you create and tag records.
              </p>
            ) : (
              <div className="space-y-1">
                {availableTags.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => {
                      // Toggle: clicking active tag clears it
                      onTagChange(activeTag === name ? null : name);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                      activeTag === name
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span>{name}</span>
                    <span
                      className={`text-xs ${
                        activeTag === name
                          ? "text-gray-300 dark:text-gray-600"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---- Collections section (placeholder for later) ---- */}
          <div className="mb-6">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Collections
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Coming soon
            </p>
          </div>
        </div>

        {/* Footer — clear all filters */}
        {activeTag && (
          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <button
              onClick={() => {
                onTagChange(null);
              }}
              className="w-full rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
