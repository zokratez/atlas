"use client";

import { useEffect, useState } from "react";

type Action = {
  id: string;
  created_at: string;
  agent: string;
  property: string;
  kind: string;
  channel: string | null;
  payload: Record<string, unknown>;
  compliance_status: string;
  compliance_notes: string | null;
  status: string;
};

export function QueueClient() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/queue");
    const payload = await response.json();
    setActions(payload.actions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(action: Action, decision: "approve" | "kill" | "edit") {
    setBusyId(action.id);
    const reason =
      decision === "edit"
        ? window.prompt("Edit note for Atlas to apply before publishing:", "Tighten hook and re-check compliance.")
        : decision === "kill"
          ? "Killed from Mission Control queue."
          : "Approved from Mission Control queue.";

    if (decision === "edit" && !reason) {
      setBusyId(null);
      return;
    }

    const response = await fetch(`/api/actions/${action.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });

    if (response.ok) {
      await load();
    }
    setBusyId(null);
  }

  async function markPublished(action: Action) {
    setBusyId(action.id);
    const response = await fetch(`/api/actions/${action.id}/publish`, {
      method: "POST",
    });

    if (response.ok) {
      await load();
    }
    setBusyId(null);
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Approvals</p>
          <h2>Action queue</h2>
        </div>
        <span className="counter">{loading ? "--" : actions.length}</span>
      </div>

      <div className="stack">
        {loading ? <div className="panel skeleton" /> : null}
        {!loading && actions.length === 0 ? (
          <div className="empty-state">
            Drafts wait here. Approve or Kill — every tap teaches Atlas your taste.
          </div>
        ) : null}
        {actions.map((action) => (
          <article className="panel action-panel" key={action.id}>
            <div className="panel-meta">
              <span>{action.property}</span>
              <span>{action.kind}</span>
              <span>{action.channel ?? "no-channel"}</span>
              <span>{action.status}</span>
            </div>
            <h3>{String(action.payload.title ?? action.payload.hook ?? "Untitled action")}</h3>
            <p>{String(action.payload.body ?? action.payload.caption ?? "No body provided.")}</p>
            {isPatternScore(action.payload.pattern_score) ? (
              <p className="note">
                {action.payload.pattern_score.label} — {action.payload.pattern_score.caveat}
              </p>
            ) : null}
            <div className="tag-row">
              <span className={`chip ${action.compliance_status}`}>
                compliance {action.compliance_status}
              </span>
              <span className="chip">{action.agent}</span>
            </div>
            {action.compliance_notes ? <p className="note">{action.compliance_notes}</p> : null}
            <div className="button-row">
              {action.status === "approved" ? (
                <button type="button" onClick={() => markPublished(action)} disabled={busyId === action.id}>
                  Mark published
                </button>
              ) : (
                <button type="button" onClick={() => decide(action, "approve")} disabled={busyId === action.id}>
                  Approve
                </button>
              )}
              {action.status === "pending" ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => decide(action, "edit")}
                  disabled={busyId === action.id}
                >
                  Edit
                </button>
              ) : null}
              <button
                className="danger"
                type="button"
                onClick={() => decide(action, "kill")}
                disabled={busyId === action.id}
              >
                Kill
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function isPatternScore(value: unknown): value is { label: string; caveat: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "caveat" in value &&
    typeof (value as { label?: unknown }).label === "string" &&
    typeof (value as { caveat?: unknown }).caveat === "string"
  );
}
