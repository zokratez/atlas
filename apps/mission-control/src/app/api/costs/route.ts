import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { getCostsSummary } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const costs = await getCostsSummary();
  return NextResponse.json(costs);
}
