"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "merch:compare";
const MAX = 3;

function readSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeSlugs(slugs: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
    window.dispatchEvent(new CustomEvent("merch:compare-change"));
  } catch {}
}

export function CompareToggle({ slug }: { slug: string }) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSlugs(readSlugs());
    function refresh() {
      setSlugs(readSlugs());
    }
    window.addEventListener("merch:compare-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("merch:compare-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const isInside = slugs.includes(slug);
  const full = slugs.length >= MAX && !isInside;

  function toggle() {
    if (isInside) {
      writeSlugs(slugs.filter((s) => s !== slug));
    } else {
      if (slugs.length >= MAX) return;
      writeSlugs([...slugs, slug]);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={full}
      className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-xs font-medium transition ${
        isInside
          ? "border-accent bg-accent-wash text-accent-deep"
          : full
            ? "cursor-not-allowed border-line bg-bone-soft text-ink/40"
            : "border-line bg-bone text-ink/70 hover:border-accent hover:text-accent"
      }`}
      title={full ? `Máximo ${MAX} productos` : ""}
    >
      {isInside ? (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>En el comparador</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{full ? `Comparador lleno (${MAX})` : "Añadir a comparar"}</span>
        </>
      )}
    </button>
  );
}
