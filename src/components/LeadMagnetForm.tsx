"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Form de captura para Lead Magnet — descarga PDF tras email.
 * Captura UTMs del URL (?utm_source=…) para atribución.
 * Tras submit exitoso: muestra success + link directo al PDF + email enviado.
 */
export function LeadMagnetForm({ slug, title }: { slug: string; title: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ fileUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [utm, setUtm] = useState<{ source?: string; medium?: string; campaign?: string }>({});

  // Capturar UTMs del URL al montar
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setUtm({
      source: params.get("utm_source") || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lead-magnets/${slug}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          company: company.trim() || undefined,
          consent: true,
          utm: Object.values(utm).some(Boolean) ? utm : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Error (${res.status})`);
      } else {
        setSuccess({ fileUrl: data.fileUrl });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-3xl border border-social/30 bg-social/5 p-6">
        <p className="text-5xl">📥</p>
        <h2 className="mt-3 font-display text-2xl font-semibold text-ink">
          Listo. Aquí tienes:
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          Tu copia está descargándose y también te llega al email.
        </p>
        <a
          href={success.fileUrl}
          target="_blank"
          rel="noopener"
          download
          className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
        >
          Descargar {title} →
        </a>
        <p className="mt-6 text-xs text-ink/50">
          ¿Quieres más como esto?{" "}
          <Link href="/recursos" className="text-accent hover:underline">
            Ver todos los recursos
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-line bg-bone p-6 lg:p-8"
    >
      <h2 className="font-display text-xl font-semibold text-ink">
        Descarga gratis
      </h2>
      <p className="mt-1 text-sm text-ink/60">
        Dejas tu email y te enviamos la copia. Sin spam.
      </p>

      <div className="mt-5 space-y-3">
        <Field label="Email *">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tu@empresa.com"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Nombre">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Tu nombre"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Empresa">
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={120}
            placeholder="Acme SL"
            className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2 pt-2 text-xs text-ink/65">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            Acepto recibir comunicaciones de TodoMerchandising. Política de privacidad{" "}
            <Link href="/privacidad" className="text-accent hover:underline" target="_blank">
              aquí
            </Link>
            .
          </span>
        </label>

        {error && (
          <p className="rounded-lg bg-accent-wash p-2 text-xs text-accent-deep">⚠ {error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim() || !consent}
          className="mt-2 w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
        >
          {submitting ? "Enviando…" : "📥 Descargar gratis"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
        {label}
      </span>
      {children}
    </label>
  );
}
