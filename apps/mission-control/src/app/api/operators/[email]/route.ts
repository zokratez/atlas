import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ email: string }> },
) {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const { email } = await context.params;
  const normalized = decodeURIComponent(email).trim().toLowerCase();

  if (normalized === user.email) {
    return NextResponse.json({ error: "Owners cannot remove their own access here." }, { status: 400 });
  }

  const { error } = await atlasDb()
    .from("operators")
    .delete()
    .eq("email", normalized);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
