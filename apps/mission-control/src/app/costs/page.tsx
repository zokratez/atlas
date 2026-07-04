import { AppShell } from "@/components/AppShell";
import { CostsClient } from "@/components/CostsClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function CostsPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="costs" userEmail={user.email}>
      <CostsClient />
    </AppShell>
  );
}
