import { NextRequest, NextResponse } from "next/server";
import { setSessionCookies } from "@/lib/atlas/auth";
import { getServiceClient } from "@/lib/atlas/supabase";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "email" | "magiclink" | null;
  const redirectTo = new URL("/feed", url.origin);

  if (tokenHash) {
    const { data, error } = await getServiceClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: type ?? "email",
    });

    if (!error && data.session?.access_token) {
      const response = NextResponse.redirect(redirectTo);
      setSessionCookies(response, data.session.access_token, data.session.refresh_token);
      return response;
    }
  }

  if (code) {
    const { data, error } = await getServiceClient().auth.exchangeCodeForSession(code);

    if (!error && data.session?.access_token) {
      const response = NextResponse.redirect(redirectTo);
      setSessionCookies(response, data.session.access_token, data.session.refresh_token);
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
