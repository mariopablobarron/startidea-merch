"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  title?: string;
  highlight?: boolean; // magenta para CTAs IA / destacados
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * Dropdown reusable para agrupar enlaces del nav admin.
 *
 * Dos modos:
 *   - Simple (`items`): lista vertical compacta. Para dropdowns ≤ 6 items.
 *   - Megamenu (`sections`): grid de columnas con títulos. Para 7+ items
 *     agrupables por categoría (Marketing con 15+ destinos).
 *
 * Comportamiento:
 *  - Click toggle (no hover) para evitar abrirse sin querer en mobile/touch.
 *  - Cierra al click-out o al pulsar Escape.
 *  - Accesible (aria-expanded + keyboard).
 */
export function NavDropdown({
  label,
  items,
  sections,
}: {
  label: string;
  items?: NavItem[];
  sections?: NavSection[];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isMega = !!sections && sections.length > 0;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-ink/60 hover:text-accent"
      >
        {label}
        <span className={`text-[9px] transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && !isMega && items && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-line bg-bone py-1.5 shadow-xl">
          {items.map((it) => (
            <DropdownLink key={it.href} item={it} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}

      {open && isMega && sections && (
        // El ancho es EXPLÍCITO y no se puede quitar. Este panel está
        // posicionado en absoluto, así que se dimensiona por su contenido; y
        // dentro lleva un grid cuyas columnas en Tailwind son
        // `minmax(0, 1fr)`, que pueden encogerse hasta cero. Sin un ancho de
        // referencia que repartir, las cuatro columnas colapsaban y los
        // títulos se pintaban unos encima de otros: el menú medía 114 px en
        // una pantalla de 1400 y se leía «AUDCONTENIDO».
        //
        // Las medidas salen de la cuenta, no del ojo: 170 px por columna
        // (el `min-w` de abajo) + 24 de hueco (`gap-x-6`) + 40 de padding
        // (`p-5` a los dos lados). Tres columnas piden 598 px y cuatro, 792.
        <div className="absolute left-0 top-full z-50 mt-2 w-[38rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-bone shadow-2xl lg:w-[50rem]">
          {/* El nav de escritorio solo existe desde `md`; por debajo hay
              hamburguesa, así que `grid-cols-2` nunca llega a aplicarse. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 md:grid-cols-3 lg:grid-cols-4">
            {sections.map((sec) => (
              <div key={sec.title} className="min-w-[170px]">
                <p className="mb-2 border-b border-line pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink/50">
                  {sec.title}
                </p>
                <ul className="space-y-px">
                  {sec.items.map((it) => (
                    <li key={it.href}>
                      <Link
                        href={it.href}
                        title={it.title}
                        onClick={() => setOpen(false)}
                        className={`block rounded-md px-2 py-1.5 text-xs ${
                          it.highlight
                            ? "text-accent hover:bg-accent/5"
                            : "text-ink/70 hover:bg-accent/5 hover:text-accent"
                        }`}
                      >
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {/* Tip Cmd+K */}
          <div className="border-t border-line bg-bone-soft px-5 py-2 text-[10px] text-ink/45">
            Tip: <kbd className="rounded border border-line bg-bone px-1 py-px font-mono">⌘K</kbd> para buscar cualquier sección al instante
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownLink({ item, onClick }: { item: NavItem; onClick: () => void }) {
  return (
    <Link
      href={item.href}
      title={item.title}
      onClick={onClick}
      className={`block px-4 py-2 text-xs ${
        item.highlight
          ? "text-accent hover:bg-accent/5"
          : "text-ink/70 hover:bg-accent/5 hover:text-accent"
      }`}
    >
      {item.label}
    </Link>
  );
}
