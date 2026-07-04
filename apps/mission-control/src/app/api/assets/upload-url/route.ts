import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { getServiceClient } from "@/lib/atlas/supabase";

const bucketName = "atlas-intake";
const maxUploadBytes = 50 * 1024 * 1024;
const allowedPrefixes = new Set([
  "atlas-assets/thumbnails",
  "atlas-assets/raw-video",
  "atlas-assets/files",
]);

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const fileName = safeFileName(String(body.fileName ?? "asset"));
  const prefix = String(body.prefix ?? "");
  const size = Number(body.size ?? 0);

  if (!allowedPrefixes.has(prefix)) {
    return NextResponse.json({ error: "Invalid upload prefix." }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > maxUploadBytes) {
    return NextResponse.json({ error: "Uploads are capped at 50MB." }, { status: 400 });
  }

  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${fileName}`;
  const { data, error } = await getServiceClient()
    .storage
    .from(bucketName)
    .createSignedUploadUrl(path, { upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    path: data.path,
    signedUrl: data.signedUrl,
    token: data.token,
  });
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120) || "asset";
}
