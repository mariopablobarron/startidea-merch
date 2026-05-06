"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type GenerateResult = {
  ok: true;
  cartId: string;
  items: number;
  estimatedTotalCents: number;
  summary?: string;
  internalAdvice?: string;
  model?: string;
};

export default function AdminProposalsNewPage() {
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("");
  const [ecoOnly, setEcoOnly] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
        body: JSON.stringify({
          contact: { name, email, company: company || undefined, phone: phone || undefined },
          brief,
          budget: budget ? Number(budget) : undefined,
          quantity: quantity ? Number(quantity) : undefined,
          ecoOnly: ecoOnly || undefined,
          internalNotes: internalNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Error generando propuesta");
      } else {
        setResult(data);
        sessionStorage.setItem("merch:admin", secret);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-xs text-ink/60 hover:text-accent">
          ← Panel
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
          Generar propuesta con IA
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/70">
          Pega el brief que te llegó por email o WhatsApp, completa el contacto, y la IA elige
          3-5 productos del catálogo. Crea un CartQuote IN_PROGRESS para que lo revises antes
          de mandárselo al cliente.
        </p>

        <form onSubmit={generate} className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Contacto del cliente</p>
              <div className="mt-2 space-y-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre"
                  required
                  className="w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Empresa (opcional)"
                  className="w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Filtros opcionales</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Cantidad estimada"
                  type="number"
                  min={1}
                  className="rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Presupuesto € total"
                  type="number"
                  min={1}
                  className="rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={ecoOnly}
                  onChange={(e) => setEcoOnly(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Solo productos eco/sostenibles
              </label>
            </div>

            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="X-Admin-Secret"
              required
              className="w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Brief del cliente</span>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={10}
                minLength={20}
                maxLength={4000}
                required
                placeholder="Pega aquí el email/mensaje del cliente. Ej: 'Necesito 200 regalos para clientes Q4, presupuesto 5€/ud, eco si es posible, plazo 6 semanas, somos consultora de RSC…'"
                className="mt-2 w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-ink/50">Notas internas (no se mandan al cliente)</span>
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Detalles que vienen por otra vía: descuento ya prometido, contacto privado, fecha real límite, etc."
                className="mt-2 w-full rounded-xl border border-line bg-bone px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>

            <button
              type="submit"
              disabled={busy || brief.length < 20 || !secret}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-medium text-bone hover:bg-accent-dark disabled:opacity-40"
            >
              {busy ? "Analizando catálogo y construyendo propuesta…" : "Generar propuesta IA →"}
            </button>
          </div>
        </form>

        {error && <p className="mt-6 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}

        {result && (
          <div className="mt-8 rounded-3xl border border-social bg-social/5 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-social">✓ Propuesta creada</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              {result.items} producto{result.items === 1 ? "" : "s"} · {EUR.format(result.estimatedTotalCents / 100)}
            </h2>
            {result.summary && <p className="mt-3 text-sm text-ink/80">{result.summary}</p>}
            {result.internalAdvice && (
              <div className="mt-4 rounded-2xl bg-bone p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-accent">Consejo interno IA</p>
                <p className="mt-2 text-sm text-ink/80">{result.internalAdvice}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/cart-quotes/${result.cartId}`}
                className="rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-bone hover:bg-accent"
              >
                Abrir CartQuote para revisar y enviar →
              </Link>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setBrief("");
                  setName("");
                  setEmail("");
                  setCompany("");
                  setPhone("");
                  setQuantity("");
                  setBudget("");
                  setEcoOnly(false);
                  setInternalNotes("");
                }}
                className="rounded-full border border-line bg-bone-soft px-5 py-2.5 text-xs font-medium hover:border-accent"
              >
                Generar otra
              </button>
            </div>
            {result.model && (
              <p className="mt-4 text-[11px] text-ink/40">Modelo: {result.model}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
