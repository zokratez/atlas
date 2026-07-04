"use client";

import { useEffect, useState } from "react";

type Experiment = {
  id: string;
  created_at: string;
  property: string;
  hypothesis: string;
  action: string;
  metric: string;
  verdict: "keep" | "kill" | "blemish" | null;
  notes: string | null;
};

export function ExperimentsClient() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/experiments");
    const payload = await response.json();
    setExperiments(payload.experiments ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setVerdict(id: string, verdict: "keep" | "kill" | "blemish") {
    setBusyId(id);
    const response = await fetch(`/api/experiments/${id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    if (response.ok) await load();
    setBusyId(null);
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Learning loop</p>
          <h2>Experiments</h2>
        </div>
        <span className="counter">{loading ? "--" : experiments.length}</span>
      </div>

      <div className="stack">
        {loading ? <div className="panel skeleton" /> : null}
        {!loading && experiments.length === 0 ? (
          <div className="empty-state">Every bet gets a verdict: keep, kill, or blemish.</div>
        ) : null}
        {experiments.map((experiment) => (
          <article className="panel" key={experiment.id}>
            <div className="panel-meta">
              <span>{experiment.property}</span>
              <span>{experiment.metric}</span>
              <span>{experiment.verdict ?? "open"}</span>
            </div>
            <h3>{experiment.hypothesis}</h3>
            <p>{experiment.action}</p>
            {experiment.notes ? <p className="note">{experiment.notes}</p> : null}
            <div className="button-row three">
              <button type="button" disabled={busyId === experiment.id} onClick={() => setVerdict(experiment.id, "keep")}>
                Keep
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busyId === experiment.id}
                onClick={() => setVerdict(experiment.id, "blemish")}
              >
                Blemish
              </button>
              <button
                className="danger"
                type="button"
                disabled={busyId === experiment.id}
                onClick={() => setVerdict(experiment.id, "kill")}
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
