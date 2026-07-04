"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterBar, emptyCounts, useAtlasFilters, useProperties, type AtlasFilters } from "./FilterBar";

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
  cadence?: "weekly" | "monthly" | "quarterly" | null;
  pinned?: boolean | null;
  intake_coverage?: {
    source_chars?: number;
    analyzed_chars?: number;
    coverage_pct?: number;
    method?: string;
  } | null;
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

type Specimen = {
  id: string;
  platform: string | null;
  account_handle: string | null;
  post_url: string | null;
  property: string | null;
  channel: string | null;
  format: string | null;
  observed_metrics: { views?: number | null; likes?: number | null; comments?: number | null; shares?: number | null } | null;
  comment_sentiment: string | null;
  mechanics: string[] | null;
  dissection: string | null;
  authenticity: "high" | "medium" | "low" | "unknown" | null;
  authenticity_reason: string | null;
};

type FeedMode = "findings" | "patterns" | "specimens";
type Density = "compact" | "comfortable";

const densityKey = "atlas-density-v1";

export function FeedClient() {
  const { filters, setFilters, ready } = useAtlasFilters();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [pinned, setPinned] = useState<Finding[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [mode, setMode] = useState<FeedMode>("findings");
  const [density, setDensity] = useState<Density>("compact");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [counts, setCounts] = useState(emptyCounts());
  const properties = useProperties(false);
  const propertyLabels = useMemo(() => new Map(properties.map((property) => [property.slug, property.display_name])), [properties]);

  useEffect(() => {
    setShowWelcome(window.localStorage.getItem("atlas-welcome-dismissed") !== "true");
    const storedDensity = window.localStorage.getItem(densityKey);
    if (storedDensity === "compact" || storedDensity === "comfortable") setDensity(storedDensity);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    fetch(`/api/feed?${queryString(filters, mode)}`)
      .then((response) => response.json())
      .then((payload) => {
        setFindings(payload.findings ?? []);
        setPinned(payload.pinned ?? []);
        setPatterns(payload.patterns ?? []);
        setSpecimens(payload.specimens ?? []);
        setCounts(payload.counts ?? emptyCounts());
      })
      .finally(() => setLoading(false));
  }, [filters, mode, ready]);

  function setStoredDensity(next: Density) {
    setDensity(next);
    window.localStorage.setItem(densityKey, next);
  }

  const count = mode === "patterns" ? patterns.length : mode === "specimens" ? specimens.length : findings.length;

  async function dismissPinned(finding: Finding) {
    await fetch(`/api/feed/${finding.id}/read`, { method: "POST" });
    setPinned((current) => current.filter((item) => item.id !== finding.id));
  }

  return (
    <section className={`view density-${density}`}>
      <div className="view-heading">
        <div>
          <p className="eyebrow">Findings</p>
          <h2>{mode === "patterns" ? "Pattern ledger" : mode === "specimens" ? "Specimens" : "Research feed"}</h2>
        </div>
        <span className="counter">{loading ? "--" : count}</span>
      </div>

      <div className="control-strip">
        <button className={mode === "findings" ? "active" : ""} type="button" onClick={() => setMode("findings")}>Findings</button>
        <button className={mode === "patterns" ? "active" : ""} type="button" onClick={() => setMode("patterns")}>Patterns</button>
        <button className={mode === "specimens" ? "active" : ""} type="button" onClick={() => setMode("specimens")}>Specimens</button>
        <button className={density === "compact" ? "active" : ""} type="button" onClick={() => setStoredDensity("compact")}>Compact</button>
        <button className={density === "comfortable" ? "active" : ""} type="button" onClick={() => setStoredDensity("comfortable")}>Comfortable</button>
        <FilterBar filters={filters} counts={counts} onChange={setFilters} />
      </div>

      {showWelcome ? (
        <article className="panel welcome-card">
          <div>
            <h3>Welcome to Atlas.</h3>
            <p>Read what Scout found.</p>
            <p>Approve what feels right.</p>
          </div>
          <button type="button" className="secondary" onClick={() => {
            window.localStorage.setItem("atlas-welcome-dismissed", "true");
            setShowWelcome(false);
          }}>
            Dismiss
          </button>
        </article>
      ) : null}

      <div className="dense-stack">
        {mode === "findings" && pinned.map((finding) => (
          <article className="panel pinned-card" key={`pinned:${finding.id}`}>
            <div>
              <p className="eyebrow">{finding.cadence ?? "weekly"} rhythm</p>
              <h3>{finding.claim}</h3>
            </div>
            {finding.evidence ? <p>{finding.evidence}</p> : null}
            <button className="secondary" type="button" onClick={() => dismissPinned(finding)}>Mark read</button>
          </article>
        ))}
        {loading ? <div className="panel skeleton" /> : null}
        {!loading && count === 0 ? <EmptyState text={emptyFilteredText(filters, mode)} /> : null}
        {mode === "findings" ? findings.map((finding) => (
          <FindingCard
            finding={finding}
            propertyLabels={propertyLabels}
            expanded={expandedId === finding.id}
            onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            key={finding.id}
          />
        )) : null}
        {mode === "patterns" ? patterns.map((pattern) => (
          <PatternCard
            pattern={pattern}
            propertyLabels={propertyLabels}
            expanded={expandedId === pattern.id}
            onToggle={() => setExpandedId(expandedId === pattern.id ? null : pattern.id)}
            key={pattern.id}
          />
        )) : null}
        {mode === "specimens" ? specimens.map((specimen) => (
          <SpecimenCard
            specimen={specimen}
            propertyLabels={propertyLabels}
            expanded={expandedId === specimen.id}
            onToggle={() => setExpandedId(expandedId === specimen.id ? null : specimen.id)}
            key={specimen.id}
          />
        )) : null}
      </div>
    </section>
  );
}

function FindingCard({ finding, expanded, onToggle, propertyLabels }: { finding: Finding; expanded: boolean; onToggle: () => void; propertyLabels?: Map<string, string> }) {
  return (
    <article className={`panel dense-card ${expanded ? "expanded" : ""}`} onClick={onToggle}>
      <CardLine left={finding.claim} property={labelProperty(finding.property, propertyLabels)} channel={finding.channel} right={formatPercent(finding.confidence)} sourceUrl={finding.source_url} />
      {expanded ? (
        <div className="card-expanded">
          {finding.evidence ? <p>{finding.evidence}</p> : null}
          {finding.intake_coverage ? <p className="note">{coverageLabel(finding.intake_coverage)}</p> : null}
          <div className="tag-row">
            <span className="chip">{finding.agent}</span>
            <span className="chip">{formatDate(finding.created_at)}</span>
            {(finding.tags ?? []).slice(0, 5).map((tag) => <span className="chip" key={tag}>{tag}</span>)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function PatternCard({ pattern, expanded, onToggle, propertyLabels }: { pattern: Pattern; expanded: boolean; onToggle: () => void; propertyLabels?: Map<string, string> }) {
  return (
    <article className={`panel dense-card ${expanded ? "expanded" : ""}`} onClick={onToggle}>
      <CardLine left={pattern.name} property={labelProperty(pattern.property, propertyLabels)} channel={pattern.channel} right={`seen ${pattern.support_count}x`} />
      {expanded ? (
        <div className="card-expanded">
          {pattern.description ? <p>{pattern.description}</p> : null}
          <div className="tag-row">
            <span className={`chip ${pattern.status}`}>{pattern.status}</span>
            <span className="chip">confidence {formatPercent(pattern.confidence)}</span>
          </div>
          <div className="receipt-list">
            {pattern.source_findings.map((finding) => <FindingCard finding={finding} expanded={false} onToggle={() => undefined} propertyLabels={propertyLabels} key={finding.id} />)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SpecimenCard({ specimen, expanded, onToggle, propertyLabels }: { specimen: Specimen; expanded: boolean; onToggle: () => void; propertyLabels?: Map<string, string> }) {
  const views = specimen.observed_metrics?.views;
  return (
    <article className={`panel dense-card ${expanded ? "expanded" : ""}`} onClick={onToggle}>
      <CardLine
        left={`${specimen.account_handle ?? specimen.platform ?? "Specimen"} ${specimen.format ?? ""}`.trim()}
        property={labelProperty(specimen.property ?? "general", propertyLabels)}
        channel={specimen.channel ?? "general"}
        right={views ? `${compactNumber(views)} views` : specimen.authenticity ?? "unknown"}
        sourceUrl={specimen.post_url}
      />
      {expanded ? (
        <div className="card-expanded">
          {specimen.authenticity === "low" ? <p className="note">suspected inflated — heuristic, not accusation.</p> : null}
          {specimen.dissection ? <p>{specimen.dissection}</p> : null}
          <div className="tag-row">
            <span className={`chip ${specimen.authenticity === "low" ? "failed" : ""}`}>auth {specimen.authenticity ?? "unknown"}</span>
            <span className="chip">likes {specimen.observed_metrics?.likes ?? "--"}</span>
            <span className="chip">comments {specimen.observed_metrics?.comments ?? "--"}</span>
          </div>
          {specimen.authenticity_reason ? <p className="note">{specimen.authenticity_reason}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function CardLine({ left, property, channel, right, sourceUrl }: { left: string; property: string; channel?: string | null; right: string; sourceUrl?: string | null }) {
  return (
    <div className="card-line">
      <div className="micro-badges">
        <span>{property}</span>
        <span>{channel ?? "general"}</span>
      </div>
      <strong>{left}</strong>
      <span>{right}</span>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label="Open source">
          ↗
        </a>
      ) : null}
    </div>
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

function emptyFilteredText(filters: AtlasFilters, mode: FeedMode) {
  if (filters.property === "all" && filters.channel === "all") {
    if (mode === "specimens") return "Drop competitor posts here; Atlas keeps the receipts.";
    return "Scout's nightly research lands here.";
  }
  return `No ${filters.property}+${filters.channel} ${mode} yet — scout hunts what config targets. Add targets or drop links.`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatPercent(value: number | null) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(Math.round(value));
}

function labelProperty(slug: string, labels?: Map<string, string>) {
  return labels?.get(slug) ?? slug;
}

function coverageLabel(value: NonNullable<Finding["intake_coverage"]>) {
  const pct = Number(value.coverage_pct ?? 100);
  const words = Math.max(0, Math.round(Number(value.source_chars ?? 0) / 5));
  const method = String(value.method ?? "full_text").replace("_", " ");
  if (pct >= 100) return `Studied: 100% of ${method} (${words.toLocaleString()} words)`;
  return `Studied: ${pct}% - truncated at token budget.`;
}
