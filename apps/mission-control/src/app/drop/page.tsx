import { AppShell } from "@/components/AppShell";
import { DropClient } from "@/components/DropClient";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";
import { redirect } from "next/navigation";

export default async function DropPage() {
  const user = await requireAtlasUser();
  if (!hasRole(user, "curator")) redirect("/feed");

  return (
    <AppShell active="drop" userEmail={user.email} userRole={user.role}>
      <DropClient />
    </AppShell>
  );
}
