"use client";

import { useEffect, useRef, useState } from "react";

type Asset = {
  id: string;
  created_at: string;
  property: string;
  kind: "video" | "image" | "text";
  title: string;
  description: string | null;
  file_path: string | null;
  thumbnail_path: string | null;
  raw_video_path: string | null;
  duration_seconds: number | null;
  intended_channels: string[] | null;
  status: "shelf" | "scheduled" | "posted" | "retired";
  posted_action_id: string | null;
  recommendation: {
    best_window?: string;
    channel?: string;
    format_note?: string;
    confidence?: number;
    receipts?: string[];
  } | null;
  notes: string | null;
};

type VideoEstimate = {
  estimatedUsd: number;
  frameCount: number;
  transcript: string;
  command: string;
  canRun: boolean;
  note: string;
};

const maxVideoUploadBytes = 50 * 1024 * 1024;

export function ArmoryClient() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const thumbRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [estimateBusyId, setEstimateBusyId] = useState<string | null>(null);
  const [videoEstimates, setVideoEstimates] = useState<Record<string, VideoEstimate>>({});
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("video");
  const [property, setProperty] = useState("huh");
  const [description, setDescription] = useState("");
  const [channels, setChannels] = useState("tiktok, instagram, youtube");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/assets");
    const payload = await response.json();
    setAssets(payload.assets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setBusyId("asset-submit");
    const formData = new FormData();
    formData.set("title", title);
    formData.set("kind", kind);
    formData.set("property", property);
    formData.set("description", description);
    formData.set("intended_channels", channels);
    formData.set("duration_seconds", duration);
    formData.set("notes", notes);
    const file = fileRef.current?.files?.[0];
    const thumbnail = thumbRef.current?.files?.[0];

    try {
      let uploadNote = "";
      if (thumbnail) {
        formData.set("thumbnail_path", await directUpload(thumbnail, "atlas-assets/thumbnails"));
      }
      if (file) {
        if (kind === "video") {
          if (file.size > maxVideoUploadBytes) {
            uploadNote = "Raw video over 50MB stayed on-device; metadata-only registration.";
          } else {
            formData.set("raw_video_path", await directUpload(file, "atlas-assets/raw-video"));
          }
        } else {
          formData.set("file_path", await directUpload(file, "atlas-assets/files"));
        }
      }
      if (uploadNote) formData.set("upload_note", uploadNote);
    } catch (error) {
      setBusyId(null);
      setMessage(error instanceof Error ? error.message : "Upload failed.");
      return;
    }

    const response = await fetch("/api/assets", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    setBusyId(null);
    if (!response.ok) {
      setMessage(String(payload.error ?? "Asset registration failed."));
      return;
    }

    setTitle("");
    setDescription("");
    setDuration("");
    setNotes("");
    if (fileRef.current) fileRef.current.value = "";
    if (thumbRef.current) thumbRef.current.value = "";
    setMessage("Asset shelved.");
    await load();
  }

  async function prep(asset: Asset) {
    setBusyId(asset.id);
    const response = await fetch(`/api/assets/${asset.id}/prep`, { method: "POST" });
    setBusyId(null);
    if (response.ok) {
      setMessage("Queued draft created.");
      await load();
    } else {
      const payload = await response.json().catch(() => ({}));
      setMessage(String(payload.error ?? "Prep failed."));
    }
  }

  async function estimateVideo(asset: Asset) {
    setEstimateBusyId(asset.id);
    const response = await fetch(`/api/assets/${asset.id}/dissect`);
    const payload = await response.json().catch(() => ({}));
    setEstimateBusyId(null);
    if (!response.ok) {
      setMessage(String(payload.error ?? "Video estimate failed."));
      return;
    }
    setVideoEstimates((current) => ({ ...current, [asset.id]: payload as VideoEstimate }));
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Armory</p>
          <h2>Asset shelf</h2>
        </div>
        <span className="counter">{loading ? "--" : assets.length}</span>
      </div>

      <form className="drop-form panel" onSubmit={submit}>
        <label htmlFor="asset-title">Title</label>
        <input id="asset-title" value={title} onChange={(event) => setTitle(event.target.value)} required />

        <label htmlFor="asset-kind">Kind</label>
        <select id="asset-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="text">Text</option>
        </select>

        <label htmlFor="asset-property">Property</label>
        <select id="asset-property" value={property} onChange={(event) => setProperty(event.target.value)}>
          <option value="store">Store</option>
          <option value="huh">Huh?</option>
          <option value="restaurant">Restaurant</option>
          <option value="general">General</option>
        </select>

        <label htmlFor="asset-channels">Intended channels</label>
        <input id="asset-channels" value={channels} onChange={(event) => setChannels(event.target.value)} />

        <label htmlFor="asset-duration">Duration seconds</label>
        <input id="asset-duration" inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />

        <label htmlFor="asset-description">Description</label>
        <textarea id="asset-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />

        <label htmlFor="asset-thumbnail">Thumbnail / frame</label>
        <input id="asset-thumbnail" ref={thumbRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" />

        <label htmlFor="asset-file">Asset file</label>
        <input id="asset-file" ref={fileRef} type="file" accept="image/*,text/*,.txt,.md,video/*" />

        <label htmlFor="asset-notes">Notes</label>
        <textarea id="asset-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />

        <button type="submit" disabled={busyId === "asset-submit"}>{busyId === "asset-submit" ? "Shelving" : "Shelve asset"}</button>
        {message ? <p className="form-message sent">{message}</p> : null}
      </form>

      <div className="dense-stack">
        {loading ? <div className="panel skeleton" /> : null}
        {!loading && assets.length === 0 ? <div className="empty-state">Finished content waits here until Atlas says when to fire.</div> : null}
        {assets.map((asset) => (
          <article className="panel dense-card expanded" key={asset.id}>
            <div className="card-line">
              <div className="micro-badges">
                <span>{asset.property}</span>
                <span>{asset.kind}</span>
              </div>
              <strong>{asset.title}</strong>
              <span>{asset.status}</span>
            </div>
            <div className="card-expanded">
              {asset.description ? <p>{asset.description}</p> : null}
              <div className="tag-row">
                {(asset.intended_channels ?? []).map((channel) => <span className="chip" key={channel}>{channel}</span>)}
                {asset.duration_seconds ? <span className="chip">{asset.duration_seconds}s</span> : null}
                {asset.raw_video_path ? <span className="chip">raw safekept</span> : null}
              </div>
              {asset.recommendation ? (
                <p className="note">
                  Best window: {asset.recommendation.best_window ?? "pending"} / channel: {asset.recommendation.channel ?? "pending"} / {asset.recommendation.format_note ?? "No format note yet."} / confidence {Math.round(Number(asset.recommendation.confidence ?? 0) * 100)}%
                </p>
              ) : (
                <p className="note">Waiting for Lens recommendation.</p>
              )}
              {asset.notes ? <p>{asset.notes}</p> : null}
              {asset.kind === "video" ? (
                <div className="video-dissection-box">
                  <button type="button" onClick={() => estimateVideo(asset)} disabled={estimateBusyId === asset.id}>
                    {estimateBusyId === asset.id ? "Estimating" : "Deep-dissect video"}
                  </button>
                  {videoEstimates[asset.id] ? (
                    <div className="preflight">
                      <strong>${videoEstimates[asset.id].estimatedUsd.toFixed(4)} estimated</strong>
                      <span>{videoEstimates[asset.id].frameCount} keyframes + transcript pass</span>
                      <span>{videoEstimates[asset.id].note}</span>
                      <code>{videoEstimates[asset.id].command}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button type="button" onClick={() => prep(asset)} disabled={busyId === asset.id || asset.status === "posted"}>
                {busyId === asset.id ? "Prepping" : "Prep post"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

async function directUpload(file: File, prefix: "atlas-assets/thumbnails" | "atlas-assets/raw-video" | "atlas-assets/files") {
  const tokenResponse = await fetch("/api/assets/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      size: file.size,
      type: file.type,
      prefix,
    }),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    throw new Error(String(tokenPayload.error ?? "Could not prepare upload."));
  }

  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  const uploadResponse = await fetch(String(tokenPayload.signedUrl), {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body,
  });

  if (!uploadResponse.ok) {
    throw new Error("Storage upload failed.");
  }

  return String(tokenPayload.path);
}
