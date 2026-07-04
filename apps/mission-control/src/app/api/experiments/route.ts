import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { listExperiments } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const experiments = await listExperiments();
  return NextResponse.json({ experiments });
}
