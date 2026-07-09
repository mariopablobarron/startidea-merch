"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Suggestion = {
  slug: string;
  name: string;
  ref: string;
  imageUrl: string | null;
  category?: string;
};

/**
 * Pedido rápido por referencia o nombre (quick-order estilo portal B2B):
 * el cliente que ya sabe QUÉ quiere teclea la ref STM o el nombre y salta
 * directo a la ficha para configurar cantidad y marcaje.
 * Reutiliza /api/search/suggest (mismas refs públicas STM-XXXXXX del buscador).
 */
export function QuickOrder() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`);
        const j = (await res.json()) as { products?: Suggestion[] };
        setResults((j.products ?? []).slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div>
      <label htmlFor="quick-order" className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/50">
        Pedido rápido
      </label>
      <input
        id="quick-order"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ref (STM-XXXXXX) o nombre del producto…"
        className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      {busy && <p className="mt-2 text-xs text-ink/40">Buscando…</p>}
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-bone">
          {results.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/catalogo/${p.slug}`}
                className="flex items-center gap-3 p-3 hover:bg-accent-mist"
              >
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-lg border border-line object-cover"
                    loading="lazy"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="font-mono text-[10px] text-ink/50">{p.ref}</span>
                </span>
                <span className="text-xs text-accent">Configurar →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !busy && results.length === 0 && (
        <p className="mt-2 text-xs text-ink/50">
          Sin resultados. Prueba con otro término o{" "}
          <Link href="/catalogo" className="text-accent hover:underline">
            explora el catálogo
          </Link>
          .
        </p>
      )}
    </div>
  );
}
