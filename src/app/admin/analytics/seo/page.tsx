"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Panel SEO embebido con Looker Studio.
 *
 * Estado A (sin URL): muestra wizard guiando a Mario a crear el report
 * en lookerstudio.google.com usando plantilla oficial GSC, copiar la URL
 * de embed y pegarla en el form.
 *
 * Estado B (con URL): iframe a pantalla completa con métricas en vivo
 * (clicks, impresiones, queries top, países, etc.) que Looker Studio
 * pinta directamente desde Search Console + GA4.
 */
export default function AdminSeoStatsPage() {
  const [url, setUrl] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics/seo", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setUrl(data.url || "");
        setInput(data.url || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics/seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error guardando");
        return;
      }
      setUrl(input.trim());
      setShowEdit(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Analytics
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink lg:text-3xl">
              Search Console
            </h1>
            <p className="mt-1 text-xs text-ink/50">
              Métricas SEO en vivo: clicks, impresiones, queries, posición media.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link href="/admin/analytics" className="text-ink/60 hover:text-accent">
              ← Analytics
            </Link>
            <a
              href="https://search.google.com/search-console?resource_id=sc-domain:merchandising.startidea.es"
              target="_blank"
              rel="noopener"
              className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
            >
              Abrir GSC ↗
            </a>
            {url && (
              <button
                type="button"
                onClick={() => setShowEdit((v) => !v)}
                className="rounded-full border border-line bg-bone px-3 py-1.5 hover:border-accent"
              >
                {showEdit ? "Cancelar" : "Editar URL"}
              </button>
            )}
          </div>
        </header>

        {(!url || showEdit) && <ConfigForm
          input={input}
          onChange={setInput}
          onSave={save}
          saving={saving}
          error={error}
          isFirstSetup={!url}
        />}

        {url && !showEdit && (
          <div className="overflow-hidden rounded-2xl border border-line bg-bone shadow-sm">
            <iframe
              src={url}
              className="block h-[1600px] w-full"
              title="Search Console dashboard"
              allowFullScreen
            />
          </div>
        )}
      </div>
    </main>
  );
}

function ConfigForm({
  input,
  onChange,
  onSave,
  saving,
  error,
  isFirstSetup,
}: {
  input: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  isFirstSetup: boolean;
}) {
  return (
    <section className="space-y-6 rounded-2xl border border-line bg-bone p-6 lg:p-8">
      {isFirstSetup && (
        <>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Configuración inicial
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold text-ink">
              Conecta tu dashboard SEO en 3 minutos
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink/70">
              Usaremos <strong>Looker Studio</strong> (herramienta gratis de Google) para
              embebir un dashboard con datos en vivo de Search Console + GA4. No requiere
              OAuth ni mantenimiento: Looker Studio se conecta directamente a tu cuenta
              Google.
            </p>
          </div>

          <ol className="space-y-4 text-sm text-ink/80">
            <Step n={1}>
              Abre la{" "}
              <a
                href="https://lookerstudio.google.com/c/u/0/reporting/create?c.reportId=b17eebcc-fc7a-462b-89aa-f25f9f8d04f3&pageId=p_xklvy5dpfc&ds.searchConsole.connector=searchConsole&ds.ga4.connector=ga4&utm_source=marketing"
                target="_blank"
                rel="noopener"
                className="font-medium text-accent hover:underline"
              >
                plantilla oficial de Search Console
              </a>{" "}
              en Looker Studio. Google te pedirá que elijas tu propiedad de GSC
              (selecciona <code className="rounded bg-bone-soft px-1.5 py-0.5 font-mono text-xs">merchandising.startidea.es</code>, propiedad de dominio)
              y tu propiedad GA4 (<code className="rounded bg-bone-soft px-1.5 py-0.5 font-mono text-xs">Merchandising Startidea</code>).
            </Step>
            <Step n={2}>
              Pulsa <strong>&quot;Editar y compartir&quot;</strong> en la esquina superior
              derecha. El report se duplica en tu cuenta y queda guardado.
            </Step>
            <Step n={3}>
              Una vez tienes el report editable, pulsa{" "}
              <strong>Archivo → Insertar informe</strong> (o{" "}
              <strong>File → Embed report</strong>). Copia el <strong>código de URL</strong>{" "}
              que se ve dentro del <code className="rounded bg-bone-soft px-1.5 py-0.5 font-mono text-xs">src=&quot;...&quot;</code>{" "}
              del iframe. Debe empezar por{" "}
              <code className="rounded bg-bone-soft px-1.5 py-0.5 font-mono text-xs">
                https://lookerstudio.google.com/embed/reporting/
              </code>
              .
            </Step>
            <Step n={4}>Pega esa URL abajo y pulsa Guardar.</Step>
          </ol>

          <div className="rounded-xl border border-line bg-bone-soft p-4 text-xs text-ink/60">
            💡 <strong>Truco:</strong> también funciona pegar la URL pública del report
            (botón <em>Compartir</em> → <em>Cualquiera con el enlace</em> → copiar). Aunque
            la versión <em>embed</em> da mejor visualización dentro del admin sin la barra
            superior de Looker Studio.
          </div>
        </>
      )}

      <div className="space-y-2">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wider text-ink/60">
            URL del embed de Looker Studio
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://lookerstudio.google.com/embed/reporting/..."
            className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 font-mono text-xs outline-none focus:border-accent"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-accent-wash px-3 py-2 text-xs text-accent-deep">
            ⚠ {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bone shadow-sm transition hover:bg-accent-dark disabled:opacity-40"
          >
            {saving ? "Guardando…" : isFirstSetup ? "Conectar dashboard" : "Guardar cambios"}
          </button>
          {input && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-ink/50 hover:text-accent"
            >
              Vaciar
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-bone">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
