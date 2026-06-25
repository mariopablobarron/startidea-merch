"use client";

import { useMemo, useState } from "react";
import { computeRoi, validateRoiInputs } from "@/lib/roi-calc";

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function CalculadoraRscClient() {
  const [employees, setEmployees] = useState(50);
  const [annualBudgetEur, setAnnualBudgetEur] = useState(5000);
  const [substitutionPct, setSubstitutionPct] = useState(60);

  // Lead capture
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputs = useMemo(
    () => ({ employees, annualBudgetEur, substitutionPct }),
    [employees, annualBudgetEur, substitutionPct],
  );
  const validation = validateRoiInputs(inputs);
  const results = useMemo(() => computeRoi(inputs), [inputs]);

  async function downloadPdf(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/calculadora-rsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...inputs,
          email,
          name: name || null,
          company: company || null,
          sourceUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Error ${res.status}`);
        return;
      }
      const { id } = await res.json();
      // Descargar PDF
      window.open(`/api/calculadora-rsc/pdf?id=${id}`, "_blank");
      setDownloaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Inputs */}
      <div className="lg:col-span-2 rounded-3xl border border-line bg-white p-6 lg:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Tu empresa</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Indícame 3 datos.</h2>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-ink">Nº de empleados</span>
            <input
              type="number"
              min={1}
              value={employees}
              onChange={(e) => setEmployees(Number(e.target.value) || 0)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-base outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Presupuesto merch anual (€)</span>
            <input
              type="number"
              min={100}
              step={100}
              value={annualBudgetEur}
              onChange={(e) => setAnnualBudgetEur(Number(e.target.value) || 0)}
              className="mt-1.5 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-base outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs text-ink/55">Lo que gastas hoy en regalos corporativos, kits onboarding, eventos, etc.</span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">
              % que migrarías a producción local + CEE: <strong className="text-accent">{substitutionPct}%</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={substitutionPct}
              onChange={(e) => setSubstitutionPct(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink/50">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </label>

          {validation && (
            <div className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-deep">⚠ {validation}</div>
          )}
        </div>
      </div>

      {/* Outputs */}
      <div className="lg:col-span-3 space-y-3">
        <ResultCard
          label="kg CO₂ ahorrados al año"
          value={`${NUM.format(results.co2SavedKg)} kg`}
          hint={results.treesEquivalent > 0 ? `≈ ${NUM.format(results.treesEquivalent)} árboles equivalentes` : undefined}
          accent
        />
        <ResultCard
          label="horas de trabajo digno generadas"
          value={`${NUM.format(results.workHoursDignified)} h`}
          hint="En Centros Especiales de Empleo Andalucía"
        />
        <ResultCard
          label="% de tu producción en CEE"
          value={`${results.ceeProductionPct}%`}
          hint="Verificable y reportable en memoria GRI / EFRAG"
        />

        <div className="mt-6 rounded-2xl border border-line bg-white p-5">
          {!downloaded ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">— Certificado PDF</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-ink">
                Descarga el certificado para tu memoria
              </h3>
              <p className="mt-2 text-sm text-ink/65 leading-relaxed">
                PDF firmado con estos datos, listo para incluir en tu memoria de
                sostenibilidad. Te lo mandamos también por email para que lo tengas
                guardado.
              </p>

              {!showEmailGate ? (
                <button
                  type="button"
                  onClick={() => setShowEmailGate(true)}
                  disabled={!!validation}
                  className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
                >
                  Descargar certificado PDF →
                </button>
              ) : (
                <form onSubmit={downloadPdf} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      type="email"
                      required
                      placeholder="Email corporativo*"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      placeholder="Empresa"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="md:col-span-2 rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
                    />
                  </div>
                  {error && (
                    <div className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-deep">⚠ {error}</div>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || !email}
                    className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-40"
                  >
                    {submitting ? "Generando…" : "Descargar y enviarme por email →"}
                  </button>
                  <p className="text-[11px] text-ink/45">
                    Tus datos solo se usan para enviarte el certificado y, si te interesa,
                    una propuesta. Sin spam.
                  </p>
                </form>
              )}
            </>
          ) : (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-social">— Descarga lista</p>
              <h3 className="mt-1 font-display text-xl font-semibold text-ink">
                Tu certificado está descargándose
              </h3>
              <p className="mt-2 text-sm text-ink/65 leading-relaxed">
                Si no se abrió, comprueba el bloqueador de pop-ups. También te lo mandamos a{" "}
                <strong>{email}</strong> con copia del cálculo.
              </p>
              <a
                href="/cotizar"
                className="mt-4 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-bone hover:bg-accent"
              >
                Pedir cotización real ahora →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-accent/40 bg-accent/5" : "border-line bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/55">{label}</p>
      <p
        className={`mt-2 font-display text-3xl font-semibold ${accent ? "text-accent" : "text-ink"}`}
        style={{ fontFamily: "Georgia, serif" }}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink/55">{hint}</p>}
    </div>
  );
}
