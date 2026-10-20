// /admin has no content of its own — Backups is the default tab.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminIndexPage() {
  await requireAdmin();
  redirect("/admin/backups");
}
