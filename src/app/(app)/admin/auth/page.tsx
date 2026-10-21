// ============================================================================
// ADMIN — AUTH LOG TAB
// ============================================================================
//
// Server component. Shows:
//   - 7-day summary: failed/successful logins, blocked signups, failing IPs
//   - the IPs with the most failed logins in the last 7 days
//   - every auth event, newest first, filterable by type, 50 per page
// Filter and page live in the URL (?type=…&page=…) so views are linkable.
//
// Stored emails and user agents are UNTRUSTED (a failed login records
// whatever was typed). React escapes them; clip() caps their length, and the
// full value is only ever a title attribute.
// See src/lib/actions/admin/auth-log.ts.
// ============================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAuthLog } from "@/lib/actions/admin/auth-log";
import {
  AUTH_EVENT_LABELS,
  AUTH_EVENT_TYPES,
  authLogHref,
  clip,
  describeUserAgent,
  parseAuthLogParams,
} from "@/lib/auth-log-view";
import { Badge, When, TabHeading, card, cardTitle, muted, tone } from "../ui";

function Stat({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className={card}>
      <div className={cardTitle}>{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          alert && value > 0
            ? "text-red-700 dark:text-red-400"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

const pill =
  "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors";

export default async function AdminAuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = parseAuthLogParams(await searchParams);
  const log = await getAuthLog(params);
  const now = new Date(log.generatedAt);
  const { summary } = log;

  return (
    <section>
      <TabHeading slug="auth" />

      {/* ---- 7-day summary ---- */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Failed logins · 7d" value={summary.failedLogins} alert />
        <Stat label="Logins · 7d" value={summary.successfulLogins} />
        <Stat label="Blocked signups · 7d" value={summary.blockedSignups} alert />
        <Stat label="IPs with failures · 7d" value={summary.failingIps} alert />
      </div>

      {/* ---- Top failing IPs ---- */}
      {log.topFailingIps.length > 0 && (
        <div className={`${card} mt-4 overflow-x-auto p-0`}>
          <h3 className={`${cardTitle} px-4 pt-4`}>
            Most failed logins by IP · 7d
          </h3>
          <table className="mt-2 w-full text-left text-sm">
            <thead className={muted}>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-2 font-medium">IP</th>
                <th className="px-4 py-2 text-right font-medium">Failures</th>
                <th className="px-4 py-2 text-right font-medium">Emails tried</th>
                <th className="px-4 py-2 font-medium">Last attempt</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {log.topFailingIps.map((r) => (
                <tr
                  key={r.ip}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
                >
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs" title={r.ip}>
                    {clip(r.ip, 45)}
                  </td>
                  <td className="px-4 py-2 text-right">{r.failures}</td>
                  <td className="px-4 py-2 text-right">{r.distinctEmails}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <When iso={r.lastAt} now={now} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Type filter ---- */}
      <nav aria-label="Filter events" className="mt-6 flex flex-wrap gap-2">
        {[null, ...AUTH_EVENT_TYPES].map((type) => {
          const active = log.params.type === type;
          return (
            <Link
              key={type ?? "all"}
              href={authLogHref({ type, page: 1 })}
              aria-current={active ? "page" : undefined}
              className={`${pill} ${
                active
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : `${tone.gray} hover:bg-gray-200 dark:hover:bg-gray-700`
              }`}
            >
              {type ? AUTH_EVENT_LABELS[type].label : "All"}
            </Link>
          );
        })}
      </nav>

      {/* ---- Events ---- */}
      <div className={`${card} mt-3 overflow-x-auto p-0`}>
        {log.events.length === 0 ? (
          <p className={`p-4 ${muted}`}>
            {log.params.page > 1
              ? "No events on this page."
              : "No events recorded yet."}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className={muted}>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">IP</th>
                <th className="px-4 py-2 font-medium">Client</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {log.events.map((e) => {
                const t = AUTH_EVENT_LABELS[e.eventType];
                return (
                  <tr
                    key={e.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800/60"
                  >
                    <td className="whitespace-nowrap px-4 py-2">
                      <When iso={e.createdAt} now={now} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Badge color={t.color}>{t.label}</Badge>
                    </td>
                    <td
                      className="max-w-[16rem] truncate px-4 py-2 font-mono text-xs"
                      title={e.email ?? undefined}
                    >
                      {clip(e.email)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2 font-mono text-xs"
                      title={e.ip ?? undefined}
                    >
                      {clip(e.ip, 45)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2 text-xs"
                      title={e.userAgent ?? undefined}
                    >
                      {describeUserAgent(e.userAgent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Pagination ---- */}
      {(log.params.page > 1 || log.hasMore) && (
        <div className="mt-3 flex items-center justify-between text-sm">
          {log.params.page > 1 ? (
            <Link
              href={authLogHref({ ...log.params, page: log.params.page - 1 })}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className={muted}>Page {log.params.page}</span>
          {log.hasMore ? (
            <Link
              href={authLogHref({ ...log.params, page: log.params.page + 1 })}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </section>
  );
}
