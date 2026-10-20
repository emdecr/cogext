// /admin/system — placeholder until Phase 3 of plans/2026-10-20-admin-panel.md.
import { requireAdmin } from "@/lib/auth/admin";
import TabPlaceholder from "../tab-placeholder";

export default async function AdminSystemPage() {
  await requireAdmin();
  return <TabPlaceholder slug="system" />;
}
