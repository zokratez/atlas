"use client";

import { useEffect, useState } from "react";

function goLogin(reason: string) {
  window.location.replace(`/login?error=${encodeURIComponent(reason)}`);
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState("Finishing sign-in...");

  useEffect(() => {
    async function finishSignIn() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const error = params.get("error_description") ?? params.get("error");

      window.history.replaceState(null, "", window.location.pathname);

      if (error) {
        goLogin(error);
        return;
      }

      if (!accessToken || !refreshToken) {
        goLogin("missing_session_tokens");
        return;
      }

      setStatus("Securing session...");

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "manual",
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
      });

      if (response.ok) {
        window.location.replace("/feed");
        return;
      }

      const location = response.headers.get("location");
      if (location) {
        window.location.replace(location);
        return;
      }

      goLogin(`session_failed_${response.status}`);
    }

    finishSignIn().catch((error: unknown) => {
      goLogin(error instanceof Error ? error.message : "callback_failed");
    });
  }, []);

  return (
    <main className="login-screen">
      <section className="login-panel">
        <p className="eyebrow">Atlas Mission Control</p>
        <h1>Signing in</h1>
        <p className="muted">{status}</p>
      </section>
    </main>
  );
}
