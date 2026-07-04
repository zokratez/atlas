import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { listFindings } from "@/lib/atlas/data";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const findings = await listFindings();
  return NextResponse.json({ findings });
}
