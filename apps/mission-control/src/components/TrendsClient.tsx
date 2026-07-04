"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CostPoint = {
  date: string;
  anthropic: number;
  xai: number;
  other: number;
  total: number;
};

type FindingPoint = {
  date: string;
  scout: number;
  lens: number;
  pulse: number;
  intake: number;
  total: number;
};

type CurationPoint = {
  date: string;
  approve: number;
  kill: number;
};

type TimelinePoint = {
  id: string;
  label: string;
  property: string;
  verdict: "keep" | "kill" | "blemish" | "undecided";
  start: string;
  end: string;
  offsetDays: number;
  durationDays: number;
};

type CostReceipt = {
  id: string;
  created_at: string;
  agent: string;
  provider: string;
  tokens_in: number | null;
  tokens_out: number | null;
  usd: number | string;
};

type FindingReceipt = {
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

type ActionReceipt = {
  id: string;
  agent: string;
  property: string;
  kind: string;
  channel: string | null;
  payload: Record<string, unknown>;
  status: string;
  compliance_status: string;
};

type DecisionReceipt = {
  id: string;
  created_at: string;
  action_id: string | null;
  decision: "approve" | "kill" | "edit";
  reason: string | null;
  action: ActionReceipt | null;
};

type ExperimentReceipt = {
  id: string;
  created_at: string;
  property: string;
  hypothesis: string;
  action: string;
  metric: string;
  verdict: "keep" | "kill" | "blemish" | null;
  verdict_at: string | null;
  notes: string | null;
};

type TrendsPayload = {
  costSeries: CostPoint[];
  findingSeries: FindingPoint[];
  curationSeries: CurationPoint[];
  experiments: TimelinePoint[];
  receipts: {
    costsByDay: Record<string, CostReceipt[]>;
    findingsByDay: Record<string, FindingReceipt[]>;
    curationByDay: Record<string, DecisionReceipt[]>;
    experimentsById: Record<string, ExperimentReceipt>;
  };
};

type Selection =
  | { kind: "costs"; key: string }
  | { kind: "findings"; key: string }
  | { kind: "curation"; key: string }
  | { kind: "experiment"; key: string };

const chartText = "#9da893";
const chartGrid = "rgba(43, 51, 40, 0.72)";
const colors = {
  anthropic: "#7bd88f",
  xai: "#5ed7c6",
  other: "#9da893",
  scout: "#7bd88f",
  lens: "#efc86a",
  pulse: "#5ed7c6",
  intake: "#ff9f6e",
  approve: "#7bd88f",
  kill: "#ff6b6b",
  keep: "#7bd88f",
  blemish: "#efc86a",
  undecided: "#9da893",
};

export function TrendsClient() {
  const [payload, setPayload] = useState<TrendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    fetch("/api/trends")
      .then((response) => response.json())
      .then((data: TrendsPayload) => {
        setPayload(data);
        setSelection(firstSelection(data));
      })
      .finally(() => setLoading(false));
  }, []);

  const receiptCount = useMemo(() => {
    if (!payload || !selection) return 0;
    return getReceiptCount(payload, selection);
  }, [payload, selection]);

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Trends</p>
          <h2>Receipts over time</h2>
        </div>
        <span className="counter">{loading ? "--" : receiptCount}</span>
      </div>

      {loading ? (
        <div className="panel skeleton" />
      ) : payload ? (
        <>
          <div className="chart-grid">
            <ChartPanel
              title="Cost over time"
              empty={payload.costSeries.length === 0}
              onPanelSelect={() => selectLatest(payload.costSeries, "costs", setSelection)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payload.costSeries} onClick={(state) => selectDay(state, "costs", setSelection)}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Legend wrapperStyle={{ color: chartText, fontSize: 11 }} />
                  <Bar dataKey="anthropic" stackId="provider" fill={colors.anthropic} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="xai" stackId="provider" fill={colors.xai} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="other" stackId="provider" fill={colors.other} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Findings over time"
              empty={payload.findingSeries.length === 0}
              onPanelSelect={() => selectLatest(payload.findingSeries, "findings", setSelection)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payload.findingSeries} onClick={(state) => selectDay(state, "findings", setSelection)}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ color: chartText, fontSize: 11 }} />
                  <Line type="monotone" dataKey="scout" stroke={colors.scout} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="lens" stroke={colors.lens} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="pulse" stroke={colors.pulse} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="intake" stroke={colors.intake} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Curation over time"
              empty={payload.curationSeries.length === 0}
              onPanelSelect={() => selectLatest(payload.curationSeries, "curation", setSelection)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payload.curationSeries} onClick={(state) => selectDay(state, "curation", setSelection)}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: chartText, fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Legend wrapperStyle={{ color: chartText, fontSize: 11 }} />
                  <Bar dataKey="approve" fill={colors.approve} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="kill" fill={colors.kill} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Experiments timeline"
              empty={payload.experiments.length === 0}
              emptyText="Verdicts land here when the 30-day loop starts."
              wide
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payload.experiments} layout="vertical" margin={{ left: 6, right: 18 }}>
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: chartText, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={130}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="offsetDays" stackId="timeline" fill="transparent" />
                  <Bar
                    dataKey="durationDays"
                    stackId="timeline"
                    radius={[4, 4, 4, 4]}
                    onClick={(row) => selectExperiment(row, setSelection)}
                  >
                    {payload.experiments.map((experiment) => (
                      <Cell key={experiment.id} fill={colors[experiment.verdict]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <ReceiptPanel payload={payload} selection={selection} />
        </>
      ) : (
        <div className="empty-state">Three nights of data makes this interesting.</div>
      )}
    </section>
  );
}

