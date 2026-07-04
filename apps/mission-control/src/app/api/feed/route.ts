import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import {
  getFeedCounts,
  listFindings,
  listPatterns,
  type AtlasChannelFilter,
  type AtlasPropertyFilter,
} from "@/lib/atlas/data";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "patterns" ? "patterns" : "findings";
  const filters = {
    property: (searchParams.get("property") ?? "all") as AtlasPropertyFilter,
    channel: (searchParams.get("channel") ?? "all") as AtlasChannelFilter,
  };

  const [findings, patterns, counts] = await Promise.all([
    mode === "findings" ? listFindings(filters) : Promise.resolve([]),
    mode === "patterns" ? listPatterns(filters) : Promise.resolve([]),
    getFeedCounts(),
  ]);

  return NextResponse.json({ findings, patterns, counts });
}
