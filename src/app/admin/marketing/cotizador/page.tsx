"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Settings = {
  heroTitle: string;
  heroSubtitle: string;
  heroBullets: string[];
  responseHours: number;
  requireCompany: boolean;
  requirePhone: boolean;
  requireDeadline: boolean;
  showBudgetField: boolean;
  deadlineOptions: string[];
  paymentMethods: string[];
  successTitle: string;
  successMessage: string;
  autoReplyEnabled: boolean;
  autoReplySubject: string;
  autoReplyHtml: string;
  internalNotifyEmails: string[];
  showOnHome: boolean;
};

const DEFAULT_AUTO_HTML = `<div style="font-family:-apple-system,sans-serif;max-width:560px;color:#231F27;">
  <h2 style="font-family:Georgia,serif;color:#231F27;">Hola {firstName},</h2>
  <p>Hemos recibido tu solicitud de cotización. Estamos revisándola y te enviaremos respuesta en menos de {hours} horas laborables.</p>
  <p>Mientras tanto puedes:</p>
  <ul>
    <li><a href="https://merchandising.startidea.es/recursos" style="color:#C41D51;">Descargar nuestras guías</a></li>
    <li><a href="https://merchandising.startidea.es/trabajos" style="color:#C41D51;">Ver trabajos realizados</a></li>
  </ul>
  <p>Si es urgente, contesta a este email o escríbenos por WhatsApp.</p>
  <p>Un saludo,<br>El equipo de TodoMerchandising</p>
  <hr style="border:none;border-top:1px solid #E7E2E6;margin:32px 0;">
  <p style="color:#888;font-size:11px;">STARTIDEA MALAGA SL · CIF B19583632 · Granada</p>
</div>`;

