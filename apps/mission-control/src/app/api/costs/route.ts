import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { getCostsSummary } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const costs = await getCostsSummary();
  return NextResponse.json(costs);
}
