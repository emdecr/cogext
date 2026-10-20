// /admin/auth — placeholder until Phase 4 of plans/2026-10-20-admin-panel.md.
import { requireAdmin } from "@/lib/auth/admin";
import TabPlaceholder from "../tab-placeholder";

export default async function AdminAuthLogPage() {
  await requireAdmin();
  return <TabPlaceholder slug="auth" />;
}
