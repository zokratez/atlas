import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { atlasDb, getServiceClient } from "./supabase";

const accessCookie = "atlas-access-token";
const refreshCookie = "atlas-refresh-token";

export type AtlasUser = {
  id: string;
  email: string;
  name: string | null;
  role: OperatorRole;
};

export type OperatorRole = "owner" | "curator" | "viewer";

const roleRank: Record<OperatorRole, number> = {
  viewer: 1,
  curator: 2,
  owner: 3,
};

export async function getOperator(email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await atlasDb()
    .from("operators")
    .select("email, name, role")
    .eq("email", normalized)
    .single();

  if (error) return null;
  if (!data || !isOperatorRole(data.role)) return null;
  return {
    email: data.email as string,
    name: (data.name as string | null) ?? null,
    role: data.role as OperatorRole,
  };
}

export async function isOperatorEmail(email: string) {
  return Boolean(await getOperator(email));
}

export async function getAtlasUser(): Promise<AtlasUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(accessCookie)?.value;

  if (!token) {
    return null;
  }

  const { data, error } = await getServiceClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();

  if (error || !data.user || !email) {
    return null;
  }

  const operator = await getOperator(email);
  if (!operator) {
    return null;
  }

  return { id: data.user.id, email, name: operator.name, role: operator.role };
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

export async function requireApiRole(role: OperatorRole): Promise<AtlasUser | NextResponse> {
  const user = await getAtlasUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasRole(user, role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return user;
}

export function hasRole(user: Pick<AtlasUser, "role">, role: OperatorRole) {
  return roleRank[user.role] >= roleRank[role];
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

function isOperatorRole(value: unknown): value is OperatorRole {
  return value === "owner" || value === "curator" || value === "viewer";
}
