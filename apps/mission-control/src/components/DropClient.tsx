"use client";

import { useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "sent" | "error";

type UploadResult = {
  ok: boolean;
  error: string;
};

export function DropClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [property, setProperty] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    setProgress("");

    const queue = files.slice(0, 10);

    if (queue.length > 0) {
      for (let index = 0; index < queue.length; index += 1) {
        setProgress(`${index + 1} of ${queue.length}...`);
        const result = await uploadDrop({ file: queue[index], property });

        if (!result.ok) {
          setState("error");
          setProgress("");
          setMessage(result.error);
          return;
        }
      }
    } else {
      const result = await uploadDrop({ content, property });

      if (!result.ok) {
        setState("error");
        setMessage(result.error);
        return;
      }
    }

    setState("sent");
    setProgress("");
    setMessage(queue.length > 1 ? `Dropped ${queue.length} files. Scout will dissect them tonight.` : "Dropped. Scout will dissect it tonight.");
    setContent("");
    setProperty("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function chooseFiles(fileList: FileList | null) {
    setMessage("");
    setProgress("");
    setState("idle");

    const selected = Array.from(fileList ?? []);
    if (selected.length === 0) {
      setFiles([]);
      return;
    }

    if (selected.some((file) => file.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|avi)$/i.test(file.name))) {
      setFiles([]);
      setState("error");
      setMessage("paste the link instead — Atlas reads transcripts.");
      return;
    }

    const capped = selected.slice(0, 10);
    const normalized: File[] = [];

    for (const selectedFile of capped) {
      if (selectedFile.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(selectedFile.name)) {
        try {
          normalized.push(await normalizeImage(selectedFile));
          continue;
        } catch {
          setFiles([]);
          setState("error");
          setMessage("That photo could not be normalized. Try a screenshot or JPEG.");
          return;
        }
      }

      normalized.push(selectedFile);
    }

    setFiles(normalized);

    if (selected.length > 10) {
      setState("error");
      setMessage("Atlas can take 10 files per submit. I queued the first 10.");
    }
  }

  async function uploadDrop({
    content,
    file,
    property,
  }: {
    content?: string;
    file?: File;
    property: string;
  }): Promise<UploadResult> {
    const formData = new FormData();
    formData.set("content", content ?? "");
    formData.set("property", property);
    if (file) formData.set("file", file);

    const response = await fetch("/api/intake", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { ok: false, error: String(payload.error ?? "Drop failed.") };
    }

    return { ok: true, error: "" };
  }

  function readyLabel() {
    if (files.length === 0) return null;
    if (files.length === 1) return `Ready: ${files[0].name}`;
    return `Ready: ${files.length} files`;
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
          multiple
          accept=".txt,.md,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,text/plain,text/markdown,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(event) => chooseFiles(event.target.files)}
        />

        <label htmlFor="drop-camera">Camera</label>
        <input
          id="drop-camera"
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => chooseFiles(event.target.files)}
        />

        {readyLabel() ? <p className="form-message sent">{readyLabel()}</p> : null}
        {progress ? <p className="form-message sent">{progress}</p> : null}

        <button type="submit" disabled={state === "submitting" || (!content.trim() && files.length === 0)}>
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