function ChartPanel({
  title,
  empty,
  emptyText = "Three nights of data makes this interesting.",
  wide = false,
  onPanelSelect,
  children,
}: {
  title: string;
  empty: boolean;
  emptyText?: string;
  wide?: boolean;
  onPanelSelect?: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className={`chart-panel ${wide ? "wide" : ""}`}>
      <button className="chart-panel-title" type="button" onClick={onPanelSelect} disabled={empty || !onPanelSelect}>
        {title}
      </button>
      <div className="chart-frame">{empty ? <div className="empty-state">{emptyText}</div> : children}</div>
    </article>
  );
}

function ReceiptPanel({ payload, selection }: { payload: TrendsPayload; selection: Selection | null }) {
  if (!selection) {
    return <div className="empty-state">Tap a curve or bar to see the receipts.</div>;
  }

  if (selection.kind === "costs") {
    const rows = payload.receipts.costsByDay[selection.key] ?? [];
    return (
      <section className="receipt-panel">
        <ReceiptHeading label="Cost receipts" selection={selection.key} count={rows.length} href="/costs" />
        {rows.map((row) => (
          <article className="receipt-row" key={row.id}>
            <div>
              <strong>${Number(row.usd ?? 0).toFixed(4)}</strong>
              <span>{row.provider} / {row.agent}</span>
            </div>
            <span>{formatTime(row.created_at)}</span>
            <span>{Number(row.tokens_in ?? 0) + Number(row.tokens_out ?? 0)} tokens</span>
          </article>
        ))}
      </section>
    );
  }

  if (selection.kind === "findings") {
    const rows = payload.receipts.findingsByDay[selection.key] ?? [];
    return (
      <section className="receipt-panel">
        <ReceiptHeading label="Finding receipts" selection={selection.key} count={rows.length} href="/feed" />
        {rows.map((row) => (
          <article className="receipt-row tall" key={row.id}>
            <div>
              <strong>{row.claim}</strong>
              <span>{row.property} / {row.agent} / {formatTime(row.created_at)}</span>
            </div>
            {row.evidence ? <p>{row.evidence}</p> : null}
            {row.source_url ? (
              <a className="source-link" href={row.source_url} target="_blank" rel="noreferrer">
                Source ↗
              </a>
            ) : null}
          </article>
        ))}
      </section>
    );
  }

  if (selection.kind === "curation") {
    const rows = payload.receipts.curationByDay[selection.key] ?? [];
    return (
      <section className="receipt-panel">
        <ReceiptHeading label="Taste-training receipts" selection={selection.key} count={rows.length} href="/queue" />
        {rows.map((row) => (
          <article className="receipt-row tall" key={row.id}>
            <div>
              <strong>{row.decision}</strong>
              <span>{row.action ? actionTitle(row.action) : "missing action"} / {formatTime(row.created_at)}</span>
            </div>
            {row.reason ? <p>{row.reason}</p> : null}
          </article>
        ))}
      </section>
    );
  }

  const experiment = payload.receipts.experimentsById[selection.key];
  return (
    <section className="receipt-panel">
      <ReceiptHeading label="Experiment receipt" selection={experiment?.property ?? "unknown"} count={experiment ? 1 : 0} href="/experiments" />
      {experiment ? (
        <article className="receipt-row tall">
          <div>
            <strong>{experiment.hypothesis}</strong>
            <span>
              {experiment.verdict ?? "undecided"} / {formatDate(experiment.created_at)}
              {experiment.verdict_at ? ` to ${formatDate(experiment.verdict_at)}` : ""}
            </span>
          </div>
          <p>{experiment.action}</p>
          <p>Metric: {experiment.metric}</p>
          {experiment.notes ? <p>{experiment.notes}</p> : null}
        </article>
      ) : null}
    </section>
  );
}

