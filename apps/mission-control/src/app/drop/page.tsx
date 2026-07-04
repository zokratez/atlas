import { AppShell } from "@/components/AppShell";
import { DropClient } from "@/components/DropClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function DropPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="drop" userEmail={user.email}>
      <DropClient />
    </AppShell>
  );
}
