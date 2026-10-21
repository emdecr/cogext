"use server";

// ============================================================================
// ADMIN — AUTH LOG (read-only)
// ============================================================================
//
// Reader for auth_events: a paginated, filterable event list plus a 7-day
// summary and the IPs with the most failed logins. Admin-only: requireAdmin()
// 404s anyone else.
//
// Queries lean on the existing indexes (created_at, event_type). The 7-day
// aggregates scan at most a week of rows — tiny for a personal instance even
// under a credential-stuffing burst.
// ============================================================================

import { and, count, countDistinct, desc, eq, gte, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { authEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/admin";
import type { AuthEventType } from "@/lib/auth/auth-log";
import {
  AUTH_LOG_PAGE_SIZE,
  normalizeAuthLogParams,
  type AuthLogParams,
} from "@/lib/auth-log-view";

export type AuthLogEvent = {
  id: string;
  eventType: AuthEventType;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type FailingIp = {
  ip: string;
  failures: number;
  distinctEmails: number;
  lastAt: string;
};

export type AuthLogOverview = {
  params: AuthLogParams;
  events: AuthLogEvent[];
  hasMore: boolean;
  summary: {
    failedLogins: number;
    successfulLogins: number;
    blockedSignups: number;
    failingIps: number;
  };
  topFailingIps: FailingIp[];
  generatedAt: string;
};

const SUMMARY_DAYS = 7;
const TOP_IPS = 10;

export async function getAuthLog(
  rawParams: AuthLogParams
): Promise<AuthLogOverview> {
  await requireAdmin();
  const params = normalizeAuthLogParams(rawParams);

  const now = new Date();
  const since = new Date(now.getTime() - SUMMARY_DAYS * 24 * 60 * 60 * 1000);
  const isFailure = eq(authEvents.eventType, "login_failure");

  const [rows, [summary], topIps] = await Promise.all([
    // One extra row tells us whether an older page exists.
    db
      .select({
        id: authEvents.id,
        eventType: authEvents.eventType,
        email: authEvents.email,
        ip: authEvents.ip,
        userAgent: authEvents.userAgent,
        createdAt: authEvents.createdAt,
      })
      .from(authEvents)
      .where(params.type ? eq(authEvents.eventType, params.type) : undefined)
      .orderBy(desc(authEvents.createdAt))
      .limit(AUTH_LOG_PAGE_SIZE + 1)
      .offset((params.page - 1) * AUTH_LOG_PAGE_SIZE),

    db
      .select({
        failedLogins: sql<number>`count(*) filter (where ${authEvents.eventType} = 'login_failure')`.mapWith(Number),
        successfulLogins: sql<number>`count(*) filter (where ${authEvents.eventType} = 'login_success')`.mapWith(Number),
        blockedSignups: sql<number>`count(*) filter (where ${authEvents.eventType} = 'register_blocked')`.mapWith(Number),
        failingIps: sql<number>`count(distinct ${authEvents.ip}) filter (where ${authEvents.eventType} = 'login_failure')`.mapWith(Number),
      })
      .from(authEvents)
      .where(gte(authEvents.createdAt, since)),

    db
      .select({
        ip: authEvents.ip,
        failures: count(),
        distinctEmails: countDistinct(authEvents.email),
        lastAt: max(authEvents.createdAt),
      })
      .from(authEvents)
      .where(and(isFailure, gte(authEvents.createdAt, since)))
      .groupBy(authEvents.ip)
      .orderBy(desc(count()), desc(max(authEvents.createdAt)))
      .limit(TOP_IPS),
  ]);

  return {
    params,
    events: rows.slice(0, AUTH_LOG_PAGE_SIZE).map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    hasMore: rows.length > AUTH_LOG_PAGE_SIZE,
    summary,
    topFailingIps: topIps.map((r) => ({
      ip: r.ip ?? "unknown",
      failures: r.failures,
      distinctEmails: r.distinctEmails,
      lastAt: (r.lastAt ?? now).toISOString(),
    })),
    generatedAt: now.toISOString(),
  };
}
