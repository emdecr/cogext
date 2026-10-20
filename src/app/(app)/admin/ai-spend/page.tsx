// /admin/ai-spend — placeholder until Phase 6 of plans/2026-10-20-admin-panel.md.
import { requireAdmin } from "@/lib/auth/admin";
import TabPlaceholder from "../tab-placeholder";

export default async function AdminAiSpendPage() {
  await requireAdmin();
  return <TabPlaceholder slug="ai-spend" />;
}
