"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "merch:compare";

/**
 * Decora cada card del catálogo con un badge "✓ Comparando" cuando el slug
 * está en localStorage. Toggle directo desde la card sin entrar a la ficha.
 *
 * Se renderiza como acción hermana del `<Link>` de la card para no anidar
 * elementos interactivos. Mantiene preventDefault/stopPropagation por robustez.
 */
export function CompareBadge({ slug }: { slug: string }) {
  const [list, setList] = useState<string[]>([]);

  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setList(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setList([]);
      }
    }
    read();
    window.addEventListener("merch:compare-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("merch:compare-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const inside = list.includes(slug);
  const full = list.length >= 3 && !inside;

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    let next: string[];
    if (inside) next = list.filter((s) => s !== slug);
    else if (list.length >= 3) return;
    else next = [...list, slug];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("merch:compare-change"));
    } catch {}
    setList(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={full}
      title={full ? "Máximo 3 productos en comparador" : inside ? "Quitar del comparador" : "Añadir al comparador"}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs transition ${
        inside
          ? "border-accent bg-accent text-bone"
          : "border-line bg-bone text-ink/50 hover:border-accent hover:text-accent"
      } ${full ? "cursor-not-allowed opacity-30" : ""}`}
    >
      {inside ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3h12v12M3 9v12h12" />
        </svg>
      )}
    </button>
  );
}
