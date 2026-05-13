/**
 * Top bar de contacto B2B — visible en todas las páginas públicas sobre el Nav.
 *
 * Justificación: en B2B la decisión de compra suele requerir una llamada o
 * un email de aclaración (cantidades grandes, fechas duras, dudas de
 * marcaje). Tener tel + email + horario permanentemente visibles reduce
 * fricción y aumenta la conversión "estoy en una página, tengo dudas →
 * llamo ya". Patrón estándar de e-commerce B2B serio (todomerch.com,
 * regalos-de-empresa.es, garrampa.es).
 *
 * Server component — cero JS adicional.
 */

const TEL = process.env.NEXT_PUBLIC_PHONE || "+34 958 045 789";
const EMAIL = process.env.NEXT_PUBLIC_EMAIL || "pedidos@startidea.es";
const HOURS = "L-V 9-18h";

export function TopBar() {
  return (
    <div className="hidden border-b border-line bg-bone-soft text-[11px] sm:block">
      <div className="mx-auto flex max-w-8xl items-center justify-between gap-4 px-6 py-1.5 lg:px-10">
        <div className="flex items-center gap-4 text-ink/60">
          <a
            href={`tel:${TEL.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-1.5 hover:text-accent"
            aria-label={`Llamar a ${TEL}`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            <span className="font-medium tabular-nums">{TEL}</span>
          </a>
          <a
            href={`mailto:${EMAIL}`}
            className="hidden items-center gap-1.5 hover:text-accent md:inline-flex"
            aria-label={`Email a ${EMAIL}`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>{EMAIL}</span>
          </a>
          <span className="hidden items-center gap-1.5 text-ink/40 lg:inline-flex">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {HOURS}
          </span>
        </div>
        <div className="flex items-center gap-3 text-ink/60">
          <span className="hidden items-center gap-1.5 lg:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-social" />
            Cotización en 24h
          </span>
          <span className="text-ink/30">·</span>
          <span>España + UE</span>
        </div>
      </div>
    </div>
  );
}
