import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { atlasDb, getServiceClient } from "@/lib/atlas/supabase";

const bucketName = "atlas-intake";
const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const maxFreePerEmail = 3;
const maxPerIpPerDay = 10;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const content = String(form.get("content") ?? "").trim();
  const file = form.get("file");

  if (!email) {
    return NextResponse.json({ error: "Enter an email for the receipt." }, { status: 400 });
  }

  if (!content && !(file instanceof File && file.size > 0)) {
    return NextResponse.json({ error: "Paste a post URL or upload a screenshot." }, { status: 400 });
  }

  const ipHash = hashIp(clientIp(request));
  const rateLimit = await checkDemoLimits(email, ipHash);
  if (!rateLimit.ok) {
    return NextResponse.json({ error: rateLimit.error }, { status: 429 });
  }

  let kind: "url" | "text" | "file" = content ? detectKind(content) : "file";
  let storedContent = content;

  if (file instanceof File && file.size > 0) {
    const extension = fileExtension(file.name);
    if (!file.type.startsWith("image/") && !allowedImageExtensions.has(extension)) {
      return NextResponse.json({ error: "Upload a screenshot image, or paste the link instead." }, { status: 400 });
    }

    const path = `atlas-intake/public-demo/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(file.name)}`;
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

    kind = "file";
    storedContent = path;
  }

  const { data, error } = await atlasDb()
    .from("intake")
    .insert({
      kind,
      content: storedContent,
      property: "general",
      tags: ["public_demo"],
      submitter_email: email,
      submitter_ip_hash: ipHash,
      notes: "Public demo: user requested emailed dissection and clear subscription disclosure.",
    })
    .select("id, receipt_token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    queued: true,
    receiptUrl: `${request.nextUrl.origin}/receipt/${data.receipt_token}`,
  });
}

async function checkDemoLimits(email: string, ipHash: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [emailResult, ipResult] = await Promise.all([
    atlasDb()
      .from("intake")
      .select("id", { count: "exact", head: true })
      .eq("submitter_email", email)
      .contains("tags", ["public_demo"]),
    atlasDb()
      .from("intake")
      .select("id", { count: "exact", head: true })
      .eq("submitter_ip_hash", ipHash)
      .contains("tags", ["public_demo"])
      .gte("created_at", start.toISOString()),
  ]);

  if (emailResult.error) throw emailResult.error;
  if (ipResult.error) throw ipResult.error;
  if ((emailResult.count ?? 0) >= maxFreePerEmail) {
    return { ok: false, error: "That email has used its 3 free dissections." };
  }
  if ((ipResult.count ?? 0) >= maxPerIpPerDay) {
    return { ok: false, error: "Too many demos from this connection today." };
  }

  return { ok: true, error: "" };
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function detectKind(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? "url" : "text";
  } catch {
    return "text";
  }
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
}

function hashIp(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function contentTypeForExtension(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}
