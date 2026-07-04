import { AppShell } from "@/components/AppShell";
import { TodayClient } from "@/components/TodayClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function TodayPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="today" userEmail={user.email} userRole={user.role}>
      <TodayClient userRole={user.role} />
    </AppShell>
  );
}
