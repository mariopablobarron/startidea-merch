/**
 * Tarjeta KPI única del panel admin — sustituye a las ~15 reimplementaciones
 * locales (Kpi/KpiCard/Stat) que divergían en padding y colores fuera de
 * paleta (amber-300/emerald-300). SOLO tokens de marca.
 *
 * tone: neutral (defecto) · accent (destacado/CTA) · social (positivo/éxito)
 *       · warn (atención — usa accent-wash, no amber crudo).
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "accent" | "social" | "warn";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "border-line bg-bone",
    accent: "border-accent/40 bg-bone ring-1 ring-accent/20",
    social: "border-social/40 bg-bone ring-1 ring-social/20",
    warn: "border-accent-deep/30 bg-accent-wash",
  };
  const valueColor: Record<string, string> = {
    neutral: "text-ink",
    accent: "text-accent",
    social: "text-social",
    warn: "text-accent-deep",
  };
  return (
    <div className={`rounded-3xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${valueColor[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink/55">{hint}</p>}
    </div>
  );
}
