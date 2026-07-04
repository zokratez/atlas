import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { getFocusProperty, getTodaySummary } from "@/lib/atlas/data";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const focus = request.nextUrl.searchParams.get("property") || await getFocusProperty();
  const summary = await getTodaySummary(user.email, focus);
  return NextResponse.json(summary);
}
