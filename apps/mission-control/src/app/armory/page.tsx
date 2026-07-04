import { AppShell } from "@/components/AppShell";
import { ArmoryClient } from "@/components/ArmoryClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function ArmoryPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="armory" userEmail={user.email}>
      <ArmoryClient />
    </AppShell>
  );
}
