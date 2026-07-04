"use client";

import { useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "sent" | "error";

export function DropClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [property, setProperty] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const formData = new FormData();
    formData.set("content", content);
    formData.set("property", property);
    if (file) formData.set("file", file);

    const response = await fetch("/api/intake", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setState("error");
      setMessage(String(payload.error ?? "Drop failed."));
      return;
    }

    setState("sent");
    setMessage("Dropped. Scout will dissect it tonight.");
    setContent("");
    setProperty("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function chooseFile(nextFile: File | undefined) {
    setMessage("");
    setState("idle");

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|avi)$/i.test(nextFile.name)) {
      setFile(null);
      setState("error");
      setMessage("paste the link instead — Atlas reads transcripts.");
      return;
    }

    if (nextFile.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(nextFile.name)) {
      try {
        setFile(await normalizeImage(nextFile));
        return;
      } catch {
        setFile(null);
        setState("error");
        setMessage("That photo could not be normalized. Try a screenshot or JPEG.");
        return;
      }
    }

    setFile(nextFile);
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Intake</p>
          <h2>Drop</h2>
        </div>
      </div>

      <form className="drop-form panel" onSubmit={submit}>
        <label htmlFor="drop-content">Paste URL or text</label>
        <textarea
          id="drop-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Links, notes, files, photos — snap it, Atlas reads it."
          rows={9}
        />

        <label htmlFor="drop-property">Property</label>
        <select id="drop-property" value={property} onChange={(event) => setProperty(event.target.value)}>
          <option value="">Auto</option>
          <option value="store">Store</option>
          <option value="huh">Huh</option>
          <option value="restaurant">Restaurant</option>
          <option value="general">General</option>
        </select>

        <label htmlFor="drop-file">File or photo</label>
        <input
          id="drop-file"
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,text/plain,text/markdown,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        <label htmlFor="drop-camera">Camera</label>
        <input
          id="drop-camera"
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {file ? <p className="form-message sent">Ready: {file.name}</p> : null}

        <button type="submit" disabled={state === "submitting" || (!content.trim() && !file)}>
          {state === "submitting" ? "Submitting" : "Submit"}
        </button>

        {message ? <p className={`form-message ${state === "error" ? "error" : "sent"}`}>{message}</p> : null}
      </form>
    </section>
  );
}

async function normalizeImage(file: File) {
  const image = await loadImage(file);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) resolve(value);
        else reject(new Error("Image normalization failed."));
      },
      "image/jpeg",
      0.72,
    );
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "atlas-photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed."));
    };
    image.src = url;
  });
}
