"use client";

import { useState } from "react";
import Link from "next/link";
import type { NavItem, NavSection } from "./NavDropdown";

export type MobileNavEntry = {
  label: string;
  items?: NavItem[];
  sections?: NavSection[];
};

/**
 * Menú móvil del panel admin (hamburguesa). Recibe las MISMAS entradas que
 * alimentan los NavDropdown de escritorio (construidas por rol en el layout),
 * así que no hay dos listas de enlaces que mantener.
 */
export function MobileAdminNav({ entries }: { entries: MobileNavEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-line bg-bone-soft p-1.5 text-ink hover:border-accent/50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? (
            <>
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </>
          ) : (
            <>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto border-t border-line bg-bone p-5 md:hidden">
          {entries.map((e) => {
            const links = e.items ?? e.sections?.flatMap((s) => s.items) ?? [];
            return (
              <div key={e.label} className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                  {e.label}
                </p>
                <div className="mt-1.5 grid gap-0.5">
                  {links.map((it) => (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`rounded-lg px-2.5 py-2 text-sm hover:bg-bone-soft ${
                        it.highlight ? "font-semibold text-accent" : "text-ink"
                      }`}
                    >
                      {it.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
