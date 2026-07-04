"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ChartLine,
  ChartNoAxesCombined,
  CircleDollarSign,
  Home,
  Inbox,
  ListChecks,
  MoreHorizontal,
  PackageOpen,
  Power,
  Rss,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

type OperatorRole = "owner" | "curator" | "viewer";
export type NavKey = "today" | "feed" | "queue" | "drop" | "armory" | "calendar" | "experiments" | "trends" | "costs" | "settings" | "more";

const navItems: Array<{ key: NavKey; href: string; label: string; Icon: typeof Rss; minRole: OperatorRole; mobilePrimary?: boolean; desktopOnly?: boolean; mobileOnly?: boolean }> = [
  { key: "today", href: "/today", label: "Today", Icon: Home, minRole: "viewer", mobilePrimary: true },
  { key: "feed", href: "/feed", label: "Feed", Icon: Rss, minRole: "viewer" },
  { key: "queue", href: "/queue", label: "Queue", Icon: ListChecks, minRole: "curator", mobilePrimary: true },
  { key: "drop", href: "/drop", label: "Drop", Icon: Inbox, minRole: "curator" },
  { key: "armory", href: "/armory", label: "Armory", Icon: PackageOpen, minRole: "curator" },
  { key: "calendar", href: "/calendar", label: "Calendar", Icon: ChartLine, minRole: "viewer" },
  { key: "experiments", href: "/experiments", label: "Tests", Icon: ChartNoAxesCombined, minRole: "curator" },
  { key: "trends", href: "/trends", label: "Trends", Icon: ChartLine, minRole: "viewer" },
  { key: "costs", href: "/costs", label: "Costs", Icon: CircleDollarSign, minRole: "curator" },
  { key: "settings", href: "/settings", label: "Settings", Icon: Settings, minRole: "owner" },
  { key: "more", href: "/more", label: "More", Icon: MoreHorizontal, minRole: "viewer", mobileOnly: true },
];

export function AppShell({
  active,
  userEmail,
  userRole,
  children,
}: {
  active: NavKey;
  userEmail: string;
  userRole: OperatorRole;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [loadingFlag, setLoadingFlag] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/flags/engine_enabled")
      .then((response) => response.json())
      .then((payload) => {
        if (mounted) setEnabled(Boolean(payload.enabled));
      })
      .finally(() => {
        if (mounted) setLoadingFlag(false);
      });
    return () => {
      mounted = false;
    };
  }, [pathname]);

  async function toggleEngine() {
    const next = !enabled;
    setEnabled(next);
    const response = await fetch("/api/flags/engine_enabled", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });

    if (!response.ok) {
      setEnabled(!next);
    }
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Atlas</p>
          <h1>Mission Control</h1>
        </div>
        <div className="topbar-actions">
          {userRole === "owner" ? (
            <button
              className={`kill-switch ${enabled ? "on" : "off"}`}
              type="button"
              onClick={toggleEngine}
              disabled={loadingFlag}
              aria-pressed={enabled}
            >
              <Power size={16} />
              <span className="kill-switch-copy">
                <span>{enabled ? "Engine on" : "Engine off"}</span>
                <span>Off = no agent runs or spends.</span>
              </span>
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={signOut} aria-label={`Sign out ${userEmail}`}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Mission Control sections">
        {navItems.filter((item) => canSee(userRole, item.minRole)).map(({ key, href, label, Icon, mobilePrimary, desktopOnly, mobileOnly }) => (
          <Link
            className={[
              active === key || (key === "more" && isMoreActive(active)) ? "active" : "",
              mobilePrimary || ["feed", "drop"].includes(key) ? "mobile-primary" : "",
              desktopOnly ? "desktop-only" : "",
              mobileOnly ? "mobile-only" : "",
            ].filter(Boolean).join(" ")}
            href={href}
            key={key}
          >
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <main className="content">{children}</main>

      <footer className="status-strip">
        <span>
          <Activity size={14} /> atlas schema
        </span>
        <span>service-role routes only</span>
        <span>{userRole}</span>
      </footer>
    </div>
  );
}

function canSee(role: OperatorRole, minimum: OperatorRole) {
  const rank: Record<OperatorRole, number> = { viewer: 1, curator: 2, owner: 3 };
  return rank[role] >= rank[minimum];
}

function isMoreActive(active: NavKey) {
  return !["today", "feed", "queue", "drop", "more"].includes(active);
}
