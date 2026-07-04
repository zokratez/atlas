import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SettingsClient } from "@/components/SettingsClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";

export default async function SettingsPage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "owner")) redirect("/feed");

  return (
    <AppShell active="settings" userEmail={user.email} userRole={user.role}>
      <SettingsClient />
    </AppShell>
  );
}
