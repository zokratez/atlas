import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { listIntakeHistory } from "@/lib/atlas/data";
import { atlasDb, getServiceClient } from "@/lib/atlas/supabase";

const allowedExtensions = new Set(["txt", "md", "pdf", "jpg", "jpeg", "png", "webp", "heic", "heif"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const videoExtensions = new Set(["mov", "mp4", "m4v", "webm", "avi"]);
const bucketName = "atlas-intake";

export async function GET() {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const history = await listIntakeHistory();
  return NextResponse.json({ history });
}

function normalizeProperty(value: FormDataEntryValue | null) {
  const property = typeof value === "string" ? slugify(value) : "";
  return property || null;
}

function detectKind(content: string) {
  try {
    const url = new URL(content);
    return url.protocol === "http:" || url.protocol === "https:" ? "url" : "text";
  } catch {
    return "text";
  }
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(request: Request) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const form = await request.formData();
  const property = normalizeProperty(form.get("property"));
  const rawContent = String(form.get("content") ?? "").trim();
  const file = form.get("file");

  if (file instanceof File && file.size > 0) {
    const extension = fileExtension(file.name);
    if (file.type.startsWith("video/") || videoExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Paste the link instead — Atlas reads transcripts." },
        { status: 400 },
      );
    }

    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Only .txt, .md, .pdf, .jpg, .png, .webp, and .heic files are accepted." },
        { status: 400 },
      );
    }

    const path = `atlas-intake/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await getServiceClient()
      .storage
      .from(bucketName)
      .upload(path, buffer, {
        contentType: file.type || contentTypeForExtension(extension),
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await atlasDb()
      .from("intake")
      .insert({
        kind: "file",
        content: path,
        property,
      })
      .select("id, kind, content, property, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: storageObject, error: storageError } = await getServiceClient()
      .schema("storage")
      .from("objects")
      .select("id")
      .eq("bucket_id", bucketName)
      .eq("name", path)
      .single();

    if (storageError || !storageObject) {
      return NextResponse.json(
        { error: storageError?.message ?? "Storage object verification failed." },
        { status: 500 },
      );
    }

    return NextResponse.json({ intake: data, storageObjectVerified: true });
  }

  if (!rawContent) {
    return NextResponse.json({ error: "Paste a URL, text, or attach a file." }, { status: 400 });
  }

  const { data, error } = await atlasDb()
    .from("intake")
    .insert({
      kind: detectKind(rawContent),
      content: rawContent,
      property,
    })
    .select("id, kind, content, property, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ intake: data });
}

function contentTypeForExtension(extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "md") return "text/markdown";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (imageExtensions.has(extension)) return "image/jpeg";
  return "text/plain";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
