"use client";

import { useState } from "react";
import Link from "next/link";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

type GeneratedLine = {
  productHint: string;
  matched: {
    slug: string;
    name: string;
    productRef: string;
    primaryImageUrl: string | null;
    category: string | null;
  } | null;
  alternatives: Array<{
    id: string;
    slug: string;
    name: string;
    productRef: string;
    primaryImageUrl: string | null;
  }>;
  technique: { code: string; name: string; positionId: string } | null;
  numberOfColours: number;
  variants: Array<{ size: string | null; qty: number }>;
  totalQty: number;
  unitPriceCents: number | null;
  totalPriceCents: number | null;
  notes?: string;
  error?: string;
};

type GenerateResponse = {
  ok: boolean;
  parsed: { customerCompany?: string; customerName?: string };
  lines: GeneratedLine[];
  grandTotalCents: number;
  allLinesResolved: boolean;
  error?: string;
};

const SAMPLE_BRIEF = `Toallas de microfibra serigrafiadas: 100ud
Polo hombre negro con el logo del Club Cámara bordado a 1 color: 20ud de talla M, otras 20 de talla L y otras 20 talla XL
Polo mujer negro con el logo del Club Cámara bordado a 1 color: 15ud talla S, otras 15 talla M y otras 15 talla L`;

