"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type Props = {
  requireCompany?: boolean;
  requirePhone?: boolean;
  requireDeadline?: boolean;
  showBudgetField?: boolean;
  deadlineOptions?: string[];
  responseHours?: number;
  successTitle?: string;
  successMessage?: string;
};

export function QuoteForm({
  requireCompany = false,
  requirePhone = false,
  requireDeadline = false,
  showBudgetField = true,
  deadlineOptions = [],
  responseHours = 24,
  successTitle = "Recibido. Gracias.",
  successMessage = "Te respondemos por email en menos de {hours} horas laborables con cotización cerrada.",
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const productRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (productRef.current && detail) {
        productRef.current.value = detail;
        productRef.current.focus({ preventScroll: true });
      }
    }
    window.addEventListener("merch:prefill-product", onPrefill);
    try {
      const fromSession = sessionStorage.getItem("merch:prefill");
      if (fromSession && productRef.current) {
        productRef.current.value = fromSession;
        sessionStorage.removeItem("merch:prefill");
      }
    } catch {}
    return () => window.removeEventListener("merch:prefill-product", onPrefill);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data: Record<string, FormDataEntryValue> = Object.fromEntries(new FormData(form).entries());
    try {
      const ref = sessionStorage.getItem("merch:prefill-ref");
      if (ref) data.productRef = ref;
    } catch {}

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
    const msg = successMessage.replace("{hours}", String(responseHours));
    return (
      <div className="rounded-3xl border border-social/30 bg-social/10 p-10 text-center">
        <h3 className="font-display text-2xl font-semibold text-ink">{successTitle}</h3>
        <p className="mt-3 text-ink/70">{msg}</p>
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
        <Field name="company" label="Empresa" required={requireCompany} />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Teléfono" type="tel" required={requirePhone} />
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="grid min-w-0 gap-2">
          <span className="text-sm font-medium text-ink">¿Qué producto buscas?</span>
          <input
            ref={productRef}
            name="productHint"
            type="text"
            placeholder="Ej. botella tritan"
            className="block w-full min-w-0 rounded-2xl border border-line bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
          />
        </label>
        <Field name="quantity" label="Cantidad estimada" type="number" placeholder="Ej. 250" />
        {deadlineOptions.length > 0 ? (
          <label className="grid min-w-0 gap-2">
            <span className="text-sm font-medium text-ink">
              ¿Para cuándo?
              {requireDeadline && <span className="text-accent"> *</span>}
            </span>
            <select
              name="deadline"
              required={requireDeadline}
              defaultValue=""
              className="block w-full min-w-0 rounded-2xl border border-line bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
            >
              <option value="" disabled>
                Selecciona plazo…
              </option>
              {deadlineOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Field
            name="deadline"
            label="¿Para cuándo?"
            placeholder="Ej. 15 mayo"
            required={requireDeadline}
          />
        )}
      </div>
      {showBudgetField && (
        <Field name="budget" label="Presupuesto orientativo (opcional)" placeholder="Ej. 1.500 €" />
      )}

      <label className="grid gap-2">
        <span className="text-sm font-medium text-ink">Cuéntanos el proyecto</span>
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Logo, evento, claim, color, plazo, lo que sea relevante."
          className="block w-full min-w-0 rounded-2xl border border-line bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
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
        <p className="text-sm text-accent-deep">⚠ {errorMsg || "Error al enviar"}</p>
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
    <label className="grid min-w-0 gap-2">
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="block w-full min-w-0 rounded-2xl border border-line bg-bone-soft px-4 py-3 text-base outline-none transition focus:border-accent"
      />
    </label>
  );
}
