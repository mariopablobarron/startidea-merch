import Link from "next/link";

/**
 * Estado vacío único del panel admin — sustituye a las 25+ redacciones
 * sueltas ("No hay…", "Aún no hay…", "Sin resultados") con cajas dispares.
 * Icono opcional (emoji), mensaje y CTA opcional para guiar el siguiente paso.
 */
export function EmptyState({
  icon = "🗂",
  title,
  hint,
  ctaLabel,
  ctaHref,
}: {
  icon?: string;
  title: string;
  hint?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-bone-soft p-10 text-center">
      <p className="text-2xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 text-sm font-medium text-ink/75">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-ink/55">{hint}</p>}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-4 inline-block rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone transition hover:bg-accent"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
