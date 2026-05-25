"use client";

/**
 * /admin/marketing/newsletter — Gestión de subscribers + importador Excel/CSV.
 *
 * Flujo de import (2 pasos sin perder el archivo):
 *   1. Drag/select archivo → POST /preview → backend parsea, valida, devuelve
 *      mapping detectado + stats + temp_token + primeras 10 filas.
 *   2. Usuario revisa preview, ajusta tag → POST /import con temp_token.
 *
 * Lista subscribers con filtros: search, tag, status. Click → modal editar.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  tags: string[];
  source: string | null;
  optedInAt: string;
  unsubscribedAt: string | null;
  lastSentAt: string | null;
  totalSent: number;
  importBatchId: string | null;
};

type Stats = {
  subscribed: number;
  unsubscribed: number;
  tags: Array<{ tag: string; count: number }>;
};

type PreviewResp = {
  ok: true;
  filename: string;
  totalRows: number;
  mapping: {
    email: string | null;
    name: string | null;
    company: string | null;
    phone: string | null;
    extras: string[];
  };
  headers: string[];
  preview: Array<{
    rowNumber: number;
    email: string | null;
    name: string | null;
    company: string | null;
    phone: string | null;
    meta: Record<string, string>;
    rawError?: string;
  }>;
  stats: {
    valid: number;
    invalid: number;
    duplicated_in_file: number;
    already_exists: number;
    new: number;
    unsubscribed_existing: number;
  };
  temp_token: string;
};

export default function NewsletterPage() {
  const [items, setItems] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(50);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<"subscribed" | "unsubscribed" | "all">("subscribed");
  const [loading, setLoading] = useState(true);
  const [importerOpen, setImporterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        status,
        page: String(page),
        perPage: String(perPage),
      });
      if (tag) params.set("tag", tag);
      const r = await fetch(`/api/admin/newsletter?${params}`, { credentials: "include" });
      const d = await r.json();
      setItems(d.items || []);
      setTotal(d.total || 0);
      setStats(d.stats || null);
    } finally {
      setLoading(false);
    }
  }, [q, status, page, perPage, tag]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Marketing · Newsletter
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Subscribers</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              Importa tu lista desde Excel/CSV, gestiona tags, y envía broadcasts
              desde <Link href="/admin/marketing/broadcasts" className="text-accent hover:underline">Broadcasts</Link>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImporterOpen(true)}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
          >
            + Importar Excel/CSV
          </button>
        </header>

        {/* Stats globales */}
        {stats && (
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Suscritos activos" value={stats.subscribed} accent />
            <Stat label="Dados de baja" value={stats.unsubscribed} />
            <Stat label="Listas (tags)" value={stats.tags.length} />
          </div>
        )}

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar email / nombre / empresa…"
            className="w-72 rounded-full border border-line bg-bone px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <select
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setPage(1);
            }}
            className="rounded-full border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">Todas las listas</option>
            {stats?.tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {(["subscribed", "unsubscribed", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  status === s
                    ? "bg-accent text-bone"
                    : "border border-line bg-bone hover:border-accent"
                }`}
              >
                {s === "subscribed" ? "Activos" : s === "unsubscribed" ? "Bajas" : "Todos"}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <p className="text-sm text-ink/60">Cargando…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bone p-10 text-center">
            <p className="font-display text-lg text-ink">Sin subscribers aún</p>
            <p className="mt-2 text-sm text-ink/60">
              {tag || q
                ? "Prueba quitando filtros."
                : "Sube tu primer Excel con la lista de contactos."}
            </p>
            {!tag && !q && (
              <button
                type="button"
                onClick={() => setImporterOpen(true)}
                className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone hover:bg-accent-dark"
              >
                Importar primero archivo
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone">
            <table className="w-full text-sm">
              <thead className="bg-bone-soft text-left text-xs uppercase tracking-wider text-ink/60">
                <tr>
                  <th className="p-3">Email</th>
                  <th className="p-3">Nombre · Empresa</th>
                  <th className="p-3">Tags</th>
                  <th className="p-3">Origen</th>
                  <th className="p-3 text-right">Envíos</th>
                  <th className="p-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-t border-line hover:bg-bone-soft">
                    <td className="p-3">
                      <div className="font-mono text-[12px] text-ink">{s.email}</div>
                      <div className="text-[10px] text-ink/40">
                        Alta {new Date(s.optedInAt).toLocaleDateString("es-ES")}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-ink/85">
                      {s.name || <span className="text-ink/30">—</span>}
                      {s.company && <div className="text-[11px] text-ink/50">{s.company}</div>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.tags.slice(0, 4).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent-deep"
                          >
                            {t}
                          </span>
                        ))}
                        {s.tags.length > 4 && (
                          <span className="text-[10px] text-ink/45">+{s.tags.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-[11px] text-ink/55">{s.source || "—"}</td>
                    <td className="p-3 text-right text-xs tabular-nums text-ink/70">
                      {s.totalSent}
                    </td>
                    <td className="p-3 text-center">
                      {s.unsubscribedAt ? (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent-deep">
                          Baja
                        </span>
                      ) : (
                        <span className="rounded-full bg-social/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-social">
                          Activo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {total > perPage && (
          <div className="mt-4 flex items-center justify-between text-xs">
            <p className="text-ink/60">
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-full border border-line bg-bone px-3 py-1.5 disabled:opacity-30"
              >
                ← Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * perPage >= total}
                className="rounded-full border border-line bg-bone px-3 py-1.5 disabled:opacity-30"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {importerOpen && (
        <ImporterModal
          onClose={() => setImporterOpen(false)}
          onDone={() => {
            setImporterOpen(false);
            load();
          }}
        />
      )}
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-bone p-4">
      <p className="text-[11px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-1 font-display text-3xl font-semibold tabular-nums ${accent ? "text-accent" : "text-ink"}`}
      >
        {value.toLocaleString("es-ES")}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal Importer — flujo 2 pasos: upload → preview → confirm
// ────────────────────────────────────────────────────────────────────────────

function ImporterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [tag, setTag] = useState(`lista-${todayTag()}`);
  const [respectUnsubscribed, setRespectUnsubscribed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; batch_id: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doPreview(f: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/admin/newsletter/import/preview", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      setPreview(d);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/newsletter/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          temp_token: preview.temp_token,
          tag,
          respect_unsubscribed: respectUnsubscribed,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `Error ${r.status}`);
        return;
      }
      setResult({ inserted: d.inserted, updated: d.updated, skipped: d.skipped, batch_id: d.batch_id });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(false);
    }
  }

  function handleFile(f: File) {
    const ok = /\.(xlsx|xls|csv|tsv|txt)$/i.test(f.name);
    if (!ok) {
      setError("Formato no soportado. Usa .xlsx, .xls, .csv o .tsv");
      return;
    }
    setFile(f);
    doPreview(f);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-3xl border border-line bg-bone shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            {step === "upload" && "Importar subscribers desde Excel/CSV"}
            {step === "preview" && "Revisa y confirma"}
            {step === "done" && "✓ Importación completada"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink/50 hover:bg-bone-soft hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          {error && (
            <p className="rounded-xl bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>
          )}

          {step === "upload" && (
            <>
              <p className="text-sm text-ink/70">
                Sube un Excel (<code className="rounded bg-bone-soft px-1.5 py-0.5 text-[12px]">.xlsx</code>) o CSV con tus contactos.
                La primera fila debe ser cabecera. Detectamos automáticamente columnas tipo{" "}
                <strong>email</strong>, <strong>nombre</strong>, <strong>empresa</strong>, <strong>teléfono</strong> (también admitimos
                sinónimos en español: <em>correo</em>, <em>compañía</em>, <em>organización</em>, etc).
              </p>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-bone-soft px-6 py-12 transition hover:border-accent hover:bg-accent/5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <span className="text-4xl">📊</span>
                <span className="font-display text-base font-medium text-ink">
                  {busy ? "Procesando…" : "Arrastra el archivo o pulsa para seleccionar"}
                </span>
                <span className="text-xs text-ink/55">
                  .xlsx · .xls · .csv · .tsv · máx 10 MB
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
              <div className="rounded-xl bg-bone-soft p-3 text-xs text-ink/65">
                <strong>RGPD:</strong> al importar declaras que los contactos consintieron recibir
                comunicaciones tuyas. Cada email recibirá un link de baja al ser enviado y respetamos
                opt-outs previos.
              </div>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <PreviewStat label="Filas totales" value={preview.totalRows} />
                <PreviewStat label="Emails válidos" value={preview.stats.valid} ok />
                <PreviewStat label="A crear" value={preview.stats.new} ok />
                <PreviewStat label="Ya existían (actualizar tags)" value={preview.stats.already_exists} />
                <PreviewStat label="Duplicados en archivo" value={preview.stats.duplicated_in_file} muted />
                <PreviewStat label="Sin email válido" value={preview.stats.invalid} muted />
              </div>

              {preview.stats.unsubscribed_existing > 0 && (
                <div className="rounded-xl bg-accent/5 p-3 text-sm text-accent-deep">
                  ⚠ {preview.stats.unsubscribed_existing} de estos emails están dados de baja
                  previamente. {respectUnsubscribed
                    ? "Por defecto NO se reactivarán (respetamos RGPD)."
                    : "Se REACTIVARÁN — solo úsalo si tienes un nuevo opt-in."}
                </div>
              )}

              <div className="rounded-2xl border border-line bg-bone-soft p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
                  Mapeo detectado
                </p>
                <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <MapRow label="Email" value={preview.mapping.email} required />
                  <MapRow label="Nombre" value={preview.mapping.name} />
                  <MapRow label="Empresa" value={preview.mapping.company} />
                  <MapRow label="Teléfono" value={preview.mapping.phone} />
                </dl>
                {preview.mapping.extras.length > 0 && (
                  <p className="mt-2 text-[11px] text-ink/55">
                    Columnas extras (guardadas en metadata):{" "}
                    <span className="font-mono">{preview.mapping.extras.join(", ")}</span>
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-line bg-bone-soft p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink/60">
                  Primeras filas
                </p>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-line bg-bone">
                  <table className="w-full text-[11px]">
                    <thead className="bg-bone-soft sticky top-0">
                      <tr className="text-left text-ink/55">
                        <th className="px-2 py-1">#</th>
                        <th className="px-2 py-1">Email</th>
                        <th className="px-2 py-1">Nombre</th>
                        <th className="px-2 py-1">Empresa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.slice(0, 8).map((r) => (
                        <tr key={r.rowNumber} className="border-t border-line">
                          <td className="px-2 py-1 text-ink/40">{r.rowNumber}</td>
                          <td className="px-2 py-1 font-mono text-ink">{r.email || <span className="text-accent">⚠ {r.rawError}</span>}</td>
                          <td className="px-2 py-1">{r.name || "—"}</td>
                          <td className="px-2 py-1">{r.company || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink/60">
                  Tag para esta lista*
                </label>
                <input
                  type="text"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.replace(/\s+/g, "-"))}
                  className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  pattern="[a-zA-Z0-9_\-:.]+"
                />
                <p className="mt-1 text-[11px] text-ink/50">
                  Etiqueta para identificar esta lista en filtros y broadcasts. Sin espacios.
                </p>
              </div>

              <label className="inline-flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={respectUnsubscribed}
                  onChange={(e) => setRespectUnsubscribed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line accent-accent"
                />
                <span>
                  <strong>Respetar opt-outs previos</strong> (RECOMENDADO)
                  <span className="block text-[11px] text-ink/55">
                    Si está marcado, los emails que ya pidieron baja antes NO se reactivan.
                  </span>
                </span>
              </label>
            </>
          )}

          {step === "done" && result && (
            <div className="space-y-3 text-center">
              <p className="text-5xl">✓</p>
              <p className="font-display text-xl font-semibold text-social">
                {result.inserted} nuevos · {result.updated} actualizados
              </p>
              {result.skipped > 0 && (
                <p className="text-sm text-ink/55">{result.skipped} omitidos (sin email, duplicados, opt-out)</p>
              )}
              <p className="text-xs text-ink/45">Batch ID: <span className="font-mono">{result.batch_id}</span></p>
              <p className="mt-4 text-sm text-ink/70">
                Ahora puedes enviarles un broadcast desde{" "}
                <Link href="/admin/marketing/broadcasts" className="text-accent underline">Broadcasts</Link>{" "}
                seleccionando el tag <code className="rounded bg-bone-soft px-1.5 py-0.5 font-mono">{tag}</code>.
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-bone-soft px-6 py-4">
          <button type="button" onClick={onClose} className="text-xs text-ink/60 hover:text-ink">
            {step === "done" ? "Cerrar" : "Cancelar"}
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={doImport}
              disabled={busy || !tag.trim()}
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
            >
              {busy ? "Importando…" : `Importar ${preview?.stats.new || 0} nuevos + actualizar ${preview?.stats.already_exists || 0}`}
            </button>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark"
            >
              Ver lista
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  ok = false,
  muted = false,
}: {
  label: string;
  value: number;
  ok?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-bone p-3">
      <p className="text-[10px] uppercase tracking-wider text-ink/55">{label}</p>
      <p
        className={`mt-0.5 font-display text-2xl font-semibold tabular-nums ${
          muted ? "text-ink/50" : ok ? "text-social" : "text-ink"
        }`}
      >
        {value.toLocaleString("es-ES")}
      </p>
    </div>
  );
}

function MapRow({
  label,
  value,
  required = false,
}: {
  label: string;
  value: string | null;
  required?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/55">
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </dt>
      <dd className={`text-right font-mono ${value ? "text-ink" : "text-accent-deep"}`}>
        {value || "no detectada"}
      </dd>
    </div>
  );
}

function todayTag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
