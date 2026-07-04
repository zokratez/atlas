import { AppShell } from "@/components/AppShell";
import { TrendsClient } from "@/components/TrendsClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function TrendsPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="trends" userEmail={user.email} userRole={user.role}>
      <TrendsClient />
    </AppShell>
  );
}
