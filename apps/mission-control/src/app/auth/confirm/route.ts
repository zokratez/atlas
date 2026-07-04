import { NextRequest, NextResponse } from "next/server";
import { isOperatorEmail, setSessionCookies } from "@/lib/atlas/auth";
import { getServiceClient } from "@/lib/atlas/supabase";

const allowedTypes = new Set(["email", "magiclink", "signup", "invite", "recovery"]);

function loginError(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "email";

  if (!tokenHash) {
    return loginError(url.origin, "missing_token_hash");
  }

  if (!allowedTypes.has(type)) {
    return loginError(url.origin, "invalid_otp_type");
  }

  const { data, error } = await getServiceClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "email",
  });

  if (error || !data.session?.access_token) {
    return loginError(url.origin, error?.message ?? "session_not_returned");
  }

  const email = data.user?.email?.toLowerCase();
  if (!email || !(await isOperatorEmail(email))) {
    return loginError(url.origin, "email_not_allowlisted");
  }

  const response = NextResponse.redirect(new URL("/feed", url.origin));
  setSessionCookies(response, data.session.access_token, data.session.refresh_token);
  return response;
}
