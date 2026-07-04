"use client";

import { useEffect, useState } from "react";
import { FilterBar, emptyCounts, useAtlasFilters, type AtlasFilters } from "./FilterBar";

type Finding = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  channel?: string | null;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  confidence: number | null;
  tags: string[] | null;
};

type Pattern = {
  id: string;
  property: string;
  channel: string;
  name: string;
  description: string | null;
  support_count: number;
  confidence: number | null;
  status: "emerging" | "validated" | "fading" | "busted";
  source_findings: Finding[];
};

type FeedMode = "findings" | "patterns";

export function FeedClient() {
  const { filters, setFilters, ready } = useAtlasFilters();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [mode, setMode] = useState<FeedMode>("findings");
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [expandedPatternId, setExpandedPatternId] = useState<string | null>(null);
  const [counts, setCounts] = useState(emptyCounts());

  useEffect(() => {
    setShowWelcome(window.localStorage.getItem("atlas-welcome-dismissed") !== "true");
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetch(`/api/feed?${queryString(filters, mode)}`)
      .then((response) => response.json())
      .then((payload) => {
        setFindings(payload.findings ?? []);
        setPatterns(payload.patterns ?? []);
        setCounts(payload.counts ?? emptyCounts());
      })
      .finally(() => setLoading(false));
  }, [filters, mode, ready]);

  function dismissWelcome() {
    window.localStorage.setItem("atlas-welcome-dismissed", "true");
    setShowWelcome(false);
  }

  const count = mode === "patterns" ? patterns.length : findings.length;

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Findings</p>
          <h2>{mode === "patterns" ? "Pattern ledger" : "Research feed"}</h2>
        </div>
        <span className="counter">{loading ? "--" : count}</span>
      </div>

      <FilterBar filters={filters} counts={counts} onChange={setFilters} />

      <div className="mode-toggle" aria-label="Feed mode">
        <button className={mode === "findings" ? "active" : ""} type="button" onClick={() => setMode("findings")}>
          Findings
        </button>
        <button className={mode === "patterns" ? "active" : ""} type="button" onClick={() => setMode("patterns")}>
          Patterns
        </button>
      </div>

      {showWelcome ? (
        <article className="panel welcome-card">
          <div>
            <h3>Welcome to Atlas.</h3>
            <p>Read what Scout found.</p>
            <p>Approve what feels right.</p>
          </div>
          <button type="button" className="secondary" onClick={dismissWelcome}>
            Dismiss
          </button>
        </article>
      ) : null}

      {mode === "findings" ? (
        <div className="stack">
          {loading ? <PanelSkeleton /> : null}
          {!loading && findings.length === 0 ? <EmptyState text={emptyFilteredText(filters)} /> : null}
          {findings.map((finding) => (
            <FindingCard finding={finding} key={finding.id} />
          ))}
        </div>
      ) : (
        <div className="stack">
          {loading ? <PanelSkeleton /> : null}
          {!loading && patterns.length === 0 ? <EmptyState text={emptyFilteredText(filters).replace("findings", "patterns")} /> : null}
          {patterns.map((pattern) => (
            <article className="panel" key={pattern.id}>
              <div className="panel-meta">
                <span>{pattern.property}</span>
                <span>{pattern.channel}</span>
                <span>{pattern.status}</span>
              </div>
              <h3>{pattern.name}</h3>
              {pattern.description ? <p>{pattern.description}</p> : null}
              <div className="tag-row">
                <span className={`chip ${pattern.status}`}>seen {pattern.support_count}x</span>
                <span className="chip">confidence {formatPercent(pattern.confidence)}</span>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() => setExpandedPatternId(expandedPatternId === pattern.id ? null : pattern.id)}
              >
                {expandedPatternId === pattern.id ? "Hide receipts" : "Show receipts"}
              </button>
              {expandedPatternId === pattern.id ? (
                <div className="receipt-list">
                  {pattern.source_findings.map((finding) => (
                    <FindingCard finding={finding} compact key={finding.id} />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FindingCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  return (
    <article className={`panel ${compact ? "compact-panel" : ""}`}>
      <div className="panel-meta">
        <span>{finding.property}</span>
        <span>{finding.channel ?? "general"}</span>
        <span>{finding.agent}</span>
        <span>{formatDate(finding.created_at)}</span>
      </div>
      <h3>{finding.claim}</h3>
      {finding.evidence ? <p>{finding.evidence}</p> : null}
      <div className="tag-row">
        <span className="chip">confidence {formatPercent(finding.confidence)}</span>
        {(finding.tags ?? []).slice(0, 4).map((tag) => (
          <span className="chip" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      {finding.source_url ? (
        <a className="source-link" href={finding.source_url} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      ) : null}
    </article>
  );
}

function PanelSkeleton() {
  return (
    <>
      <div className="panel skeleton" />
      <div className="panel skeleton short" />
    </>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function queryString(filters: AtlasFilters, mode: FeedMode) {
  const params = new URLSearchParams({ mode });
  if (filters.property !== "all") params.set("property", filters.property);
  if (filters.channel !== "all") params.set("channel", filters.channel);
  return params.toString();
}

function emptyFilteredText(filters: AtlasFilters) {
  const property = filters.property === "all" ? "All" : propertyLabel(filters.property);
  const channel = filters.channel === "all" ? "All" : channelLabel(filters.channel);
  if (filters.property === "all" && filters.channel === "all") return "Scout's nightly research lands here.";
  return `No ${property}+${channel} findings yet — scout hunts what config targets. Add targets or drop links.`;
}

function propertyLabel(value: string) {
  if (value === "huh") return "Huh?";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function channelLabel(value: string) {
  const labels: Record<string, string> = { seo: "SEO", instagram: "IG", youtube: "YouTube", x: "X" };
  return labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPercent(value: number | null) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}
