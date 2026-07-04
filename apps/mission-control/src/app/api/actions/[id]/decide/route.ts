import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { decideAction, type Decision } from "@/lib/atlas/data";

const decisions = new Set(["approve", "kill", "edit"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const { decision, reason } = (await request.json()) as {
    decision?: Decision;
    reason?: string;
  };

  if (!decision || !decisions.has(decision)) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  await decideAction(id, decision, reason);
  return NextResponse.json({ ok: true });
}
