import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { atlasDb } from "@/lib/atlas/supabase";

const roles = new Set(["owner", "curator", "viewer"]);

export async function GET() {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const { data, error } = await atlasDb()
    .from("operators")
    .select("email, name, role, added_at")
    .order("added_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operators: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireApiRole("owner");
  if (user instanceof NextResponse) return user;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    role?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "curator";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }
  if (!roles.has(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const { data, error } = await atlasDb()
    .from("operators")
    .upsert({
      email,
      name: body.name?.trim() || null,
      role,
    }, { onConflict: "email" })
    .select("email, name, role, added_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ operator: data });
}
