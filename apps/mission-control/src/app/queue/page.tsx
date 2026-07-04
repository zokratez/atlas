import { AppShell } from "@/components/AppShell";
import { QueueClient } from "@/components/QueueClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function QueuePage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="queue" userEmail={user.email}>
      <QueueClient />
    </AppShell>
  );
}
