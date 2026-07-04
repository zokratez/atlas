import { NextResponse } from "next/server";
import { requireApiRole, requireApiUser } from "@/lib/atlas/auth";
import { listProperties, upsertProperty } from "@/lib/atlas/data";

export async function GET(request: Request) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";
  const properties = await listProperties({ includeInactive });
  return NextResponse.json({ properties });
}

export async function POST(request: Request) {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => ({}))) as {
    display_name?: string;
    color?: string | null;
  };

  try {
    const property = await upsertProperty({
      displayName: body.display_name ?? "",
      color: body.color,
    });
    return NextResponse.json({ property });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save property." },
      { status: 400 },
    );
  }
}
