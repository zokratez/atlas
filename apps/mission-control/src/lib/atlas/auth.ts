import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAllowedEmails } from "./env";
import { getServiceClient } from "./supabase";

const accessCookie = "atlas-access-token";
const refreshCookie = "atlas-refresh-token";

export type AtlasUser = {
  id: string;
  email: string;
};

export async function getAtlasUser(): Promise<AtlasUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(accessCookie)?.value;

  if (!token) {
    return null;
  }

  const { data, error } = await getServiceClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();

  if (error || !data.user || !email || !getAllowedEmails().includes(email)) {
    return null;
  }

  return { id: data.user.id, email };
}

export async function requireAtlasUser(): Promise<AtlasUser> {
  const user = await getAtlasUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireApiUser(): Promise<AtlasUser | NextResponse> {
  const user = await getAtlasUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return user;
}

export function setSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken?: string,
) {
  response.cookies.set(accessCookie, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });

  if (refreshToken) {
    response.cookies.set(refreshCookie, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  }
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(accessCookie, "", { maxAge: 0, path: "/" });
  response.cookies.set(refreshCookie, "", { maxAge: 0, path: "/" });
}
