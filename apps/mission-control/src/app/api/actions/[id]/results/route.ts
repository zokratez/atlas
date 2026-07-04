import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { logActionResult, type ResultMetric } from "@/lib/atlas/data";

const metrics = new Set(["views", "reach", "profile_visits", "link_taps", "follows", "custom"]);
const checkpoints = new Set(["24h", "72h", "7d", "other"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const body = (await request.json()) as {
    metric?: ResultMetric;
    value?: number;
    checkpoint?: string;
    note?: string;
  };

  if (!body.metric || !metrics.has(body.metric)) {
    return NextResponse.json({ error: "Invalid metric." }, { status: 400 });
  }

  if (!body.checkpoint || !checkpoints.has(body.checkpoint)) {
    return NextResponse.json({ error: "Invalid checkpoint." }, { status: 400 });
  }

  const value = Number(body.value);
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: "Invalid value." }, { status: 400 });
  }

  await logActionResult(id, {
    metric: body.metric,
    value,
    checkpoint: body.checkpoint,
    note: body.note,
  });

  return NextResponse.json({ ok: true });
}
