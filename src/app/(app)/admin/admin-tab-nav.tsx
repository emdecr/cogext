"use client";

// ============================================================================
// ADMIN TAB NAV
// ============================================================================
//
// Client component only because it needs usePathname() to highlight the
// active tab. The tabs themselves are plain <Link>s to server-rendered routes.
// Scrolls horizontally on narrow screens rather than wrapping.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_TABS } from "./tabs";

export default function AdminTabNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="-mx-4 overflow-x-auto border-b border-gray-200 px-4 dark:border-gray-800 md:mx-0 md:px-0"
    >
      <ul className="flex gap-1">
        {ADMIN_TABS.map((tab) => {
          const href = `/admin/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-gray-900 font-medium text-gray-900 dark:border-gray-100 dark:text-gray-100"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
