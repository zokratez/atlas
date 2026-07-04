import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { publishActionRendition } from "@/lib/atlas/data";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; index: string }> },
) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const { id, index } = await context.params;
  const renditionIndex = Number(index);
  if (!Number.isInteger(renditionIndex) || renditionIndex < 0) {
    return NextResponse.json({ error: "Invalid rendition index." }, { status: 400 });
  }

  try {
    const result = await publishActionRendition(id, renditionIndex, user);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not publish rendition." },
      { status: 400 },
    );
  }
}
