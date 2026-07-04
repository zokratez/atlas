import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { markFindingRead } from "@/lib/atlas/data";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  await markFindingRead(id, user.email);
  return NextResponse.json({ ok: true });
}
