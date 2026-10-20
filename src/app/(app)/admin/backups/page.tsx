// /admin/backups — placeholder until Phase 2 of plans/2026-10-20-admin-panel.md.
import { requireAdmin } from "@/lib/auth/admin";
import TabPlaceholder from "../tab-placeholder";

export default async function AdminBackupsPage() {
  await requireAdmin();
  return <TabPlaceholder slug="backups" />;
}
