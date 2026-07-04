import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { updateProperty } from "@/lib/atlas/data";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    display_name?: string;
    color?: string | null;
    active?: boolean;
  };

  try {
    const property = await updateProperty(slug, {
      displayName: body.display_name,
      color: body.color,
      active: body.active,
    });
    return NextResponse.json({ property });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update property." },
      { status: 400 },
    );
  }
}
