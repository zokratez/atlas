"use client";

import { useEffect, useState } from "react";

type Operator = {
  email: string;
  name: string | null;
  role: "owner" | "curator" | "viewer";
  added_at: string;
};

type Property = {
  slug: string;
  display_name: string;
  color: string | null;
  active: boolean;
  created_at?: string;
};

export function SettingsClient() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Operator["role"]>("curator");
  const [propertyName, setPropertyName] = useState("");
  const [propertyColor, setPropertyColor] = useState("#a3a3a3");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [operatorsResponse, propertiesResponse] = await Promise.all([
      fetch("/api/operators"),
      fetch("/api/properties?includeInactive=true"),
    ]);
    const operatorsPayload = await operatorsResponse.json();
    const propertiesPayload = await propertiesResponse.json();
    setOperators(operatorsPayload.operators ?? []);
    setProperties(propertiesPayload.properties ?? []);
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

  async function addProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: propertyName, color: propertyColor }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Property saved." : String(payload.error ?? "Property save failed."));
    if (response.ok) {
      setPropertyName("");
      setPropertyColor("#a3a3a3");
      await load();
    }
  }

  async function updateProperty(property: Property, patch: Partial<Pick<Property, "display_name" | "color" | "active">>) {
    const response = await fetch(`/api/properties/${encodeURIComponent(property.slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Property updated." : String(payload.error ?? "Property update failed."));
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

      <div className="view-heading settings-subheading">
        <div>
          <p className="eyebrow">Properties</p>
          <h2>Businesses</h2>
        </div>
        <span className="counter">{loading ? "--" : properties.length}</span>
      </div>

      <form className="drop-form panel" onSubmit={addProperty}>
        <label htmlFor="property-name">New property</label>
        <input id="property-name" value={propertyName} onChange={(event) => setPropertyName(event.target.value)} placeholder="Business name" />
        <label htmlFor="property-color">Color</label>
        <input id="property-color" type="color" value={propertyColor} onChange={(event) => setPropertyColor(event.target.value)} />
        <button type="submit" disabled={!propertyName.trim()}>Add property</button>
      </form>

      <div className="dense-stack">
        {properties.map((property) => (
          <article className="panel dense-card expanded" key={property.slug}>
            <div className="card-line">
              <div className="micro-badges">
                <span>{property.slug}</span>
                <span>{property.active ? "active" : "inactive"}</span>
              </div>
              <strong>{property.display_name}</strong>
              <span style={{ color: property.color ?? undefined }}>{property.color ?? "no color"}</span>
            </div>
            <div className="card-expanded">
              <p className="note">Slug stays immutable. If Scout has no targets for this property yet, add research targets in worker config before expecting drafts.</p>
              <input
                value={property.display_name}
                onChange={(event) => setProperties((current) => current.map((item) => item.slug === property.slug ? { ...item, display_name: event.target.value } : item))}
              />
              <input
                type="color"
                value={property.color ?? "#a3a3a3"}
                onChange={(event) => setProperties((current) => current.map((item) => item.slug === property.slug ? { ...item, color: event.target.value } : item))}
              />
              <div className="button-row">
                <button type="button" onClick={() => updateProperty(property, { display_name: property.display_name, color: property.color })}>
                  Save
                </button>
                <button className="secondary" type="button" onClick={() => updateProperty(property, { active: !property.active })}>
                  {property.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
