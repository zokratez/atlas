"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusProperty, useProperties } from "./FilterBar";

type OperatorRole = "owner" | "curator" | "viewer";

type TodaySummary = {
  focusProperty: string;
  pendingDrafts: number;
  checkpointPosts: number;
  weekReady: boolean;
  processedDrops: number;
  processedFindings: number;
};

const filterStorageKey = "atlas-filters-v1";

export function TodayClient({ userRole }: { userRole: OperatorRole }) {
  const router = useRouter();
  const properties = useProperties(false);
  const { focusProperty, setFocusProperty, ready: focusReady } = useFocusProperty();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [runMessage, setRunMessage] = useState("");
  const propertyLabels = useMemo(() => new Map(properties.map((property) => [property.slug, property.display_name])), [properties]);
  const focusLabel = propertyLabels.get(focusProperty) ?? focusProperty;

  useEffect(() => {
    if (!focusReady) return;
    setLoading(true);
    fetch(`/api/today?property=${encodeURIComponent(focusProperty)}`)
      .then((response) => response.json())
      .then((payload) => setSummary(payload))
      .finally(() => setLoading(false));
  }, [focusProperty, focusReady]);

  function go(path: string, filters = { property: focusProperty, channel: "all" }) {
    window.localStorage.setItem(filterStorageKey, JSON.stringify(filters));
    router.push(path);
  }

  async function queueRun(worker: "scout" | "lens" | "quill") {
    setRunMessage("");
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker }),
    });
    setRunMessage(response.ok ? "Queued, runs within a minute." : "Could not queue run.");
  }

  const tasks = summary ? [
    summary.pendingDrafts > 0 ? {
      key: "queue",
      text: `${summary.pendingDrafts} drafts need your verdict.`,
      button: "Review",
      onClick: () => go(`/queue?status=pending&property=${focusProperty}`),
    } : null,
    summary.checkpointPosts > 0 ? {
      key: "checkpoints",
      text: `${summary.checkpointPosts} posts hit their checkpoint.`,
      button: "Log results",
      onClick: () => go(`/queue?status=published&property=${focusProperty}`),
    } : null,
    summary.weekReady ? {
      key: "week",
      text: "The Week is ready.",
      button: "Read",
      onClick: () => go(`/feed?property=${focusProperty}`),
    } : null,
    summary.processedDrops > 0 ? {
      key: "drops",
      text: `${summary.processedDrops} drops processed overnight — ${summary.processedFindings} findings.`,
      button: "See what it found",
      onClick: () => go(`/drop?property=${focusProperty}`),
    } : null,
  ].filter((task): task is { key: string; text: string; button: string; onClick: () => void } => Boolean(task)).slice(0, 5) : [];

  return (
    <section className="view today-view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Ritual</h2>
        </div>
        <span className="counter">{loading ? "--" : tasks.length}</span>
      </div>

      <div className="focus-strip">
        <span className="chip focus-chip">Focus: {focusLabel}</span>
        <button type="button" onClick={() => queueRun("scout")}>Hunt now</button>
        {userRole === "owner" ? (
          <select
            value={focusProperty}
            onChange={(event) => setFocusProperty(event.target.value)}
            aria-label="Focus property"
          >
            {properties.map((property) => (
              <option value={property.slug} key={property.slug}>{property.display_name}</option>
            ))}
          </select>
        ) : null}
      </div>
      {runMessage ? <p className="form-message sent">{runMessage}</p> : null}

      <div className="today-stack">
        {loading ? <div className="panel skeleton short" /> : null}
        {!loading && tasks.length === 0 ? (
          <article className="panel today-card complete">
            <p>Nothing due. Engine hunts at 2:00.</p>
          </article>
        ) : null}
        {tasks.map((task) => (
          <article className="panel today-card" key={task.key}>
            <p>{task.text}</p>
            <button type="button" onClick={task.onClick}>{task.button}</button>
          </article>
        ))}
      </div>
    </section>
  );
}
