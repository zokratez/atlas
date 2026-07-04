import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

const workers = new Set(["scout", "lens", "quill"]);

export async function POST(request: NextRequest) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const { worker } = (await request.json()) as { worker?: string };
  if (!worker || !workers.has(worker)) {
    return NextResponse.json({ error: "worker must be scout, lens, or quill." }, { status: 400 });
  }

  const { error } = await atlasDb()
    .from("flags")
    .upsert({
      key: `run_${worker}_requested`,
      value: {
        requested_at: new Date().toISOString(),
        operator_email: user.email,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ queued: true, worker });
}
