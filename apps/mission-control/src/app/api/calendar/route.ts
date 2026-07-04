import { NextRequest, NextResponse } from "next/server";
import { requireApiRole, requireApiUser } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

const channels = ["seo", "email", "tiktok", "instagram", "youtube", "x", "community", "general"];

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const start = weekStart(searchParams.get("start"));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const [actionsResult, assetsResult, resultsResult] = await Promise.all([
    atlasDb()
      .from("actions")
      .select("id, created_at, property, channel, kind, payload, status, scheduled_for, decided_at")
      .or(`scheduled_for.gte.${start.toISOString()},status.eq.published`)
      .lt("scheduled_for", end.toISOString())
      .limit(200),
    atlasDb()
      .from("assets")
      .select("id, created_at, property, kind, title, status, intended_channels, scheduled_for, recommended_for, recommendation")
      .limit(100),
    atlasDb()
      .from("results")
      .select("id, created_at, property, channel, metric, value, raw")
      .eq("source", "manual")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (actionsResult.error) return NextResponse.json({ error: actionsResult.error.message }, { status: 500 });
  if (assetsResult.error) return NextResponse.json({ error: assetsResult.error.message }, { status: 500 });
  if (resultsResult.error) return NextResponse.json({ error: resultsResult.error.message }, { status: 500 });

  const resultsByAction = groupResults(resultsResult.data ?? []);
  const actionCards = (actionsResult.data ?? []).map((action) => ({
    id: action.id,
    type: "action",
    title: titleForAction(action.payload, action.kind),
    property: action.property,
    channel: normalizeChannel(action.channel),
    status: action.status,
    scheduled_for: action.scheduled_for,
    day: dayKey(action.scheduled_for ?? action.decided_at ?? action.created_at),
    results: resultsByAction.get(action.id) ?? [],
  }));

  const assetCards = (assetsResult.data ?? [])
    .filter((asset) => asset.status === "shelf" || asset.status === "scheduled")
    .map((asset) => {
      const scheduled = asset.scheduled_for ?? asset.recommended_for ?? recommendedDate(asset.recommendation, start);
      return {
        id: asset.id,
        type: "asset",
        title: asset.title,
        property: asset.property,
        channel: normalizeChannel(asset.recommendation?.channel ?? asset.intended_channels?.[0]),
        status: asset.status,
        scheduled_for: scheduled,
        day: dayKey(scheduled),
        results: [],
      };
    });

  return NextResponse.json({
    start: start.toISOString(),
    days: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day.toISOString().slice(0, 10);
    }),
    channels,
    cards: [...actionCards, ...assetCards],
    ghosts: highPerformingSlots(resultsResult.data ?? [], start),
  });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => ({}))) as {
    type?: "action" | "asset";
    id?: string;
    scheduled_for?: string | null;
  };

  if (!body.id || (body.type !== "action" && body.type !== "asset")) {
    return NextResponse.json({ error: "type and id required." }, { status: 400 });
  }
  const scheduledFor = body.scheduled_for ? new Date(body.scheduled_for) : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: "Invalid scheduled_for." }, { status: 400 });
  }

  const table = body.type === "action" ? "actions" : "assets";
  const { error } = await atlasDb()
    .from(table)
    .update({ scheduled_for: scheduledFor ? scheduledFor.toISOString() : null })
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function weekStart(value: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return weekStart(null);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function dayKey(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return date.toISOString().slice(0, 10);
}

function normalizeChannel(value: string | null | undefined) {
  const normalized = (value ?? "general").toLowerCase();
  if (normalized === "ig") return "instagram";
  if (normalized === "yt") return "youtube";
  if (normalized === "twitter") return "x";
  return channels.includes(normalized) ? normalized : "general";
}

function titleForAction(payload: Record<string, unknown> | null, kind: string) {
  const title = payload?.title;
  const hook = payload?.hook;
  if (typeof hook === "string" && hook.trim()) return hook;
  if (typeof title === "string" && title.trim()) return title;
  return `Untitled ${kind}`;
}

function groupResults(rows: Array<{ id: string; metric: string; value: number | string; raw: { action_id?: string } | null }>) {
  const map = new Map<string, Array<{ id: string; metric: string; value: number }>>();
  for (const row of rows) {
    const actionId = row.raw?.action_id;
    if (!actionId) continue;
    map.set(actionId, [...(map.get(actionId) ?? []), { id: row.id, metric: row.metric, value: Number(row.value ?? 0) }]);
  }
  return map;
}

function recommendedDate(recommendation: { best_window?: string } | null, start: Date) {
  const date = new Date(start);
  const text = recommendation?.best_window?.toLowerCase() ?? "";
  date.setDate(start.getDate() + (text.includes("weekend") ? 6 : text.includes("weekday") ? 2 : 1));
  date.setHours(text.includes("morning") ? 9 : text.includes("lunch") ? 12 : 19, 0, 0, 0);
  return date.toISOString();
}

function highPerformingSlots(
  results: Array<{ created_at: string; channel?: string | null; metric: string; value: number | string }>,
  start: Date,
) {
  const rows = results
    .filter((result) => ["views", "reach", "link_taps"].includes(result.metric))
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    .slice(0, 3);
  return rows.map((row, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + ((new Date(row.created_at).getDay() + index) % 7));
    return {
      day: date.toISOString().slice(0, 10),
      channel: normalizeChannel(row.channel),
      label: "pattern data favors posting here.",
    };
  });
}
