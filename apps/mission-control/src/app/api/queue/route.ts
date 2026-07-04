import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { listPendingActions } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const actions = await listPendingActions();
  return NextResponse.json({ actions });
}
