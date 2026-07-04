import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { createAsset, listAssets, type AssetKind } from "@/lib/atlas/data";
import { getServiceClient } from "@/lib/atlas/supabase";

const bucketName = "atlas-intake";
const allowedProperties = new Set(["store", "huh", "restaurant", "general"]);
const allowedKinds = new Set(["video", "image", "text"]);
const maxSafekeepingVideoBytes = 50 * 1024 * 1024;

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const assets = await listAssets();
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const kind = String(form.get("kind") ?? "") as AssetKind;
  const property = normalizeProperty(form.get("property"));
  const intendedChannels = String(form.get("intended_channels") ?? "")
    .split(",")
    .map((channel) => channel.trim().toLowerCase())
    .filter(Boolean);

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!allowedKinds.has(kind)) return NextResponse.json({ error: "Invalid asset kind." }, { status: 400 });

  const thumbnail = form.get("thumbnail");
  const file = form.get("file");
  const uploadedThumbnailPath = cleanStoragePath(form.get("thumbnail_path"));
  const uploadedFilePath = cleanStoragePath(form.get("file_path"));
  const uploadedRawVideoPath = cleanStoragePath(form.get("raw_video_path"));
  const duration = Number(form.get("duration_seconds") ?? "");
  const notes: string[] = [String(form.get("upload_note") ?? "").trim()].filter(Boolean);

  let thumbnailPath: string | null = null;
  let filePath: string | null = null;
  let rawVideoPath: string | null = null;

  if (uploadedThumbnailPath) {
    thumbnailPath = uploadedThumbnailPath;
  } else if (thumbnail instanceof File && thumbnail.size > 0) {
    thumbnailPath = await uploadFile(thumbnail, "atlas-assets/thumbnails", "image/jpeg");
  }

  if (uploadedRawVideoPath && kind === "video") {
    rawVideoPath = uploadedRawVideoPath;
    notes.push("Raw video uploaded for safekeeping only; never sent to models.");
  } else if (uploadedFilePath && kind !== "video") {
    filePath = uploadedFilePath;
  } else if (file instanceof File && file.size > 0) {
    if (kind === "video") {
      if (file.size <= maxSafekeepingVideoBytes) {
        rawVideoPath = await uploadFile(file, "atlas-assets/raw-video", file.type || "video/mp4");
        notes.push("Raw video uploaded for safekeeping only; never sent to models.");
      } else {
        notes.push("Raw video over 50MB stayed on-device; metadata-only registration.");
      }
    } else {
      filePath = await uploadFile(file, "atlas-assets/files", file.type || "application/octet-stream");
    }
  }

  const asset = await createAsset({
    property,
    kind,
    title,
    description: String(form.get("description") ?? "").trim() || null,
    file_path: kind === "video" ? thumbnailPath : filePath,
    thumbnail_path: thumbnailPath,
    raw_video_path: rawVideoPath,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    intended_channels: intendedChannels,
    notes: [String(form.get("notes") ?? "").trim(), ...notes].filter(Boolean).join("\n") || null,
  });

  return NextResponse.json({ asset });
}

async function uploadFile(file: File, prefix: string, contentType: string) {
  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await getServiceClient()
    .storage
    .from(bucketName)
    .upload(path, buffer, { contentType, upsert: false });

  if (error) throw error;
  return path;
}

function normalizeProperty(value: FormDataEntryValue | null) {
  const property = typeof value === "string" ? value.trim() : "";
  return allowedProperties.has(property) ? property : "general";
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function cleanStoragePath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  return path.startsWith("atlas-assets/") ? path : null;
}
