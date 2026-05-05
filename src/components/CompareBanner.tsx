"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "merch:compare";

export function CompareBanner() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setSlugs(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setSlugs([]);
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

  if (slugs.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transform">
      <div className="flex items-center gap-3 rounded-full border border-line bg-ink px-5 py-2.5 text-sm text-bone shadow-2xl">
        <span className="font-medium">
          {slugs.length} producto{slugs.length === 1 ? "" : "s"} para comparar
        </span>
        <span className="text-bone/30">·</span>
        <Link
          href={`/comparar?slugs=${slugs.join(",")}`}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-bone transition hover:bg-accent-dark"
        >
          Comparar ahora →
        </Link>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
              window.dispatchEvent(new CustomEvent("merch:compare-change"));
            } catch {}
          }}
          className="text-xs text-bone/40 hover:text-accent"
        >
          Vaciar
        </button>
      </div>
    </div>
  );
}
