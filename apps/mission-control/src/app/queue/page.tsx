import { AppShell } from "@/components/AppShell";
import { QueueClient } from "@/components/QueueClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";
import { redirect } from "next/navigation";

export default async function QueuePage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "curator")) redirect("/feed");

  return (
    <AppShell active="queue" userEmail={user.email} userRole={user.role}>
      <QueueClient />
    </AppShell>
  );
}
