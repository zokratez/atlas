import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { listExperiments } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const experiments = await listExperiments();
  return NextResponse.json({ experiments });
}
