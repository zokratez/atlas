import { AppShell } from "@/components/AppShell";
import { CostsClient } from "@/components/CostsClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";
import { redirect } from "next/navigation";

export default async function CostsPage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "curator")) redirect("/feed");

  return (
    <AppShell active="costs" userEmail={user.email} userRole={user.role}>
      <CostsClient />
    </AppShell>
  );
}
