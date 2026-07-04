import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/atlas/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response);
  return response;
}
