// ============================================================================
// ADMIN TABS
// ============================================================================
//
// Single list of the admin panel's tabs — drives the tab nav and each tab's
// placeholder copy. Each tab is a real route (/admin/<slug>) so it's linkable
// and only fetches its own data. See plans/2026-10-20-admin-panel.md.
// ============================================================================

export type AdminTab = {
  slug: string;
  label: string;
  // One-line summary shown under the tab's heading.
  description: string;
};

export const ADMIN_TABS: readonly AdminTab[] = [
  {
    slug: "backups",
    label: "Backups",
    description:
      "Last backup run and healthchecks.io status for the nightly backup job.",
  },
  {
    slug: "ai-spend",
    label: "AI spend",
    description: "LLM token usage and estimated cost, broken down by feature.",
  },
  {
    slug: "auth",
    label: "Auth log",
    description: "Recent logins, failed attempts, and blocked registrations.",
  },
  {
    slug: "system",
    label: "System",
    description:
      "Database and storage readiness, uptime, deployed version, and AI config.",
  },
  {
    slug: "data",
    label: "Data",
    description:
      "Record counts and records missing embeddings or tags.",
  },
];

export function getAdminTab(slug: string): AdminTab {
  const tab = ADMIN_TABS.find((t) => t.slug === slug);
  if (!tab) throw new Error(`Unknown admin tab: ${slug}`);
  return tab;
}
