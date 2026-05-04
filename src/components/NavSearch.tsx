"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NavSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        router.push(trimmed ? `/catalogo?q=${encodeURIComponent(trimmed)}` : "/catalogo");
      }}
      className="flex w-full items-center gap-2 rounded-full border border-line bg-bone px-4 py-2.5 text-sm transition focus-within:border-accent"
    >
      <svg
        className="h-4 w-4 shrink-0 text-ink/40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar productos…"
        className="flex-1 bg-transparent outline-none placeholder:text-ink/40"
        aria-label="Buscar productos"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="text-xs text-ink/40 hover:text-accent"
        >
          ✕
        </button>
      )}
    </form>
  );
}
