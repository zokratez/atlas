import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import {
  getQueueCounts,
  getQueueStatusCounts,
  listQueueActions,
  type ActionStatus,
  type AtlasChannelFilter,
  type AtlasPropertyFilter,
} from "@/lib/atlas/data";

const statuses = new Set(["pending", "approved", "killed", "published"]);

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";
  const filters = {
    property: (searchParams.get("property") ?? "all") as AtlasPropertyFilter,
    channel: (searchParams.get("channel") ?? "all") as AtlasChannelFilter,
  };

  if (!statuses.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const [actions, counts, statusCounts] = await Promise.all([
    listQueueActions(status as ActionStatus, filters),
    getQueueCounts(),
    getQueueStatusCounts(filters),
  ]);

  return NextResponse.json({ actions, counts, statusCounts });
}
