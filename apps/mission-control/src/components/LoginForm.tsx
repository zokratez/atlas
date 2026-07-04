"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Login failed." }));
      setStatus("error");
      setMessage(payload.error ?? "Login failed.");
      return;
    }

    setStatus("sent");
    setMessage("Magic link sent. Check the owner inbox.");
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="email"
        required
      />
      <button type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending..." : "Send magic link"}
      </button>
      {message ? <p className={`form-message ${status}`}>{message}</p> : null}
    </form>
  );
}
