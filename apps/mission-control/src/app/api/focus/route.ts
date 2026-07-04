import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { getFocusProperty, setFocusProperty } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiRole("viewer");
  if (user instanceof NextResponse) return user;

  const focusProperty = await getFocusProperty();
  return NextResponse.json({ focusProperty });
}

export async function PUT(request: NextRequest) {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const { focusProperty } = (await request.json()) as { focusProperty?: string };
  if (!focusProperty) {
    return NextResponse.json({ error: "focusProperty is required." }, { status: 400 });
  }

  const flag = await setFocusProperty(focusProperty);
  return NextResponse.json(flag);
}
