"use client";

import { useState } from "react";

export function PartnerApplicationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [audience, setAudience] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company: company || null,
          role: role || null,
          audience: audience || null,
          message: message || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Error ${res.status}`);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-social">— Solicitud recibida</p>
        <h3 className="mt-2 font-display text-xl font-semibold text-ink">
          Gracias {name.split(" ")[0]}. Te respondemos en 48 h laborables.
        </h3>
        <p className="mt-3 text-sm text-ink/65 leading-relaxed">
          Revisamos cada solicitud manualmente. Si aprobamos, te llega email con
          tu link de partner único + acceso a tu dashboard. Si no encajamos,
          también te respondemos con motivo claro — preferimos esto a tenerte
          esperando.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input label="Nombre*" value={name} onChange={setName} required />
        <Input label="Email*" type="email" value={email} onChange={setEmail} required />
        <Input label="Empresa / proyecto" value={company} onChange={setCompany} />
        <Input
          label="A qué te dedicas"
          placeholder="ej. Agencia de eventos, consultora RSC, freelance comunicación…"
          value={role}
          onChange={setRole}
        />
      </div>
      <Field label="Quién es tu cliente tipo">
        <input
          type="text"
          placeholder="ej. PYMES tech 50-200 empleados, fundaciones, departamentos de RRHH…"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </Field>
      <Field label="Cómo encajamos en tu negocio (opcional)">
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Cuéntanos cómo crees que podrías recomendarnos, qué casos tienes en mente…"
          className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </Field>
      {error && <div className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-deep">⚠ {error}</div>}
      <button
        type="submit"
        disabled={submitting || !name || !email}
        className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
      >
        {submitting ? "Enviando…" : "Quiero ser partner →"}
      </button>
      <p className="text-[11px] text-ink/45">
        Tu solicitud queda registrada. Si encajamos, te respondemos en 48h con
        condiciones y tu link único. Sin spam.
      </p>
    </form>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-ink/55">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-ink/55">{label}</p>
      {children}
    </div>
  );
}
