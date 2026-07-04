"use client";

import { useEffect, useMemo, useState } from "react";

type OperatorRole = "owner" | "curator" | "viewer";
type CalendarCard = {
  id: string;
  type: "action" | "asset";
  title: string;
  property: string;
  channel: string;
  status: string;
  scheduled_for: string | null;
  day: string;
  results: Array<{ id: string; metric: string; value: number }>;
};

type CalendarPayload = {
  start: string;
  days: string[];
  channels: string[];
  cards: CalendarCard[];
  ghosts: Array<{ day: string; channel: string; label: string }>;
};

export function CalendarClient({ userRole }: { userRole: OperatorRole }) {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const canSchedule = userRole === "owner" || userRole === "curator";

  async function load(nextStart = start) {
    setLoading(true);
    const response = await fetch(`/api/calendar?start=${nextStart}`);
    const data = await response.json();
    setPayload(data);
    setLoading(false);
  }

  useEffect(() => {
    load(start);
  }, [start]);

  const cardsBySlot = useMemo(() => {
    const map = new Map<string, CalendarCard[]>();
    for (const card of payload?.cards ?? []) {
      const key = `${card.day}:${card.channel}`;
      map.set(key, [...(map.get(key) ?? []), card]);
    }
    return map;
  }, [payload]);

  async function schedule(card: CalendarCard) {
    if (!canSchedule) return;
    const current = card.scheduled_for ? card.scheduled_for.slice(0, 16) : `${card.day}T19:00`;
    const next = window.prompt("Schedule slot (YYYY-MM-DDTHH:mm)", current);
    if (next === null) return;
    const response = await fetch("/api/calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: card.type, id: card.id, scheduled_for: next || null }),
    });
    if (response.ok) await load(start);
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>Rhythm view</h2>
        </div>
        <input className="date-picker" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
      </div>

      {loading || !payload ? <div className="panel skeleton" /> : (
        <div className="calendar-week">
          {payload.days.map((day) => (
            <section className="calendar-day" key={day}>
              <h3>{formatDay(day)}</h3>
              <div className="calendar-lanes">
                {payload.channels.map((channel) => {
                  const key = `${day}:${channel}`;
                  const cards = cardsBySlot.get(key) ?? [];
                  const ghosts = payload.ghosts.filter((ghost) => ghost.day === day && ghost.channel === channel);
                  return (
                    <div className="calendar-lane" key={key}>
                      <span className="lane-title">{channel}</span>
                      {cards.map((card) => (
                        <button className={`calendar-card ${card.type}`} type="button" key={`${card.type}:${card.id}`} onClick={() => schedule(card)}>
                          <strong>{card.title}</strong>
                          <span>{card.property} / {card.status}</span>
                          {card.results.map((result) => (
                            <small key={result.id}>{result.metric}: {result.value}</small>
                          ))}
                        </button>
                      ))}
                      {cards.length === 0 && ghosts.map((ghost) => (
                        <div className="calendar-card ghost" key={`${key}:${ghost.label}`}>
                          {ghost.label}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
