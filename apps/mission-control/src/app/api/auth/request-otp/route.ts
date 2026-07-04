import { NextRequest, NextResponse } from "next/server";
import { getAllowedEmails } from "@/lib/atlas/env";
import { getServiceClient } from "@/lib/atlas/supabase";

export async function POST(request: NextRequest) {
  const { email } = (await request.json()) as { email?: string };
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !getAllowedEmails().includes(normalizedEmail)) {
    return NextResponse.json({ error: "Email is not allowed." }, { status: 403 });
  }

  const origin = request.nextUrl.origin;
  const { error } = await getServiceClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
