import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/atlas/auth";
import { createExternalPostAction } from "@/lib/atlas/data";
import { getServiceClient } from "@/lib/atlas/supabase";

const bucketName = "atlas-intake";
const allowedChannels = new Set(["seo", "email", "tiktok", "instagram", "youtube", "x", "community", "general"]);

export async function POST(request: Request) {
  const user = await requireApiRole("curator");
  if (user instanceof NextResponse) return user;

  const form = await request.formData();
  const property = slugify(String(form.get("property") ?? "")) || "general";
  const channel = normalized(form.get("channel"), allowedChannels, "general");
  const postedAt = String(form.get("posted_at") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const screenshot = form.get("screenshot");

  let screenshotPath: string | null = null;
  if (screenshot instanceof File && screenshot.size > 0) {
    if (!screenshot.type.startsWith("image/")) {
      return NextResponse.json({ error: "Screenshot must be an image." }, { status: 400 });
    }

    screenshotPath = `atlas-intake/registered-posts/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(screenshot.name || "screenshot.jpg")}`;
    const buffer = Buffer.from(await screenshot.arrayBuffer());
    const { error: uploadError } = await getServiceClient()
      .storage
      .from(bucketName)
      .upload(screenshotPath, buffer, {
        contentType: screenshot.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  try {
    const action = await createExternalPostAction(user, {
      property,
      channel,
      postedAt,
      caption,
      screenshotPath,
    });
    return NextResponse.json({ action });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not register post." },
      { status: 400 },
    );
  }
}

function normalized(value: FormDataEntryValue | null, allowed: Set<string>, fallback: string) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.has(text) ? text : fallback;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
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
