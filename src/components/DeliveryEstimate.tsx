"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";

/**
 * Estimación de entrega mostrada al cliente.
 *
 * Política (decisión de negocio, 2026-06-11): fecha tope única y conservadora
 * de HOY + 15 días naturales (ajustada a lunes si cae en fin de semana),
 * siempre condicionada a la aprobación del boceto. La mayoría de pedidos
 * llega antes → expectativa cumplible, nunca promesa incumplida.
 *
 * Client component a propósito: la fecha se calcula en el navegador del
 * visitante, así nunca se sirve una fecha congelada por caché/ISR.
 */

const DELIVERY_DAYS = 15;

export function estimatedDeliveryDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + DELIVERY_DAYS);
  // Si cae en fin de semana, pasar al lunes
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

export function DeliveryEstimate({
  variant = "card",
}: {
  variant?: "card" | "inline";
}) {
  // Evitar mismatch de hidratación: la fecha solo se pinta en cliente.
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "long",
    });
    setLabel(fmt.format(estimatedDeliveryDate()));
  }, []);

  if (!label) return null;

  if (variant === "inline") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink/70">
        <Truck className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
        <span>
          Entrega estimada: <strong className="font-semibold text-ink">antes del {label}</strong>
          <span className="text-ink/50"> · tras aprobar tu boceto</span>
        </span>
      </p>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-bone-soft px-4 py-3">
      <Truck className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
      <div>
        <p className="text-sm font-semibold text-ink">
          Entrega estimada: antes del {label}
        </p>
        <p className="mt-0.5 text-xs text-ink/60">
          Producción y envío a península incluidos. Plazo desde tu aprobación
          del boceto — te lo enviamos en 24&nbsp;h tras confirmar.
        </p>
      </div>
    </div>
  );
}
