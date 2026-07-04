import { AppShell } from "@/components/AppShell";
import { FeedClient } from "@/components/FeedClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function FeedPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="feed" userEmail={user.email} userRole={user.role}>
      <FeedClient />
    </AppShell>
  );
}
