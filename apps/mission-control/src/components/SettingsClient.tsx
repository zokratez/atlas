"use client";

import { useEffect, useState } from "react";

type Operator = {
  email: string;
  name: string | null;
  role: "owner" | "curator" | "viewer";
  added_at: string;
};

export function SettingsClient() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Operator["role"]>("curator");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/operators");
    const payload = await response.json();
    setOperators(payload.operators ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/operators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(String(payload.error ?? "Could not save operator."));
      return;
    }
    setEmail("");
    setName("");
    setRole("curator");
    setMessage("Operator saved.");
    await load();
  }

  async function remove(operator: Operator) {
    const response = await fetch(`/api/operators/${encodeURIComponent(operator.email)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Operator removed." : String(payload.error ?? "Remove failed."));
    await load();
  }

  return (
    <section className="view">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Operators</h2>
        </div>
        <span className="counter">{loading ? "--" : operators.length}</span>
      </div>

      <form className="drop-form panel" onSubmit={submit}>
        <label htmlFor="operator-email">Email</label>
        <input id="operator-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label htmlFor="operator-name">Name</label>
        <input id="operator-name" value={name} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="operator-role">Role</label>
        <select id="operator-role" value={role} onChange={(event) => setRole(event.target.value as Operator["role"])}>
          <option value="curator">Curator</option>
          <option value="viewer">Viewer</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit">Save operator</button>
        {message ? <p className="form-message sent">{message}</p> : null}
      </form>

      <div className="dense-stack">
        {operators.map((operator) => (
          <article className="panel dense-card expanded" key={operator.email}>
            <div className="card-line">
              <div className="micro-badges">
                <span>{operator.role}</span>
              </div>
              <strong>{operator.email}</strong>
              <span>{operator.name ?? "No name"}</span>
            </div>
            <div className="card-expanded">
              <p>Added {new Date(operator.added_at).toLocaleDateString()}</p>
              <button className="danger" type="button" onClick={() => remove(operator)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
