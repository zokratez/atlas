"use client";

import { useRef, useState } from "react";

type SubmitState = "idle" | "submitting" | "sent" | "error";

export function DropClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
          placeholder="Drop anything here. Scout dissects it into findings tonight."
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

        <label htmlFor="drop-file">File</label>
        <input
          id="drop-file"
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />

        <button type="submit" disabled={state === "submitting" || (!content.trim() && !file)}>
          {state === "submitting" ? "Submitting" : "Submit"}
        </button>

        {message ? <p className={`form-message ${state === "error" ? "error" : "sent"}`}>{message}</p> : null}
      </form>
    </section>
  );
}
