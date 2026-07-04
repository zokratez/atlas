"use client";

import { useRef, useState } from "react";

type DemoState = "idle" | "submitting" | "sent" | "error";

export function PublicDemoLanding() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<DemoState>("idle");
  const [message, setMessage] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");
    setReceiptUrl("");

    const form = new FormData();
    form.set("content", content);
    form.set("email", email);
    if (file) form.set("file", file);

    const response = await fetch("/api/demo", { method: "POST", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState("error");
      setMessage(String(payload.error ?? "Demo could not be queued."));
      return;
    }

    setState("sent");
    setReceiptUrl(String(payload.receiptUrl ?? ""));
    setMessage("Queued. Atlas will dissect it and email the receipt within minutes.");
    setContent("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function chooseFile(selected: File | null) {
    setMessage("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.type.startsWith("image/")) {
      setState("error");
      setMessage("Upload a screenshot image, or paste the link instead.");
      return;
    }

    try {
      setFile(await normalizeImage(selected));
      setState("idle");
    } catch {
      setState("error");
      setMessage("That screenshot could not be prepared. Try a PNG or JPEG.");
    }
  }

  return (
    <main className="public-page">
      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="eyebrow">Atlas public demo</p>
          <h1>Drop any post. Watch it get dissected.</h1>
          <p>
            Paste a URL or upload a screenshot. Atlas sends the autopsy to your inbox and gives you a shareable receipt page.
          </p>
          <a className="source-link" href="/login">Mission Control</a>
        </div>

        <form className="public-drop-box" onSubmit={submit}>
          <label htmlFor="demo-content">Post URL or context</label>
          <textarea
            id="demo-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste the post, ad, thread, landing page, or a note about what to dissect."
            rows={7}
          />
          <label htmlFor="demo-file">Screenshot</label>
          <input
            id="demo-file"
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {file ? <p className="form-message sent">Ready: {file.name}</p> : null}
          <label htmlFor="demo-email">Email for the receipt</label>
          <input
            id="demo-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <p className="public-disclosure">
            Includes up to 3 free dissections per email. We send the receipt and may send Atlas updates. Unsubscribe any time.
          </p>
          <button type="submit" disabled={state === "submitting" || (!content.trim() && !file)}>
            {state === "submitting" ? "Queuing" : "Dissect this"}
          </button>
          {message ? <p className={`form-message ${state === "error" ? "error" : "sent"}`}>{message}</p> : null}
          {receiptUrl ? <a className="source-link" href={receiptUrl}>Open receipt</a> : null}
        </form>
      </section>

      <section className="proof-strip">
        <span>Receipts over opinions</span>
        <span>Costs governed</span>
        <span>Shareable autopsies</span>
      </section>

      <section className="public-section">
        <p className="eyebrow">Autopsy sample</p>
        <article className="panel sample-autopsy">
          <h2>The eye hits the promise, then the proof, then the gap.</h2>
          <p>
            The post works because the first line names the embarrassing moment, the screenshot supplies visible proof, and the final line gives one action. The stealable mechanic is not the topic. It is the receipt-first sequence.
          </p>
        </article>
      </section>

      <section className="public-section brief-pitch">
        <p className="eyebrow">The Brief</p>
        <h2>Atlas turns marketing artifacts into a queue of better decisions.</h2>
        <p>
          Feed it posts, screenshots, results, and drafts. It finds patterns, remembers your taste, prices every model call, and keeps the human in the publish seat.
        </p>
      </section>
    </main>
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
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image normalization failed.")), "image/jpeg", 0.72);
  });
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "atlas-demo"}.jpg`, { type: "image/jpeg" });
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
