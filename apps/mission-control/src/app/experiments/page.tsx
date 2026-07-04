import { AppShell } from "@/components/AppShell";
import { ExperimentsClient } from "@/components/ExperimentsClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";
import { redirect } from "next/navigation";

export default async function ExperimentsPage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "curator")) redirect("/feed");

  return (
    <AppShell active="experiments" userEmail={user.email} userRole={user.role}>
      <ExperimentsClient />
    </AppShell>
  );
}
