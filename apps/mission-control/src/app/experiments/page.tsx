import { AppShell } from "@/components/AppShell";
import { ExperimentsClient } from "@/components/ExperimentsClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function ExperimentsPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="experiments" userEmail={user.email}>
      <ExperimentsClient />
    </AppShell>
  );
}
