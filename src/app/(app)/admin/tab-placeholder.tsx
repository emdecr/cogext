// ============================================================================
// TAB PLACEHOLDER
// ============================================================================
//
// Heading + "not built yet" card for admin tabs whose content lands in a later
// phase of plans/2026-10-20-admin-panel.md. Replace per tab as each ships.
// ============================================================================

import { getAdminTab } from "./tabs";

export default function TabPlaceholder({ slug }: { slug: string }) {
  const tab = getAdminTab(slug);

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {tab.label}
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {tab.description}
      </p>
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        Not built yet.
      </div>
    </section>
  );
}