function ReceiptHeading({
  label,
  selection,
  count,
  href,
}: {
  label: string;
  selection: string;
  count: number;
  href: string;
}) {
  return (
    <div className="receipt-heading">
      <div>
        <p className="eyebrow">{label}</p>
        <h3>
          {selection} / {count}
        </h3>
      </div>
      <a className="source-link" href={href}>
        Open view
      </a>
    </div>
  );
}

function selectDay(state: unknown, kind: "costs" | "findings" | "curation", setSelection: (selection: Selection) => void) {
  const activeLabel = typeof state === "object" && state !== null && "activeLabel" in state ? String((state as { activeLabel?: unknown }).activeLabel ?? "") : "";
  if (activeLabel) setSelection({ kind, key: activeLabel });
}

function selectExperiment(row: unknown, setSelection: (selection: Selection) => void) {
  const payload =
    typeof row === "object" && row !== null && "payload" in row
      ? (row as { payload?: Partial<TimelinePoint> }).payload
      : null;
  if (payload?.id) setSelection({ kind: "experiment", key: payload.id });
}

function selectLatest<T extends { date: string }>(
  rows: T[],
  kind: "costs" | "findings" | "curation",
  setSelection: (selection: Selection) => void,
) {
  const latest = rows.at(-1);
  if (latest) setSelection({ kind, key: latest.date });
}

function firstSelection(payload: TrendsPayload): Selection | null {
  const latestCost = payload.costSeries.at(-1);
  if (latestCost) return { kind: "costs", key: latestCost.date };
  const latestFinding = payload.findingSeries.at(-1);
  if (latestFinding) return { kind: "findings", key: latestFinding.date };
  const latestCuration = payload.curationSeries.at(-1);
  if (latestCuration) return { kind: "curation", key: latestCuration.date };
  const latestExperiment = payload.experiments.at(-1);
  if (latestExperiment) return { kind: "experiment", key: latestExperiment.id };
  return null;
}

function getReceiptCount(payload: TrendsPayload, selection: Selection) {
  if (selection.kind === "costs") return payload.receipts.costsByDay[selection.key]?.length ?? 0;
  if (selection.kind === "findings") return payload.receipts.findingsByDay[selection.key]?.length ?? 0;
  if (selection.kind === "curation") return payload.receipts.curationByDay[selection.key]?.length ?? 0;
  return payload.receipts.experimentsById[selection.key] ? 1 : 0;
}

function actionTitle(action: ActionReceipt) {
  const hook = action.payload.hook;
  const title = action.payload.title;
  if (typeof hook === "string" && hook.trim()) return hook;
  if (typeof title === "string" && title.trim()) return title;
  return `${action.property} ${action.kind}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

const tooltipStyle = {
  background: "#10130f",
  border: "1px solid #2b3328",
  borderRadius: 6,
  color: "#f1f5ea",
  fontFamily: "var(--font-plex-mono)",
  fontSize: 11,
};
