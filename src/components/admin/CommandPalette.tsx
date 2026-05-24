"use client";

/**
 * Spell C1 — Cmd+K palette del admin.
 *
 * Modal global de búsqueda + navegación. Cmd+K (Mac) o Ctrl+K (Windows/Linux)
 * lo abre. Esc lo cierra. Up/Down navegan, Enter dispara.
 *
 * Diseño:
 * - Sin librería externa (cmdk, downshift, etc.) — 0 KB extra al bundle.
 * - Backend: /api/admin/search devuelve resultados agrupados por tipo.
 * - Debounce 150ms en la query.
 * - Si query vacía → muestra atajos (páginas frecuentes + promos activas + destacados).
 * - Renderiza solo cuando está abierto (lazy).
 *
 * Montaje: añadir <CommandPalette /> en src/app/admin/layout.tsx (client).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  type: "product" | "promotion" | "order" | "customer" | "shortcut";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  hint?: string;
};

const TYPE_ICON: Record<Result["type"], string> = {
  product: "📦",
  promotion: "🏷",
  order: "🧾",
  customer: "👤",
  shortcut: "→",
};

const TYPE_LABEL: Record<Result["type"], string> = {
  product: "Producto",
  promotion: "Promo",
  order: "Pedido",
  customer: "Cliente",
  shortcut: "Atajo",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  // Toggle con Cmd+K / Ctrl+K (global)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus + reset al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setCursor(0);
    } else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/admin/search?q=${encodeURIComponent(q)}`,
          { credentials: "include" },
        );
        const data = await r.json();
        setResults(data.results || []);
        setCursor(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  const goTo = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  // Keyboard navigation cuando está abierto
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = results[cursor];
      if (sel) goTo(sel.href);
    }
  }

  // Scroll into view el item activo
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-bone shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="text-ink/40">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Buscar producto, promo, pedido, cliente…"
            className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
          />
          {loading && <span className="text-xs text-ink/40">…</span>}
          <kbd className="rounded border border-line bg-bone-soft px-1.5 py-0.5 text-[10px] text-ink/55">
            esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink/50">
            {q.trim() ? "Sin resultados" : "Escribe para buscar…"}
          </div>
        ) : (
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
            {results.map((r, i) => (
              <li
                key={`${r.type}:${r.id}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => goTo(r.href)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                  cursor === i
                    ? "bg-accent/10 text-ink"
                    : "text-ink/85 hover:bg-bone-soft"
                }`}
              >
                <span className="w-5 text-center text-base">{TYPE_ICON[r.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  {r.subtitle && (
                    <div className="truncate text-[11px] text-ink/50">
                      {TYPE_LABEL[r.type]} · {r.subtitle}
                    </div>
                  )}
                </div>
                {r.hint && (
                  <span className="ml-2 shrink-0 rounded-full bg-bone-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/55">
                    {r.hint}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line bg-bone-soft px-4 py-2 text-[10px] text-ink/55">
          <span>
            <kbd className="rounded border border-line bg-bone px-1 py-px">↑↓</kbd> navegar ·{" "}
            <kbd className="rounded border border-line bg-bone px-1 py-px">↵</kbd> abrir
          </span>
          <span>
            Tip: <kbd className="rounded border border-line bg-bone px-1 py-px">⌘K</kbd> desde
            cualquier vista
          </span>
        </div>
      </div>
    </div>
  );
}
