"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  title?: string;
  highlight?: boolean; // magenta para CTAs IA
};

/**
 * Dropdown reusable para agrupar enlaces secundarios del nav admin.
 * Reduce ruido visual cuando hay >5 enlaces por sección.
 *
 * Comportamiento:
 *  - Click toggle (no hover) para evitar abrirse sin querer en mobile/touch.
 *  - Cierra al click-out o al pulsar Escape.
 *  - Accesible (aria-expanded + button + keyboard).
 */
export function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-2xl border border-line bg-bone py-1.5 shadow-xl">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              title={it.title}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-xs ${
                it.highlight ? "text-accent hover:bg-accent/5" : "text-ink/70 hover:bg-accent/5 hover:text-accent"
              }`}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
