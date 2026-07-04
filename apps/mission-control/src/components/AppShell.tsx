"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ChartNoAxesCombined, CircleDollarSign, Inbox, ListChecks, Power, Rss } from "lucide-react";
import { useEffect, useState } from "react";

type NavKey = "feed" | "drop" | "queue" | "experiments" | "costs";

const navItems: Array<{ key: NavKey; href: string; label: string; Icon: typeof Rss }> = [
  { key: "feed", href: "/feed", label: "Feed", Icon: Rss },
  { key: "drop", href: "/drop", label: "Drop", Icon: Inbox },
  { key: "queue", href: "/queue", label: "Queue", Icon: ListChecks },
  { key: "experiments", href: "/experiments", label: "Tests", Icon: ChartNoAxesCombined },
  { key: "costs", href: "/costs", label: "Costs", Icon: CircleDollarSign },
];

export function AppShell({
  active,
  userEmail,
  children,
}: {
  active: NavKey;
  userEmail: string;
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
          <button className="ghost-button" type="button" onClick={signOut} aria-label={`Sign out ${userEmail}`}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="nav-tabs" aria-label="Mission Control sections">
        {navItems.map(({ key, href, label, Icon }) => (
          <Link className={active === key ? "active" : ""} href={href} key={key}>
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
      </footer>
    </div>
  );
}
