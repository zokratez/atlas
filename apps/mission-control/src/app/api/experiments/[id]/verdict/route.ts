import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { setExperimentVerdict, type Verdict } from "@/lib/atlas/data";

const verdicts = new Set(["keep", "kill", "blemish"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { id } = await context.params;
  const { verdict } = (await request.json()) as { verdict?: Verdict };

  if (!verdict || !verdicts.has(verdict)) {
    return NextResponse.json({ error: "Invalid verdict." }, { status: 400 });
  }

  await setExperimentVerdict(id, verdict);
  return NextResponse.json({ ok: true });
}
