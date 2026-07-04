import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import {
  getFeedCounts,
  listFindings,
  listPatterns,
  listSpecimens,
  type AtlasChannelFilter,
  type AtlasPropertyFilter,
} from "@/lib/atlas/data";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "patterns" ? "patterns" : "findings";
  const resolvedMode = searchParams.get("mode") === "specimens" ? "specimens" : mode;
  const filters = {
    property: (searchParams.get("property") ?? "all") as AtlasPropertyFilter,
    channel: (searchParams.get("channel") ?? "all") as AtlasChannelFilter,
  };

  const [findings, patterns, counts] = await Promise.all([
    resolvedMode === "findings" ? listFindings(filters) : Promise.resolve([]),
    resolvedMode === "patterns" ? listPatterns(filters) : Promise.resolve([]),
    getFeedCounts(),
  ]);
  const specimens = resolvedMode === "specimens" ? await listSpecimens(filters) : [];

  return NextResponse.json({ findings, patterns, specimens, counts });
}
