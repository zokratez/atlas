import { AppShell } from "@/components/AppShell";
import { CalendarClient } from "@/components/CalendarClient";
import { requireAtlasUser } from "@/lib/atlas/auth";

export default async function CalendarPage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="calendar" userEmail={user.email} userRole={user.role}>
      <CalendarClient userRole={user.role} />
    </AppShell>
  );
}