export default function CotizadorAdminPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/marketing/cotizador", { credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setDefaults(data.defaults);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/marketing/cotizador", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) setFeedback({ ok: false, msg: data.error || "Error" });
      else {
        setFeedback({ ok: true, msg: "Guardado. Cambios live al recargar /cotizar." });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  function resetField<K extends keyof Settings>(field: K) {
    if (!settings || !defaults) return;
    setSettings({ ...settings, [field]: defaults[field] });
  }

  function update<K extends keyof Settings>(field: K, value: Settings[K]) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  if (loading || !settings) {
    return (
      <main className="min-h-screen bg-bone-soft p-8">
        <p className="text-sm text-ink/60">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
            Marketing · Cotizador
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            Configuración del cotizador
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            Textos, campos requeridos, plazos y plantilla de auto-respuesta.
            Cambios live al recargar{" "}
            <a
              href="/#cotizar"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              /#cotizar
            </a>
            .
          </p>
        </header>

        <div className="space-y-5">
          <Section title="Hero / texto principal">
            <Field
              label="Título"
              onReset={() => resetField("heroTitle")}
              changed={settings.heroTitle !== defaults?.heroTitle}
            >
              <input
                type="text"
                value={settings.heroTitle}
                onChange={(e) => update("heroTitle", e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field
              label="Subtítulo"
              onReset={() => resetField("heroSubtitle")}
              changed={settings.heroSubtitle !== defaults?.heroSubtitle}
            >
              <input
                type="text"
                value={settings.heroSubtitle}
                onChange={(e) => update("heroSubtitle", e.target.value)}
                maxLength={300}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field
              label="Bullets (1 por línea)"
              onReset={() => resetField("heroBullets")}
              changed={JSON.stringify(settings.heroBullets) !== JSON.stringify(defaults?.heroBullets)}
            >
              <textarea
                value={settings.heroBullets.join("\n")}
                onChange={(e) =>
                  update("heroBullets", e.target.value.split("\n").filter(Boolean))
                }
                rows={4}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field label="Tiempo de respuesta (horas)">
              <input
                type="number"
                min={1}
                max={720}
                value={settings.responseHours}
                onChange={(e) => update("responseHours", parseInt(e.target.value, 10) || 24)}
                className="w-32 rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
          </Section>

          <Section title="Campos del formulario">
            <Toggle
              checked={settings.requireCompany}
              onChange={(v) => update("requireCompany", v)}
              label="Empresa obligatoria"
            />
            <Toggle
              checked={settings.requirePhone}
              onChange={(v) => update("requirePhone", v)}
              label="Teléfono obligatorio"
            />
            <Toggle
              checked={settings.requireDeadline}
              onChange={(v) => update("requireDeadline", v)}
              label="Plazo obligatorio"
            />
            <Toggle
              checked={settings.showBudgetField}
              onChange={(v) => update("showBudgetField", v)}
              label="Mostrar campo presupuesto orientativo"
            />
            <Field
              label="Opciones de plazo (1 por línea, dropdown)"
              onReset={() => resetField("deadlineOptions")}
              changed={
                JSON.stringify(settings.deadlineOptions) !==
                JSON.stringify(defaults?.deadlineOptions)
              }
            >
              <textarea
                value={settings.deadlineOptions.join("\n")}
                onChange={(e) =>
                  update("deadlineOptions", e.target.value.split("\n").filter(Boolean))
                }
                rows={5}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
          </Section>

          <Section title="Métodos de pago a mostrar">
            <Field
              label="Lista (1 por línea, visible en /cotizar y respuesta email)"
              onReset={() => resetField("paymentMethods")}
              changed={
                JSON.stringify(settings.paymentMethods) !==
                JSON.stringify(defaults?.paymentMethods)
              }
            >
              <textarea
                value={settings.paymentMethods.join("\n")}
                onChange={(e) =>
                  update("paymentMethods", e.target.value.split("\n").filter(Boolean))
                }
                rows={5}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-[11px] text-ink/50">
                Stripe Checkout + Apple/Google Pay ya están configurados.
                Bizum y transferencia se gestionan manual desde admin tras aceptación.
              </p>
            </Field>
          </Section>

          <Section title="Mensaje de éxito (post-envío)">
            <Field
              label="Título"
              onReset={() => resetField("successTitle")}
              changed={settings.successTitle !== defaults?.successTitle}
            >
              <input
                type="text"
                value={settings.successTitle}
                onChange={(e) => update("successTitle", e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
            <Field
              label="Mensaje"
              help="Soporta {hours} (tiempo de respuesta)"
              onReset={() => resetField("successMessage")}
              changed={settings.successMessage !== defaults?.successMessage}
            >
              <textarea
                value={settings.successMessage}
                onChange={(e) => update("successMessage", e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </Field>
          </Section>

          <Section title="Auto-respuesta por email">
            <Toggle
              checked={settings.autoReplyEnabled}
              onChange={(v) => update("autoReplyEnabled", v)}
              label="Enviar email de auto-respuesta al cliente"
            />
            {settings.autoReplyEnabled && (
              <>
                <Field label="Asunto">
                  <input
                    type="text"
                    value={settings.autoReplySubject}
                    onChange={(e) => update("autoReplySubject", e.target.value)}
                    maxLength={200}
                    className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </Field>
                <Field
                  label="HTML del email"
                  help="Soporta {firstName} y {hours}. Vacío = template estándar de Manual Startidea."
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => update("autoReplyHtml", DEFAULT_AUTO_HTML)}
                      className="rounded-full border border-line bg-bone px-3 py-1 text-[11px] hover:border-accent"
                    >
                      Usar template default
                    </button>
                  </div>
                  <textarea
                    value={settings.autoReplyHtml}
                    onChange={(e) => update("autoReplyHtml", e.target.value)}
                    rows={12}
                    maxLength={30000}
                    placeholder="Vacío = template Startidea default"
                    className="mt-2 w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                  />
                </Field>
              </>
            )}
          </Section>

          <Section title="Avisos internos">
            <Field
              label="Emails internos donde recibir el lead (1 por línea)"
              help="Si vacío, usa RESEND_TO_INTERNAL del .env"
            >
              <textarea
                value={settings.internalNotifyEmails.join("\n")}
                onChange={(e) =>
                  update(
                    "internalNotifyEmails",
                    e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  )
                }
                rows={3}
                placeholder="comercial@startidea.es&#10;mario@startidea.es"
                className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </Field>
          </Section>

          <Section title="Visibilidad">
            <Toggle
              checked={settings.showOnHome}
              onChange={(v) => update("showOnHome", v)}
              label="Mostrar bloque /cotizar en home pública"
            />
          </Section>

          <div className="sticky bottom-0 -mx-6 flex items-center gap-3 border-t border-line bg-bone-soft/95 px-6 py-3 backdrop-blur lg:-mx-8 lg:px-8">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-bone shadow hover:bg-accent-dark disabled:opacity-40"
            >
              {saving ? "Guardando…" : "Guardar configuración"}
            </button>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-line bg-bone px-4 py-2 text-xs hover:border-accent"
            >
              Descartar
            </button>
            {feedback && (
              <span
                className={`text-xs ${
                  feedback.ok ? "text-social" : "text-accent-deep"
                }`}
              >
                {feedback.ok ? "✓" : "⚠"} {feedback.msg}
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-line bg-bone p-5 lg:p-6">
      <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  help,
  onReset,
  changed,
  children,
}: {
  label: string;
  help?: string;
  onReset?: () => void;
  changed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium uppercase tracking-wider text-ink/60">
          {label}
          {changed && (
            <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold text-accent-deep">
              EDITADO
            </span>
          )}
        </label>
        {changed && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-ink/50 hover:text-accent hover:underline"
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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      <span className="text-ink/80">{label}</span>
    </label>
  );
}
