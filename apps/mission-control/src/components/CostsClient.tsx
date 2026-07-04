"use client";

import { useEffect, useState } from "react";

type CostRow = {
  created_at: string;
  agent: string;
  provider: string;
  usd: number;
};

type CostsPayload = {
  todayUsd: number;
  monthUsd: number;
  capUsd: number;
  isNearCap: boolean;
  rows: CostRow[];
};

export function CostsClient() {
  const [costs, setCosts] = useState<CostsPayload | null>(null);

  useEffect(() => {
    fetch("/api/costs")
      .then((response) => response.json())
      .then(setCosts);
  }, []);

  if (!costs) {
    return (
      <section className="view">
        <div className="panel skeleton" />
      </section>
    );
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Governance</p>
          <h2>Costs</h2>
        </div>
        <span className="counter">${costs.todayUsd.toFixed(2)}</span>
      </div>

      {costs.isNearCap ? (
        <div className="alert-banner">
          Daily spend is at or above 80% of the ${costs.capUsd.toFixed(2)} cap.
        </div>
      ) : null}

      <div className="metric-grid">
        <div className="metric">
          <span>Today</span>
          <strong>${costs.todayUsd.toFixed(4)}</strong>
        </div>
        <div className="metric">
          <span>MTD</span>
          <strong>${costs.monthUsd.toFixed(4)}</strong>
        </div>
        <div className="metric">
          <span>Daily cap</span>
          <strong>${costs.capUsd.toFixed(2)}</strong>
        </div>
      </div>

      <div className="table-panel">
        {costs.rows.length === 0 ? <div className="empty-state">No model costs recorded this month.</div> : null}
        {costs.rows.map((row, index) => (
          <div className="cost-row" key={`${row.created_at}-${index}`}>
            <span>{row.agent}</span>
            <span>{row.provider}</span>
            <strong>${Number(row.usd).toFixed(4)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
