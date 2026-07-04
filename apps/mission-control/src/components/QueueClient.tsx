"use client";

import { useEffect, useState } from "react";
import { FilterBar, emptyCounts, useAtlasFilters, type AtlasFilters } from "./FilterBar";

type ActionStatus = "pending" | "approved" | "killed" | "published";
type QueueDecision = "approve" | "kill" | "edit" | "revive";
type Density = "compact" | "comfortable";

type Action = {
  id: string;
  created_at: string;
  decided_at: string | null;
  agent: string;
  property: string;
  kind: string;
  channel: string | null;
  payload: Record<string, unknown>;
  compliance_status: string;
  compliance_notes: string | null;
  status: ActionStatus;
};

type ReasonPicker = {
  action: Action;
  decision: "kill" | "revive";
};

const statuses: Array<{ key: ActionStatus; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "killed", label: "Killed" },
  { key: "published", label: "Published" },
];

const quickReasons = ["Wrong voice", "Weak hook", "Too salesy", "Off-brand", "Not now"];
const densityKey = "atlas-density-v1";

export function QueueClient() {
  const { filters, setFilters, ready } = useAtlasFilters();
  const [actions, setActions] = useState<Action[]>([]);
  const [status, setStatus] = useState<ActionStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counts, setCounts] = useState(emptyCounts());
  const [statusCounts, setStatusCounts] = useState<Record<ActionStatus, number>>({
    pending: 0,
    approved: 0,
    killed: 0,
    published: 0,
  });
  const [reasonPicker, setReasonPicker] = useState<ReasonPicker | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [resultActionId, setResultActionId] = useState<string | null>(null);
  const [resultMetric, setResultMetric] = useState("views");
  const [resultValue, setResultValue] = useState("");
  const [resultCheckpoint, setResultCheckpoint] = useState("24h");
  const [resultNote, setResultNote] = useState("");
  const [density, setDensity] = useState<Density>("compact");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const storedDensity = window.localStorage.getItem(densityKey);
    if (storedDensity === "compact" || storedDensity === "comfortable") setDensity(storedDensity);
  }, []);

  function setStoredDensity(next: Density) {
    setDensity(next);
    window.localStorage.setItem(densityKey, next);
  }

  async function load(nextStatus = status, nextFilters = filters) {
    setLoading(true);
    const response = await fetch(`/api/queue?${queryString(nextFilters, nextStatus)}`);
    const payload = await response.json();
    setActions(payload.actions ?? []);
    setCounts(payload.counts ?? emptyCounts());
    setStatusCounts(payload.statusCounts ?? statusCounts);
    setLoading(false);
  }

  useEffect(() => {
    if (ready) load(status, filters);
  }, [ready, status, filters]);

  async function decide(action: Action, decision: QueueDecision, reason?: string | null) {
    setBusyId(action.id);
    const response = await fetch(`/api/actions/${action.id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: reason || undefined }),
    });

    if (response.ok) {
      await load(status, filters);
    }
    setBusyId(null);
    setReasonPicker(null);
    setCustomReason("");
  }

  async function edit(action: Action) {
    const reason = window.prompt("Edit note for Atlas to apply before publishing:", "Tighten hook and re-check compliance.");
    if (!reason) return;
    await decide(action, "edit", reason);
  }

  async function markPublished(action: Action) {
    setBusyId(action.id);
    const response = await fetch(`/api/actions/${action.id}/publish`, {
      method: "POST",
    });

    if (response.ok) {
      await load(status, filters);
    }
    setBusyId(null);
  }

  async function logResults(action: Action) {
    setBusyId(action.id);
    const response = await fetch(`/api/actions/${action.id}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metric: resultMetric,
        value: Number(resultValue),
        checkpoint: resultCheckpoint,
        note: resultNote,
      }),
    });

    if (response.ok) {
      setResultActionId(null);
      setResultMetric("views");
      setResultValue("");
      setResultCheckpoint("24h");
      setResultNote("");
      await load(status, filters);
    }
    setBusyId(null);
  }

  return (
    <section className={`view density-${density}`}>
      <div className="view-heading">
        <div>
          <p className="eyebrow">Approvals</p>
          <h2>Action queue</h2>
        </div>
        <span className="counter">{loading ? "--" : actions.length}</span>
      </div>

      <div className="control-strip" aria-label="Queue controls">
        {statuses.map((item) => (
          <button
            className={status === item.key ? "active" : ""}
            type="button"
            key={item.key}
            onClick={() => setStatus(item.key)}
          >
            {item.label} {statusCounts[item.key] ?? 0}
          </button>
        ))}
        <button className={density === "compact" ? "active" : ""} type="button" onClick={() => setStoredDensity("compact")}>Compact</button>
        <button className={density === "comfortable" ? "active" : ""} type="button" onClick={() => setStoredDensity("comfortable")}>Comfortable</button>
        <FilterBar filters={filters} counts={counts} onChange={setFilters} />
      </div>

      {reasonPicker ? (
        <article className="panel reason-panel">
          <div>
            <p className="eyebrow">{reasonPicker.decision === "kill" ? "Why kill?" : "Why revive?"}</p>
            <h3>{String(reasonPicker.action.payload.title ?? reasonPicker.action.payload.hook ?? "Untitled action")}</h3>
          </div>
          <div className="reason-grid">
            {quickReasons.map((reason) => (
              <button
                type="button"
                key={reason}
                onClick={() => decide(reasonPicker.action, reasonPicker.decision, reason)}
                disabled={busyId === reasonPicker.action.id}
              >
                {reason}
              </button>
            ))}
            <button
              className="secondary"
              type="button"
              onClick={() => decide(reasonPicker.action, reasonPicker.decision, null)}
              disabled={busyId === reasonPicker.action.id}
            >
              Skip
            </button>
          </div>
          <div className="inline-reason">
            <input
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
              placeholder="Optional custom reason"
            />
            <button
              type="button"
              onClick={() => decide(reasonPicker.action, reasonPicker.decision, customReason)}
              disabled={busyId === reasonPicker.action.id || !customReason.trim()}
            >
              Save
            </button>
          </div>
        </article>
      ) : null}

      <div className="dense-stack">
        {loading ? <div className="panel skeleton" /> : null}
        {!loading && actions.length === 0 ? <div className="empty-state">{emptyState(status, filters)}</div> : null}
        {actions.map((action) => (
          <article className={`panel dense-card action-panel ${expandedId === action.id ? "expanded" : ""}`} key={action.id}>
            <div className="card-line" onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}>
              <div className="micro-badges">
                <span>{action.property}</span>
                <span>{action.channel ?? "general"}</span>
              </div>
              <strong>{String(action.payload.title ?? action.payload.hook ?? "Untitled action")}</strong>
              <span>{action.status}</span>
            </div>
            {expandedId === action.id ? (
              <div className="card-expanded">
                <p>{String(action.payload.body ?? action.payload.caption ?? "No body provided.")}</p>
                {isPatternScore(action.payload.pattern_score) ? (
                  <p className="note">
                    {action.payload.pattern_score.label} — {action.payload.pattern_score.caveat}
                  </p>
                ) : null}
                <div className="tag-row">
                  <span className={`chip ${action.compliance_status}`}>compliance {action.compliance_status}</span>
                  <span className="chip">{action.kind}</span>
                  <span className="chip">{action.agent}</span>
                  {action.decided_at ? <span className="chip">{formatDate(action.decided_at)}</span> : null}
                </div>
                {action.compliance_notes ? <p className="note">{action.compliance_notes}</p> : null}
                <QueueButtons
                  action={action}
                  busy={busyId === action.id}
                  onApprove={() => decide(action, "approve", "Approved from Mission Control queue.")}
                  onEdit={() => edit(action)}
                  onKill={() => setReasonPicker({ action, decision: "kill" })}
                  onRevive={() => setReasonPicker({ action, decision: "revive" })}
                  onPublish={() => markPublished(action)}
                  onLogResults={() => setResultActionId(resultActionId === action.id ? null : action.id)}
                />
                {resultActionId === action.id ? (
                  <div className="result-form">
                    <select value={resultMetric} onChange={(event) => setResultMetric(event.target.value)}>
                      <option value="views">views</option>
                      <option value="reach">reach</option>
                      <option value="profile_visits">profile visits</option>
                      <option value="link_taps">link taps</option>
                      <option value="follows">follows</option>
                      <option value="custom">custom</option>
                    </select>
                    <input inputMode="numeric" value={resultValue} onChange={(event) => setResultValue(event.target.value)} placeholder="Value" />
                    <select value={resultCheckpoint} onChange={(event) => setResultCheckpoint(event.target.value)}>
                      <option value="24h">24h</option>
                      <option value="72h">72h</option>
                      <option value="7d">7d</option>
                      <option value="other">other</option>
                    </select>
                    <input value={resultNote} onChange={(event) => setResultNote(event.target.value)} placeholder="Optional note" />
                    <button type="button" onClick={() => logResults(action)} disabled={busyId === action.id || !resultValue}>
                      Save result
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function QueueButtons({
  action,
  busy,
  onApprove,
  onEdit,
  onKill,
  onRevive,
  onPublish,
  onLogResults,
}: {
  action: Action;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onKill: () => void;
  onRevive: () => void;
  onPublish: () => void;
  onLogResults: () => void;
}) {
  const isGateKilledStore = action.status === "killed" && action.property === "store" && action.compliance_status === "failed";

  if (action.status === "approved") {
    return (
      <div className="button-row">
        <button type="button" onClick={onPublish} disabled={busy}>
          Mark published
        </button>
        <button className="danger" type="button" onClick={onKill} disabled={busy}>
          Kill
        </button>
      </div>
    );
  }

  if (action.status === "killed") {
    return (
      <div className="button-row">
        {!isGateKilledStore ? (
          <button type="button" onClick={onRevive} disabled={busy}>
            Revive
          </button>
        ) : null}
      </div>
    );
  }

  if (action.status === "published") {
    return (
      <div className="button-row">
        <button type="button" onClick={onLogResults} disabled={busy}>
          Log results
        </button>
      </div>
    );
  }

  return (
    <div className="button-row">
      <button type="button" onClick={onApprove} disabled={busy}>
        Approve
      </button>
      <button className="secondary" type="button" onClick={onEdit} disabled={busy}>
        Edit
      </button>
      <button className="danger" type="button" onClick={onKill} disabled={busy}>
        Kill
      </button>
    </div>
  );
}

function queryString(filters: AtlasFilters, status: ActionStatus) {
  const params = new URLSearchParams({ status });
  if (filters.property !== "all") params.set("property", filters.property);
  if (filters.channel !== "all") params.set("channel", filters.channel);
  return params.toString();
}

function emptyState(status: ActionStatus, filters: AtlasFilters) {
  if (status === "killed") return "Nothing dies here, it just waits. Revive anything that aged well.";
  if (filters.property !== "all" || filters.channel !== "all") {
    const property = filters.property === "all" ? "All" : filters.property;
    const channel = filters.channel === "all" ? "All" : filters.channel;
    return `No ${property}+${channel} drafts yet.`;
  }
  return "Drafts wait here. Approve or Kill — every tap teaches Atlas your taste.";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
