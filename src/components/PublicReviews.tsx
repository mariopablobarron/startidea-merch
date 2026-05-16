"use client";

import { useEffect, useState } from "react";

type Public = {
  reviews: Array<{
    author: string | null;
    company: string | null;
    score: number;
    comment: string | null;
    at: string | null;
  }>;
  stats: { total: number; promoters: number; detractors: number; npsScore: number | null };
};

export function PublicReviews() {
  const [data, setData] = useState<Public | null>(null);

  useEffect(() => {
    fetch("/api/reviews/public")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d as Public);
      })
      .catch(() => {});
  }, []);

  if (!data || data.reviews.length === 0) return null;

  return (
    <section className="border-t border-line bg-bone-soft py-20 lg:py-28">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">Lo que dicen</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display text-section font-semibold text-ink">
            Empresas que ya han producido con nosotros.
          </h2>
          {data.stats.npsScore != null && (
            <div className="text-right">
              <p className="font-display text-5xl font-semibold tabular-nums text-social">
                +{data.stats.npsScore}
              </p>
              <p className="text-xs uppercase tracking-wider text-ink/50">
                Net Promoter Score · {data.stats.total} valoraciones
              </p>
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((r, i) => (
            <article key={i} className="rounded-3xl border border-line bg-bone p-6">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                    r.score >= 9
                      ? "bg-social text-bone"
                      : r.score >= 7
                        ? "bg-accent text-bone"
                        : "bg-ink/10 text-ink/70"
                  }`}
                >
                  {r.score}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-ink/40">
                  {r.score >= 9 ? "Promotor" : r.score >= 7 ? "Neutral" : "Detractor"}
                </span>
              </div>
              {r.comment && (
                <p className="mt-4 text-[15px] leading-relaxed text-ink/80">«{r.comment}»</p>
              )}
              <p className="mt-4 text-xs text-ink/50">
                <span className="font-medium text-ink">{r.author || "Cliente"}</span>
                {r.company && ` · ${r.company}`}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
