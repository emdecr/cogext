// ============================================================================
// RECORD DETAIL — INTERCEPTING MODAL ROUTE
// ============================================================================
//
// (.)records/[id] intercepts soft navigations to /records/[id] from within the
// (app) group (e.g. clicking a card on the dashboard) and renders the record
// in a modal over the current page. Hard navigation / refresh / shared links
// bypass this and hit the real page at src/app/(app)/records/[id]/page.tsx.
//
// Server component: same auth + user-scoped fetch as the standalone page. On a
// missing/foreign record we notFound() — the modal segment shows the not-found
// UI rather than a broken dialog.
// ============================================================================

import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getRecord } from "@/lib/actions/records";
import RecordModal from "./record-modal";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecordModalPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const record = await getRecord(id);

  if (!record) notFound();

  return <RecordModal record={record} />;
}
