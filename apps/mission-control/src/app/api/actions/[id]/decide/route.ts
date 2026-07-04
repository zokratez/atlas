import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { decideAction, type Decision } from "@/lib/atlas/data";

const decisions = new Set(["approve", "kill", "edit", "revive"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const { decision, reason } = (await request.json()) as {
    decision?: Decision;
    reason?: string;
  };

  if (!decision || !decisions.has(decision)) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }

  try {
    await decideAction(id, decision, user, reason);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Decision failed." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
