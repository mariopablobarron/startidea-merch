"use client";

const STAGES = [
  { key: "RECEIVED", label: "Recibido", emoji: "📥" },
  { key: "REVIEWING", label: "Revisando", emoji: "👀" },
  { key: "QUOTE_SENT", label: "Cotización enviada", emoji: "📤" },
  { key: "PAID", label: "Pago recibido", emoji: "💰" },
  { key: "PROOF_APPROVED", label: "Mockup aprobado", emoji: "✓" },
  { key: "IN_PRODUCTION", label: "En producción", emoji: "🏭" },
  { key: "SHIPPED", label: "Enviado", emoji: "🚚" },
  { key: "DELIVERED", label: "Entregado", emoji: "📦" },
] as const;

type Stage = (typeof STAGES)[number]["key"];

export type TimelineEvent = {
  stage: Stage;
  at: string | Date | null;
  details?: string | null;
};

/**
 * Timeline visual del progreso de un pedido.
 * Recibe eventos con su timestamp y los pinta en orden.
 * Si un stage no tiene evento, queda gris (no alcanzado).
 */
export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  const eventsByStage = new Map<Stage, TimelineEvent>();
  for (const e of events) eventsByStage.set(e.stage, e);

  // Determinar el stage más avanzado alcanzado
  const lastStage = STAGES.findLastIndex((s) => eventsByStage.has(s.key));

  return (
    <ol className="relative space-y-3 border-l border-line pl-6">
      {STAGES.map((stage, i) => {
        const e = eventsByStage.get(stage.key);
        const reached = i <= lastStage;
        const current = i === lastStage;
        return (
          <li key={stage.key} className="relative">
            <span
              className={`absolute -left-[1.6rem] flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] ${
                current
                  ? "border-accent bg-accent text-bone shadow-md shadow-accent/30"
                  : reached
                    ? "border-accent bg-accent/20 text-accent-deep"
                    : "border-line bg-bone-soft text-ink/30"
              }`}
            >
              {stage.emoji}
            </span>
            <div className={reached ? "" : "opacity-40"}>
              <p className={`text-sm font-medium ${current ? "text-ink" : "text-ink/80"}`}>
                {stage.label}
              </p>
              {e?.at && (
                <p className="text-[11px] text-ink/50">
                  {new Date(e.at).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
              {e?.details && <p className="mt-0.5 text-xs text-ink/60">{e.details}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
