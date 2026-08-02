import type { ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export function CatalogFiltersDisclosure({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <>
      {/* Un details cerrado oculta sus descendientes por semántica nativa,
          incluso si una media query intenta aplicar display:block. Por eso la
          versión desktop es un aside hermano y no un hijo del disclosure. */}
      <details className="group lg:hidden">
        <summary className="mb-5 flex cursor-pointer list-none items-center justify-between rounded-full border border-line bg-bone-soft px-5 py-3 text-sm font-medium text-ink transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtrar productos
            {activeCount > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                {activeCount}
              </span>
            )}
          </span>
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <aside className="hidden max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-bone-soft p-4 group-open:block">
          {children}
        </aside>
      </details>

      <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
        {children}
      </aside>
    </>
  );
}
