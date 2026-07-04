"use client";

import { useEffect, useState } from "react";

type Finding = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  claim: string;
  evidence: string | null;
  source_url: string | null;
  confidence: number | null;
  tags: string[] | null;
};

export function FeedClient() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    setShowWelcome(window.localStorage.getItem("atlas-welcome-dismissed") !== "true");

    fetch("/api/feed")
      .then((response) => response.json())
      .then((payload) => setFindings(payload.findings ?? []))
      .finally(() => setLoading(false));
  }, []);

  function dismissWelcome() {
    window.localStorage.setItem("atlas-welcome-dismissed", "true");
    setShowWelcome(false);
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Findings</p>
          <h2>Research feed</h2>
        </div>
        <span className="counter">{loading ? "--" : findings.length}</span>
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

      <div className="stack">
        {loading ? <PanelSkeleton /> : null}
        {!loading && findings.length === 0 ? <EmptyState text="Scout's nightly research lands here." /> : null}
        {findings.map((finding) => (
          <article className="panel" key={finding.id}>
            <div className="panel-meta">
              <span>{finding.property}</span>
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
          </article>
        ))}
      </div>
    </section>
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
