"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useProperties } from "./FilterBar";

type SubmitState = "idle" | "submitting" | "sent" | "error";

type UploadResult = {
  ok: boolean;
  error: string;
};

type DropHistoryItem = {
  id: string;
  created_at: string;
  kind: "url" | "text" | "file";
  content: string;
  property: string | null;
  status: "new" | "processed" | "failed";
  notes: string | null;
  source_chars?: number | null;
  analyzed_chars?: number | null;
  coverage_pct?: number | null;
  coverage_method?: string | null;
  findings: Array<{
    id: string;
    claim: string;
    property: string;
    channel?: string | null;
    source_url?: string | null;
    intake_coverage?: {
      source_chars?: number;
      analyzed_chars?: number;
      coverage_pct?: number;
      method?: string;
    } | null;
  }>;
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
  const [history, setHistory] = useState<DropHistoryItem[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const properties = useProperties(false);
  const propertyLabels = useMemo(() => new Map(properties.map((item) => [item.slug, item.display_name])), [properties]);

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const pastedFiles = Array.from(event.clipboardData?.files ?? []);
      if (pastedFiles.length === 0) return;
      event.preventDefault();
      chooseFiles(fileListFromFiles(pastedFiles));
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function loadHistory() {
    const response = await fetch("/api/intake");
    if (!response.ok) return;
    const payload = await response.json();
    setHistory(payload.history ?? []);
  }

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
    await loadHistory();
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

  async function studyFully(item: DropHistoryItem) {
    setMessage("");
    const sourceChars = Number(item.source_chars ?? 0);
    const analyzedChars = Number(item.analyzed_chars ?? 0);
    const remaining = Math.max(0, sourceChars - analyzedChars);
    const chunks = Math.max(1, Math.ceil(remaining / 12000));
    const estimatedUsd = (chunks * 0.01).toFixed(4);
    if (!window.confirm(`Study the rest in ${chunks} governed chunks? Estimated model cost about $${estimatedUsd}.`)) return;

    const response = await fetch(`/api/intake/${item.id}/study-full`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? String(payload.note ?? "Queued full study.") : String(payload.error ?? "Study fully failed."));
    await loadHistory();
  }

  async function queueStudyNow() {
    setMessage("");
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker: "scout" }),
    });
    setState(response.ok ? "sent" : "error");
    setMessage(response.ok ? "Queued, runs within a minute." : "Could not queue Scout.");
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

      <form
        className={`drop-form panel drop-zone ${dragging ? "dragging" : ""}`}
        onSubmit={submit}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          chooseFiles(event.dataTransfer.files);
        }}
      >
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
          {properties.map((item) => (
            <option value={item.slug} key={item.slug}>{item.display_name}</option>
          ))}
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

        {state === "sent" ? (
          <button className="secondary" type="button" onClick={queueStudyNow}>
            Study my drops now
          </button>
        ) : null}

        {message ? <p className={`form-message ${state === "error" ? "error" : "sent"}`}>{message}</p> : null}
      </form>

      <section className="dense-stack">
        <div className="view-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Drops</h2>
          </div>
          <span className="counter">{history.length}</span>
        </div>
        {history.length === 0 ? <div className="empty-state">Your drops show up here after submit.</div> : null}
        {history.map((item) => (
          <article
            className={`panel dense-card ${expandedHistoryId === item.id ? "expanded" : ""}`}
            key={item.id}
            onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
          >
            <div className="card-line">
              <div className="micro-badges">
                <span>{item.property ? propertyLabels.get(item.property) ?? item.property : "auto"}</span>
                <span>{item.kind}</span>
              </div>
              <strong>{historyTitle(item)}</strong>
              <span>{item.status}</span>
            </div>
            {expandedHistoryId === item.id ? (
              <div className="card-expanded">
                {item.notes ? <p className="note">{item.notes}</p> : null}
                <p className="note">{coverageLabel(item)}</p>
                <div className="tag-row">
                  <span className="chip">{formatDate(item.created_at)}</span>
                  <span className="chip">{item.findings.length} findings</span>
                  {item.coverage_method ? <span className="chip">{item.coverage_method}</span> : null}
                </div>
                {Number(item.coverage_pct ?? 100) < 100 ? (
                  <button type="button" onClick={(event) => {
                    event.stopPropagation();
                    studyFully(item);
                  }}>
                    Study fully
                  </button>
                ) : null}
                <div className="receipt-list">
                  {item.findings.map((finding) => (
                    <a
                      href={finding.source_url ?? "/feed"}
                      target={finding.source_url ? "_blank" : "_self"}
                      rel="noreferrer"
                      className="panel dense-card"
                      key={finding.id}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="card-line">
                        <div className="micro-badges">
                          <span>{propertyLabels.get(finding.property) ?? finding.property}</span>
                          <span>{finding.channel ?? "general"}</span>
                        </div>
                        <strong>{finding.claim}</strong>
                        <span>{coverageLabel(finding.intake_coverage)}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
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

function fileListFromFiles(files: File[]) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer.files;
}

function historyTitle(item: DropHistoryItem) {
  if (item.kind === "file") return item.content.split("/").pop() ?? "File";
  return item.content.length > 84 ? `${item.content.slice(0, 84)}...` : item.content;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function coverageLabel(value: {
  source_chars?: number | null;
  analyzed_chars?: number | null;
  coverage_pct?: number | null;
  coverage_method?: string | null;
  method?: string | null;
} | null | undefined) {
  const pct = Number(value?.coverage_pct ?? 100);
  const sourceChars = Number(value?.source_chars ?? 0);
  const words = Math.max(0, Math.round(sourceChars / 5));
  const method = value?.coverage_method ?? value?.method ?? "full_text";
  if (!Number.isFinite(pct)) return "Studied: pending";
  if (pct >= 100) return `Studied: 100% of ${method.replace("_", " ")} (${words.toLocaleString()} words)`;
  return `Studied: ${pct}% - truncated at token budget.`;
}
