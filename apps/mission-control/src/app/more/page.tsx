import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireAtlasUser } from "@/lib/atlas/auth";

const links = [
  { href: "/armory", label: "Armory", minRole: "curator" as const },
  { href: "/calendar", label: "Calendar", minRole: "viewer" as const },
  { href: "/experiments", label: "Tests", minRole: "curator" as const },
  { href: "/trends", label: "Trends", minRole: "viewer" as const },
  { href: "/costs", label: "Costs", minRole: "curator" as const },
  { href: "/settings", label: "Settings", minRole: "owner" as const },
];

export default async function MorePage() {
  const user = await requireAtlasUser();

  return (
    <AppShell active="more" userEmail={user.email} userRole={user.role}>
      <section className="view">
        <div className="view-heading">
          <div>
            <p className="eyebrow">More</p>
            <h2>Sections</h2>
          </div>
        </div>
        <div className="more-grid">
          {links.filter((link) => hasRole(user, link.minRole)).map((link) => (
            <Link className="panel more-link" href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
