import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/atlas/auth";
import { atlasDb, getServiceClient } from "@/lib/atlas/supabase";

const allowedProperties = new Set(["store", "huh", "restaurant", "general"]);
const allowedExtensions = new Set(["txt", "md", "pdf"]);
const bucketName = "atlas-intake";

function normalizeProperty(value: FormDataEntryValue | null) {
  const property = typeof value === "string" ? value.trim() : "";
  return allowedProperties.has(property) ? property : null;
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
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;

  const form = await request.formData();
  const property = normalizeProperty(form.get("property"));
  const rawContent = String(form.get("content") ?? "").trim();
  const file = form.get("file");

  if (file instanceof File && file.size > 0) {
    const extension = fileExtension(file.name);
    if (!allowedExtensions.has(extension)) {
      return NextResponse.json({ error: "Only .txt, .md, and .pdf files are accepted." }, { status: 400 });
    }

    const path = `atlas-intake/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await getServiceClient()
      .storage
      .from(bucketName)
      .upload(path, buffer, {
        contentType: file.type || (extension === "pdf" ? "application/pdf" : "text/plain"),
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