export default function AIQuoteBuilderPage() {
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Datos cliente
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Save options
  const [sendPaymentLink, setSendPaymentLink] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ cartId: string; payUrl: string | null } | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaveResult(null);
    try {
      const res = await fetch("/api/admin/quote-ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ brief }),
      });
      const data: GenerateResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Error generando");
        return;
      }
      setResult(data);
      // Auto-rellenar datos cliente si la IA los detectó
      if (data.parsed.customerName && !customerName) setCustomerName(data.parsed.customerName);
      if (data.parsed.customerCompany && !customerCompany) setCustomerCompany(data.parsed.customerCompany);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!result) return;
    if (!customerName || !customerEmail) {
      setError("Nombre y email del cliente son obligatorios para guardar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const lines = result.lines
        .filter((l) => l.matched && l.unitPriceCents != null && l.totalPriceCents != null)
        .map((l) => ({
          productSlug: l.matched!.slug,
          productRef: l.matched!.productRef,
          productName: l.matched!.name,
          primaryImageUrl: l.matched!.primaryImageUrl,
          techniqueCode: l.technique?.code ?? null,
          techniqueName: l.technique?.name ?? null,
          positionId: l.technique?.positionId ?? null,
          numberOfColours: l.numberOfColours,
          totalQty: l.totalQty,
          unitPriceCents: l.unitPriceCents!,
          totalPriceCents: l.totalPriceCents!,
          notes: l.notes ?? null,
        }));
      if (lines.length === 0) {
        setError("Ninguna línea válida para guardar");
        return;
      }
      const res = await fetch("/api/admin/quote-ai/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerCompany,
          customerPhone,
          briefRaw: brief,
          lines,
          sendPaymentLink,
          sendEmailToCustomer: sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error guardando");
        return;
      }
      setSaveResult({ cartId: data.cartId, payUrl: data.payUrl });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft">
      <div className="mx-auto max-w-6xl px-6 py-8 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Ventas · IA</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              AI Quote Builder
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-ink/60">
              Pega el brief del cliente en texto natural. La IA identifica productos, técnica de
              marcaje, cantidades por talla y devuelve presupuesto cerrado con productos del
              catálogo. Reduce 20-30 min/cotización a 30 segundos.
            </p>
          </div>
          <Link href="/admin" className="text-xs text-ink/60 hover:text-accent">
            ← Admin
          </Link>
        </header>

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}

        <section className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
          {/* Brief input */}
          <div className="rounded-2xl border border-line bg-bone p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Brief del cliente</h2>
              <button
                type="button"
                onClick={() => setBrief(SAMPLE_BRIEF)}
                className="text-[11px] text-ink/50 hover:text-accent"
              >
                📋 Cargar ejemplo
              </button>
            </div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={12}
              placeholder="Pega aquí el email/whatsapp del cliente. Ej:&#10;&#10;Toallas microfibra serigrafiadas: 100ud&#10;Polos negros bordado 1 color: 20 M, 20 L, 20 XL"
              className="mt-3 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={generate}
              disabled={generating || brief.trim().length < 10}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone shadow-sm transition hover:bg-accent-dark disabled:opacity-40"
            >
              {generating ? "✨ Generando presupuesto…" : "✨ Generar presupuesto con IA"}
            </button>
          </div>

          {/* Datos cliente */}
          <div className="rounded-2xl border border-line bg-bone p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Datos del cliente</h2>
            <p className="mt-1 text-xs text-ink/50">
              La IA intenta rellenar empresa y nombre si aparecen en el brief.
            </p>
            <div className="mt-4 grid gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre y apellidos *"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Email *"
                type="email"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                placeholder="Empresa"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
        </section>

        {/* Resultado */}
        {result && (
          <section className="mt-6 rounded-2xl border border-line bg-bone p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">
                Presupuesto generado · {result.lines.length} líneas
              </h2>
              <span className="rounded-full bg-accent-wash px-3 py-1 text-sm font-medium text-accent-deep">
                {EUR.format(result.grandTotalCents / 100)} sin IVA
              </span>
            </div>

            {!result.allLinesResolved && (
              <p className="mt-2 rounded-lg bg-accent-wash p-2 text-[11px] text-accent-deep">
                ⚠ Algunas líneas no se resolvieron 100%. Revisa los errores antes de guardar.
              </p>
            )}

            <ul className="mt-4 space-y-3">
              {result.lines.map((line, i) => (
                <li
                  key={i}
                  className={`rounded-xl border p-3 ${
                    line.matched && line.totalPriceCents != null
                      ? "border-line bg-bone-soft"
                      : "border-accent/30 bg-accent-wash/30"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {line.matched?.primaryImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.matched.primaryImageUrl}
                        alt={line.matched.name}
                        className="h-14 w-14 flex-shrink-0 rounded-lg object-contain bg-bone"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wider text-ink/50">
                        Brief: &ldquo;{line.productHint}&rdquo;
                      </p>
                      {line.matched ? (
                        <p className="mt-0.5 font-medium text-ink">
                          ✓ {line.matched.name}{" "}
                          <span className="ml-1 text-[11px] font-normal text-ink/40">
                            {line.matched.productRef}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 font-medium text-accent-deep">
                          ⚠ Sin producto encontrado
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-ink/70">
                        {line.technique && (
                          <span className="rounded-full bg-accent-wash px-2 py-0.5 text-accent-deep">
                            {line.technique.name} · {line.numberOfColours} col.
                          </span>
                        )}
                        {line.variants.map((v, j) => (
                          <span key={j} className="rounded-full bg-bone px-2 py-0.5">
                            {v.size ? `${v.size}: ` : ""}{v.qty} ud
                          </span>
                        ))}
                        <span className="rounded-full bg-bone px-2 py-0.5">
                          <strong>Total {line.totalQty}</strong>
                        </span>
                      </div>
                      {line.error && (
                        <p className="mt-2 text-[11px] text-accent-deep">⚠ {line.error}</p>
                      )}
                      {line.alternatives.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] text-ink/40 hover:text-accent">
                            {line.alternatives.length} alternativas
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-[11px]">
                            {line.alternatives.map((a) => (
                              <li key={a.id}>
                                · {a.name} ({a.productRef})
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    {line.totalPriceCents != null && (
                      <div className="text-right">
                        <p className="font-display text-lg font-semibold tabular-nums">
                          {EUR.format(line.totalPriceCents / 100)}
                        </p>
                        <p className="text-[10px] text-ink/50">
                          {line.unitPriceCents != null && EUR.format(line.unitPriceCents / 100)}/ud
                        </p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {/* Save */}
            <div className="mt-6 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sendPaymentLink}
                  onChange={(e) => setSendPaymentLink(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  💳 Generar link de pago directo<br />
                  <span className="text-ink/50">
                    Cliente puede pagar directamente desde el email
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  📧 Enviar email al cliente<br />
                  <span className="text-ink/50">
                    Email con presupuesto + CTA pago/portal
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !customerName || !customerEmail}
                className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-bone hover:bg-accent disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar cotización"}
              </button>
            </div>

            {saveResult && (
              <div className="mt-4 rounded-xl bg-social/10 p-4 text-sm">
                <p className="font-medium text-ink">✓ Cotización guardada</p>
                <p className="mt-1 text-xs text-ink/70">
                  Cart ID: <code className="font-mono">{saveResult.cartId.slice(0, 8)}</code>
                </p>
                {saveResult.payUrl && (
                  <p className="mt-1 text-xs">
                    Link pago:{" "}
                    <a
                      href={saveResult.payUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-accent hover:underline"
                    >
                      {saveResult.payUrl}
                    </a>
                  </p>
                )}
                <Link
                  href={`/admin/cart-quotes/${saveResult.cartId}`}
                  className="mt-2 inline-block text-xs text-accent hover:underline"
                >
                  Abrir en admin →
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
