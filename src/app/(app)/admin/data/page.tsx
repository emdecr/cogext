// /admin/data — placeholder until Phase 5 of plans/2026-10-20-admin-panel.md.
import { requireAdmin } from "@/lib/auth/admin";
import TabPlaceholder from "../tab-placeholder";

export default async function AdminDataPage() {
  await requireAdmin();
  return <TabPlaceholder slug="data" />;
}
