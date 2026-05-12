"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Status = "DRAFT" | "REVIEW" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "FAILED" | "ARCHIVED";
type Channel =
  | "IG" | "FB" | "LINKEDIN" | "X" | "TIKTOK" | "YOUTUBE" | "PINTEREST"
  | "EMAIL" | "WEB" | "GOOGLE_ADS" | "META_ADS" | "LINKEDIN_ADS";
type ContentType = "POST" | "STORY" | "REEL" | "CARRUSEL" | "EMAIL" | "AD" | "BLOG" | "LANDING";

const CHANNEL_LABEL: Record<Channel, string> = {
  IG: "Instagram", FB: "Facebook", LINKEDIN: "LinkedIn", X: "X / Twitter",
  TIKTOK: "TikTok", YOUTUBE: "YouTube", PINTEREST: "Pinterest",
  EMAIL: "Email", WEB: "Web / Landing",
  GOOGLE_ADS: "Google Ads", META_ADS: "Meta Ads", LINKEDIN_ADS: "LinkedIn Ads",
};

const TYPE_LABEL: Record<ContentType, string> = {
  POST: "Post", STORY: "Story", REEL: "Reel", CARRUSEL: "Carrusel",
  EMAIL: "Email", AD: "Anuncio", BLOG: "Blog", LANDING: "Landing",
};

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: "bg-bone-soft text-ink/50",
  REVIEW: "bg-accent-mist text-accent-deep",
  APPROVED: "bg-social/15 text-social",
  SCHEDULED: "bg-accent/20 text-accent-deep",
  PUBLISHED: "bg-social/20 text-social",
  FAILED: "bg-accent-wash text-accent-deep",
  ARCHIVED: "bg-ink/5 text-ink/40",
};

type Piece = {
  id: string;
  type: ContentType;
  channel: Channel;
  status: Status;
  title: string | null;
  copy: string;
  creativeUrl: string | null;
  productSlug: string | null;
  campaignId: string | null;
  campaign: { name: string } | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: string;
};

export default function ContentListPage() {
  const router = useRouter();
  const [items, setItems] = useState<Piece[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status | "">("");
  const [channel, setChannel] = useState<Channel | "">("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        ...(status ? { status } : {}),
        ...(channel ? { channel } : {}),
        page: String(page),
        perPage: "30",
      });
      const res = await fetch(`/api/admin/content?${params}`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [q, status, channel, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function createNew() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "POST",
          channel: "LINKEDIN",
          copy: "Borrador — genera con IA o escribe tu copy aquí…",
        }),
      });
      const data = await res.json();
      if (res.ok && data.piece) {
        router.push(`/admin/marketing/content/${data.piece.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · Content Studio
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Piezas de contenido
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              {total} {total === 1 ? "pieza" : "piezas"} · Workflow:
              DRAFT → REVIEW → APPROVED → SCHEDULED → PUBLISHED. La IA genera copy
              en tono Startidea (Manual v1.0). Solo CEO aprueba.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <Link
                href="/admin/marketing/calendar"
                className="text-ink/60 hover:text-accent"
              >
                📅 Vista calendario
              </Link>
              <Link href="/admin/marketing/campaigns" className="text-ink/60 hover:text-accent">
                Campañas
              </Link>
              <Link href="/admin/marketing/site" className="text-ink/60 hover:text-accent">
                Copy Hero
              </Link>
              <Link href="/admin/marketing/banners" className="text-ink/60 hover:text-accent">
                Banners
              </Link>
              <Link href="/admin/marketing/broadcasts" className="text-ink/60 hover:text-accent">
                Email broadcasts
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={createNew}
            disabled={creating}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {creating ? "Creando…" : "+ Nueva pieza"}
          </button>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar en título o copy…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status | "");
              setPage(1);
            }}
            className="rounded-full border border-line bg-bone px-3 py-2 text-xs"
          >
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borrador</option>
            <option value="REVIEW">En revisión</option>
            <option value="APPROVED">Aprobada</option>
            <option value="SCHEDULED">Programada</option>
            <option value="PUBLISHED">Publicada</option>
            <option value="FAILED">Fallida</option>
            <option value="ARCHIVED">Archivada</option>
          </select>
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value as Channel | "");
              setPage(1);
            }}
            className="rounded-full border border-line bg-bone px-3 py-2 text-xs"
          >
            <option value="">Todos los canales</option>
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone/50 p-10 text-center">
            <p className="text-3xl">✍️</p>
            <p className="mt-3 font-display text-lg text-ink">Sin piezas todavía</p>
            <p className="mt-1 text-sm text-ink/60">
              Crea una nueva y deja que la IA proponga 3 variaciones en tono Startidea.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Pieza</th>
                  <th className="p-3">Canal</th>
                  <th className="p-3">Campaña</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-t border-line align-middle hover:bg-bone-soft">
                    <td className="p-3">
                      <p className="font-medium text-ink">
                        {p.title || (p.copy.split("\n")[0]?.slice(0, 60) || "Sin título")}
                        <span className="ml-2 rounded-full bg-bone-soft px-1.5 py-0.5 text-[10px] font-medium text-ink/60">
                          {TYPE_LABEL[p.type]}
                        </span>
                      </p>
                      <p className="line-clamp-1 text-[11px] text-ink/50">{p.copy}</p>
                    </td>
                    <td className="p-3 text-xs text-ink/70">{CHANNEL_LABEL[p.channel]}</td>
                    <td className="p-3 text-xs text-ink/60">
                      {p.campaign?.name || <span className="text-ink/30">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[p.status]}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-ink/60">
                      {p.publishedAt
                        ? `Pub ${new Date(p.publishedAt).toLocaleDateString("es-ES")}`
                        : p.scheduledAt
                          ? `Prog ${new Date(p.scheduledAt).toLocaleDateString("es-ES")}`
                          : new Date(p.createdAt).toLocaleDateString("es-ES")}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/marketing/content/${p.id}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {p.status === "PUBLISHED" || p.status === "ARCHIVED" ? "Ver" : "Editar"} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
