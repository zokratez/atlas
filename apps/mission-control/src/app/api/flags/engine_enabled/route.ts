import { NextRequest, NextResponse } from "next/server";
import { requireApiRole, requireApiUser } from "@/lib/atlas/auth";
import { getEngineEnabled, setEngineEnabled } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const flag = await getEngineEnabled();
  return NextResponse.json(flag);
}

export async function PUT(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { enabled } = (await request.json()) as { enabled?: boolean };

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean." }, { status: 400 });
  }

  const flag = await setEngineEnabled(enabled);
  return NextResponse.json(flag);
}
