import { NextRequest, NextResponse } from "next/server";
import { isOperatorEmail, setSessionCookies } from "@/lib/atlas/auth";
import { getServiceClient } from "@/lib/atlas/supabase";

function loginRedirect(origin: string, reason: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    return loginRedirect(request.nextUrl.origin, "invalid_request_origin");
  }

  let body: { access_token?: string; refresh_token?: string };

  try {
    body = (await request.json()) as { access_token?: string; refresh_token?: string };
  } catch {
    return loginRedirect(request.nextUrl.origin, "invalid_session_payload");
  }

  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;

  if (!accessToken || !refreshToken) {
    return loginRedirect(request.nextUrl.origin, "missing_session_tokens");
  }

  const { data, error } = await getServiceClient().auth.getUser(accessToken);
  const email = data.user?.email?.toLowerCase();

  if (error || !data.user || !email) {
    return loginRedirect(request.nextUrl.origin, error?.message ?? "invalid_access_token");
  }

  if (!(await isOperatorEmail(email))) {
    return loginRedirect(request.nextUrl.origin, "email_not_allowlisted");
  }

  const response = NextResponse.json({
    ok: true,
    cookies: ["atlas-access-token", "atlas-refresh-token"],
  });
  setSessionCookies(response, accessToken, refreshToken);
  return response;
}
