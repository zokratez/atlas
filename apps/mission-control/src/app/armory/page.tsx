import { AppShell } from "@/components/AppShell";
import { ArmoryClient } from "@/components/ArmoryClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";
import { redirect } from "next/navigation";

export default async function ArmoryPage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "curator")) redirect("/feed");

  return (
    <AppShell active="armory" userEmail={user.email} userRole={user.role}>
      <ArmoryClient />
    </AppShell>
  );
}
