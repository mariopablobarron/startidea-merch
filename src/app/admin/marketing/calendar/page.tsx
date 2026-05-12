"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Piece = {
  id: string;
  type: string;
  channel: string;
  status: string;
  title: string | null;
  copy: string;
  scheduledAt: string | null;
  publishedAt: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-bone-soft text-ink/50",
  REVIEW: "bg-accent-mist text-accent-deep",
  APPROVED: "bg-social/15 text-social",
  SCHEDULED: "bg-accent/20 text-accent-deep",
  PUBLISHED: "bg-social/30 text-social",
  FAILED: "bg-accent-wash text-accent-deep",
};

const CHANNEL_ICON: Record<string, string> = {
  IG: "📷", FB: "📘", LINKEDIN: "💼", X: "𝕏",
  TIKTOK: "🎵", YOUTUBE: "▶︎", PINTEREST: "📌",
  EMAIL: "✉️", WEB: "🌐",
  GOOGLE_ADS: "🔍", META_ADS: "Ⓜ️", LINKEDIN_ADS: "💼",
};

const DAY_NAMES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

export default function MarketingCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar piezas con scheduledAt o publishedAt en el mes
  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/content?perPage=200", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setPieces(d.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Calendario: arrancamos en lunes
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const firstWeekday = (first.getDay() + 6) % 7; // 0 = lunes
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) });
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [year, month]);

  // Indexar piezas por YYYY-MM-DD
  const piecesByDay = useMemo(() => {
    const map: Record<string, Piece[]> = {};
    for (const p of pieces) {
      const when = p.publishedAt || p.scheduledAt;
      if (!when) continue;
      const d = new Date(when);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = d.toISOString().slice(0, 10);
      (map[key] ||= []).push(p);
    }
    return map;
  }, [pieces, year, month]);

  function move(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const monthName = new Date(year, month, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · Calendario editorial
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink capitalize">
              {monthName}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/admin/marketing/content" className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent">
              ← Lista
            </Link>
            <button
              type="button"
              onClick={() => move(-1)}
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              aria-label="Mes anterior"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => {
                setYear(today.getFullYear());
                setMonth(today.getMonth());
              }}
              className="rounded-full bg-accent px-4 py-1.5 font-semibold text-bone hover:bg-accent-dark"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              aria-label="Mes siguiente"
            >
              →
            </button>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <div className="grid grid-cols-7 border-b border-line bg-bone-soft text-[10px] font-medium uppercase tracking-wider text-ink/50">
              {DAY_NAMES.map((d) => (
                <div key={d} className="p-2 text-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((cell, i) => {
                if (!cell.date) {
                  return <div key={i} className="min-h-[110px] border-t border-r border-line/60 bg-bone-soft/30" />;
                }
                const key = cell.date.toISOString().slice(0, 10);
                const items = piecesByDay[key] || [];
                const isToday = cell.date.toDateString() === today.toDateString();
                return (
                  <div
                    key={i}
                    className={`min-h-[110px] border-t border-r border-line/60 p-2 ${isToday ? "bg-accent/5" : ""}`}
                  >
                    <p className={`text-xs font-medium ${isToday ? "text-accent" : "text-ink/60"}`}>
                      {cell.date.getDate()}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {items.slice(0, 4).map((it) => (
                        <li key={it.id}>
                          <Link
                            href={`/admin/marketing/content/${it.id}`}
                            className={`block truncate rounded px-1.5 py-0.5 text-[10px] font-medium hover:opacity-80 ${STATUS_COLOR[it.status] || "bg-bone-soft text-ink/60"}`}
                            title={it.copy.slice(0, 100)}
                          >
                            <span className="mr-1">{CHANNEL_ICON[it.channel] || ""}</span>
                            {it.title || it.copy.slice(0, 28)}
                          </Link>
                        </li>
                      ))}
                      {items.length > 4 && (
                        <li className="text-[10px] text-ink/40">+{items.length - 4} más</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Leyenda */}
        <div className="mt-4 flex flex-wrap gap-3 text-[10px] text-ink/60">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-bone-soft" /> Borrador</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-mist" /> En revisión</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-social/30" /> Aprobada / Publicada</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent/40" /> Programada</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-wash" /> Fallida</span>
        </div>
      </div>
    </main>
  );
}
