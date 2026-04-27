"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export function QuoteForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "No se pudo enviar la solicitud");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-3xl border border-social/30 bg-social/10 p-10 text-center">
        <h3 className="font-display text-2xl font-semibold text-ink">Recibido. Gracias.</h3>
        <p className="mt-3 text-ink/70">
          Tienes una respuesta con cotización en menos de 24 horas laborables.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Pedir otra cotización
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Nombre y apellidos" required />
        <Field name="company" label="Empresa" />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Teléfono" type="tel" />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="productHint" label="¿Qué producto buscas?" placeholder="Ej. botella tritan" />
        <Field name="quantity" label="Cantidad estimada" type="number" placeholder="Ej. 250" />
        <Field name="deadline" label="¿Para cuándo?" placeholder="Ej. 15 mayo" />
      </div>
      <Field name="budget" label="Presupuesto orientativo (opcional)" placeholder="Ej. 1.500 €" />

      <label className="grid gap-2">
        <span className="text-sm font-medium text-ink">Cuéntanos el proyecto</span>
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Logo, evento, claim, color, plazo, lo que sea relevante."
          className="rounded-2xl border border-ink/15 bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
        />
      </label>

      <input type="hidden" name="source" value="landing-f0" />

      <label className="flex items-start gap-3 text-sm text-ink/70">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
        />
        <span>
          He leído y acepto la <a href="/privacidad" className="font-medium text-accent underline-offset-4 hover:underline">política de privacidad</a> y consiento el tratamiento de mis datos para esta cotización.
        </span>
      </label>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-2 inline-flex items-center justify-center rounded-full bg-ink px-8 py-4 text-base font-medium text-bone transition hover:bg-accent disabled:opacity-60"
      >
        {status === "submitting" ? "Enviando…" : "Enviar solicitud"}
      </button>

      {status === "error" && (
        <p className="text-sm text-red-600">⚠ {errorMsg || "Error al enviar"}</p>
      )}

      <p className="text-xs text-ink/50">
        No spam. No marketing. No cedemos datos a terceros. Únicamente te contactamos por email
        o teléfono para esta cotización.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="rounded-2xl border border-ink/15 bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
      />
    </label>
  );
}
