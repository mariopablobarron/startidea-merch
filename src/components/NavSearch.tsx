"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Suggestion = {
  products: Array<{ slug: string; name: string; ref: string; imageUrl: string | null; category?: string | null }>;
  categories: Array<{ slug: string; name: string; path: string }>;
};

export function NavSearch({ size = "nav" }: { size?: "nav" | "hero" } = {}) {
  const hero = size === "hero";
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const json: Suggestion = await res.json();
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go() {
    const trimmed = q.trim();
    setOpen(false);
    router.push(trimmed ? `/catalogo?q=${encodeURIComponent(trimmed)}` : "/catalogo");
  }

  const hasResults = !!data && (data.products.length > 0 || data.categories.length > 0);

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className={`flex w-full min-w-0 items-center gap-2 rounded-full bg-bone transition focus-within:border-accent ${
          hero
            ? "border-2 border-ink/15 px-6 py-5 text-lg shadow-lg focus-within:shadow-xl"
            : "border border-line px-4 py-2.5 text-sm"
        }`}
      >
        <svg
          className={`${hero ? "h-6 w-6" : "h-4 w-4"} shrink-0 text-ink/40`}
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
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={hero ? "Busca productos: camisetas, tazas, mochilas…" : "Buscar productos…"}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink/40"
          aria-label="Buscar productos"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setData(null);
            }}
            className="text-xs text-ink/40 hover:text-accent"
          >
            ✕
          </button>
        )}
        {hero && (
          <button
            type="submit"
            className="shrink-0 rounded-full bg-accent px-7 py-3 text-base font-semibold text-bone transition hover:bg-accent-dark"
          >
            Buscar
          </button>
        )}
      </form>

      {hero && !open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink/50">Populares:</span>
          {["Camisetas", "Sudaderas", "Tazas", "Mochilas", "Bolígrafos", "Libretas"].map((t) => (
            <Link
              key={t}
              href={`/catalogo?q=${encodeURIComponent(t.toLowerCase())}`}
              className="rounded-full border border-line bg-bone px-3 py-1 text-xs text-ink/70 transition hover:border-accent hover:text-accent"
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[480px] overflow-y-auto rounded-2xl border border-line bg-bone shadow-2xl">
          {loading && (
            <div className="px-4 py-5 text-sm text-ink/50">Buscando…</div>
          )}

          {!loading && data && !hasResults && (
            <div className="px-4 py-5 text-sm text-ink/60">
              Nada para «{q}». Pulsa Buscar para abrir el catálogo completo o{" "}
              <Link href="/recomendador" className="text-accent underline-offset-4 hover:underline">
                pedir al asistente IA
              </Link>.
            </div>
          )}

          {!loading && data && hasResults && (
            <div className="py-2">
              {data.categories.length > 0 && (
                <div className="px-4 py-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-ink/50">
                    Categorías
                  </p>
                  <ul className="mt-1.5">
                    {data.categories.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={`/catalogo?cat=${c.slug}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink/80 hover:bg-bone-soft hover:text-accent"
                        >
                          <svg
                            className="h-3.5 w-3.5 text-ink/40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                          </svg>
                          {c.path}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.products.length > 0 && (
                <div className="px-4 py-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-ink/50">
                    Productos
                  </p>
                  <ul className="mt-1.5">
                    {data.products.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/catalogo/${p.slug}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-bone-soft"
                        >
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-bone-soft">
                            {p.imageUrl ? (
                              <Image
                                src={p.imageUrl}
                                alt=""
                                fill
                                sizes="40px"
                                className="object-contain p-1"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{p.name}</p>
                            <p className="truncate text-[11px] text-ink/50">
                              {p.ref}
                              {p.category && ` · ${p.category}`}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-2 border-t border-line px-4 py-2">
                <button
                  onClick={go}
                  className="w-full text-left text-xs text-accent transition hover:text-accent-dark"
                >
                  Ver todos los resultados de «{q}» →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
