import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const { data: asset, error } = await atlasDb()
    .from("assets")
    .select("id, kind, duration_seconds, raw_video_path, file_path")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (asset.kind !== "video") return NextResponse.json({ error: "Only video assets can be deep-dissected." }, { status: 400 });

  const duration = Number(asset.duration_seconds ?? 20);
  const estimatedUsd = Number((0.004 + Math.min(0.06, duration * 0.0008)).toFixed(4));

  return NextResponse.json({
    estimatedUsd,
    frameCount: 5,
    transcript: "local whisper.cpp preferred; $0 audio cost when configured",
    command: `cd /Users/samoteo/Code/atlas/workers && npm run video:dissect -- --asset ${asset.id}`,
    canRun: Boolean(asset.raw_video_path || asset.file_path),
    note: "Explicit local worker run only. Raw video bytes are never sent to models.",
  });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;
  const { id } = await context.params;

  return NextResponse.json({
    queued: false,
    asset_id: id,
    message: "Deep video dissection is armed but not auto-run from Mission Control. Run the local worker command after confirming cost.",
  }, { status: 202 });
}
