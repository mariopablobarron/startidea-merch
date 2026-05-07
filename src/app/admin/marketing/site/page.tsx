"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CtaLink = { label: string; href: string };
type Settings = {
  "hero.badge": string;
  "hero.h1Prefix": string;
  "hero.h1Accent": string;
  "hero.subhead": string;
  "hero.ctaPrimary": CtaLink;
  "hero.ctaSecondary": CtaLink;
};

export default function MarketingSitePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [overridden, setOverridden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/marketing/site", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setDefaults(data.defaults);
        setOverridden(data.overridden || []);
      } else {
        setFeedback({ ok: false, msg: data.error || "Error" });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/marketing/site", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: data.error || "Error guardando" });
      } else {
        setFeedback({
          ok: true,
          msg: `Guardado · ${data.updated.length} campos. Cambios live al recargar la home.`,
        });
        await load();
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setSaving(false);
    }
  }

  async function resetField(key: keyof Settings) {
    if (!confirm(`Restaurar "${key}" al valor por defecto?`)) return;
    await fetch(`/api/admin/marketing/site?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
  }

  if (loading || !settings || !defaults) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Marketing · CMS
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Copy del Hero</h1>
          <p className="mt-2 text-sm text-ink/60">
            Edita los textos de la home sin tocar código. Los cambios son inmediatos al
            recargar la página pública.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link href="/admin" className="text-ink/60 hover:text-accent">
              ← Panel
            </Link>
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              Ver home en otra pestaña ↗
            </a>
          </div>
        </header>

        <section className="space-y-6 rounded-3xl border border-line bg-bone p-6 lg:p-8">
          <Field
            label="Badge superior"
            help="Pill con punto verde sobre el H1. Comunica diferenciador secundario."
            isOverridden={overridden.includes("hero.badge")}
            onReset={() => resetField("hero.badge")}
            defaultValue={defaults["hero.badge"]}
          >
            <input
              type="text"
              value={settings["hero.badge"]}
              onChange={(e) => update("hero.badge", e.target.value)}
              maxLength={120}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field
            label="H1 — texto en negro"
            help="Primera parte del titular. Lo más importante de la home."
            isOverridden={overridden.includes("hero.h1Prefix")}
            onReset={() => resetField("hero.h1Prefix")}
            defaultValue={defaults["hero.h1Prefix"]}
          >
            <input
              type="text"
              value={settings["hero.h1Prefix"]}
              onChange={(e) => update("hero.h1Prefix", e.target.value)}
              maxLength={160}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field
            label="H1 — texto en color coral"
            help={`Parte resaltada del H1. Variables disponibles: {price} (precio mínimo real, ej "0.30").`}
            isOverridden={overridden.includes("hero.h1Accent")}
            onReset={() => resetField("hero.h1Accent")}
            defaultValue={defaults["hero.h1Accent"]}
          >
            <input
              type="text"
              value={settings["hero.h1Accent"]}
              onChange={(e) => update("hero.h1Accent", e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <Field
            label="Subhead"
            help={`Párrafo bajo el H1. Variables disponibles: {count} (nº productos activos).`}
            isOverridden={overridden.includes("hero.subhead")}
            onReset={() => resetField("hero.subhead")}
            defaultValue={defaults["hero.subhead"]}
          >
            <textarea
              value={settings["hero.subhead"]}
              onChange={(e) => update("hero.subhead", e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </Field>

          <CtaField
            label="CTA primario (botón coral)"
            value={settings["hero.ctaPrimary"]}
            onChange={(v) => update("hero.ctaPrimary", v)}
            isOverridden={overridden.includes("hero.ctaPrimary")}
            onReset={() => resetField("hero.ctaPrimary")}
            defaultValue={defaults["hero.ctaPrimary"]}
          />

          <CtaField
            label="CTA secundario (botón discreto)"
            value={settings["hero.ctaSecondary"]}
            onChange={(v) => update("hero.ctaSecondary", v)}
            isOverridden={overridden.includes("hero.ctaSecondary")}
            onReset={() => resetField("hero.ctaSecondary")}
            defaultValue={defaults["hero.ctaSecondary"]}
          />
        </section>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
          >
            Descartar
          </button>
        </div>

        {feedback && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-xs ${
              feedback.ok ? "bg-social/10 text-social" : "bg-accent-wash text-accent-deep"
            }`}
          >
            {feedback.ok ? "✓" : "⚠"} {feedback.msg}
          </p>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  help,
  isOverridden,
  onReset,
  defaultValue,
  children,
}: {
  label: string;
  help?: string;
  isOverridden: boolean;
  onReset: () => void;
  defaultValue: unknown;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-ink/60">
          {label}
          {isOverridden && (
            <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-deep">
              EDITADO
            </span>
          )}
        </label>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-ink/50 underline-offset-4 hover:text-accent hover:underline"
            title={`Restaurar a: ${typeof defaultValue === "object" ? JSON.stringify(defaultValue) : defaultValue}`}
          >
            Restaurar
          </button>
        )}
      </div>
      {children}
      {help && <p className="mt-1 text-[11px] text-ink/50">{help}</p>}
    </div>
  );
}

function CtaField({
  label,
  value,
  onChange,
  isOverridden,
  onReset,
  defaultValue,
}: {
  label: string;
  value: CtaLink;
  onChange: (v: CtaLink) => void;
  isOverridden: boolean;
  onReset: () => void;
  defaultValue: CtaLink;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-ink/60">
          {label}
          {isOverridden && (
            <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-deep">
              EDITADO
            </span>
          )}
        </label>
        {isOverridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-ink/50 underline-offset-4 hover:text-accent hover:underline"
            title={`Restaurar a: ${defaultValue.label} → ${defaultValue.href}`}
          >
            Restaurar
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1.4fr,1fr]">
        <input
          type="text"
          placeholder="Texto del botón"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
          maxLength={80}
          className="rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="URL (/catalogo, #cotizar, https://…)"
          value={value.href}
          onChange={(e) => onChange({ ...value, href: e.target.value })}
          maxLength={200}
          className="rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
