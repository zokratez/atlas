import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const { data, error } = await atlasDb()
    .from("intake")
    .select("id, source_chars, analyzed_chars, coverage_pct, notes")
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const remainingChars = Math.max(0, Number(data.source_chars ?? 0) - Number(data.analyzed_chars ?? 0));
  const estimatedChunks = Math.max(1, Math.ceil(remainingChars / 12000));
  const estimatedUsd = Number((estimatedChunks * 0.01).toFixed(4));
  const nextNotes = [
    data.notes,
    `full_study_requested:${new Date().toISOString()}; estimated_chunks=${estimatedChunks}; estimated_usd=${estimatedUsd}`,
  ].filter(Boolean).join("\n");

  const { error: updateError } = await atlasDb()
    .from("intake")
    .update({ status: "new", notes: nextNotes })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    queued: true,
    estimatedChunks,
    estimatedUsd,
    note: "Queued for governed full-study pass on next Scout run.",
  });
}
