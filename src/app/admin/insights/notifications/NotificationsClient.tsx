"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  type NotificationRule,
} from "@/lib/notification-rules";

export function NotificationsClient({
  initial,
  initialSlackUrl,
}: {
  initial: Record<NotificationEvent, NotificationRule>;
  initialSlackUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [slackUrl, setSlackUrl] = useState(initialSlackUrl);
  const [busy, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(event: NotificationEvent) {
    setState((s) => ({
      ...s,
      [event]: { ...s[event], enabled: !s[event].enabled },
    }));
    setSaved(false);
  }

  function setThreshold(event: NotificationEvent, value: number) {
    setState((s) => ({
      ...s,
      [event]: { ...s[event], threshold: value },
    }));
    setSaved(false);
  }

  async function save() {
    setError(null);
    const rulesBody: Record<string, { enabled?: boolean; threshold?: number }> = {};
    for (const ev of Object.keys(state) as NotificationEvent[]) {
      rulesBody[ev] = {
        enabled: state[ev].enabled,
        threshold: state[ev].threshold,
      };
    }
    const res = await fetch("/api/admin/notification-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: rulesBody, slackWebhookUrl: slackUrl.trim() || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || "No se pudo guardar");
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-8 space-y-4">
      {NOTIFICATION_EVENTS.map(({ event, label, help }) => {
        const rule = state[event];
        return (
          <div
            key={event}
            className="flex flex-col gap-3 rounded-3xl border border-line bg-bone p-5 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex-1">
              <p className="font-display text-base font-semibold text-ink">{label}</p>
              <p className="mt-1 text-sm text-ink/65">{help}</p>
              {typeof rule.threshold === "number" && (
                <label className="mt-3 inline-flex items-center gap-2 text-xs text-ink/70">
                  <span>Umbral:</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={rule.threshold}
                    onChange={(e) => setThreshold(event, parseInt(e.target.value) || 1)}
                    className="w-20 rounded border border-line bg-bone-soft px-2 py-1 font-mono text-xs"
                  />
                </label>
              )}
            </div>
            <button
              onClick={() => toggle(event)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                rule.enabled
                  ? "bg-social text-bone"
                  : "bg-bone-soft text-ink/60 hover:bg-bone"
              }`}
            >
              {rule.enabled ? "✓ Activo" : "Inactivo"}
            </button>
          </div>
        );
      })}

      <div className="rounded-3xl border border-line bg-bone p-5">
        <p className="font-display text-base font-semibold text-ink">
          Webhook Slack / Discord
        </p>
        <p className="mt-1 text-sm text-ink/65">
          Recibe las mismas notificaciones en un canal de equipo. Pega la URL
          del Incoming Webhook (Slack) o Webhook URL (Discord). Vacío =
          desactivado.
        </p>
        <input
          type="url"
          placeholder="https://hooks.slack.com/services/T0.../B0.../..."
          value={slackUrl}
          onChange={(e) => {
            setSlackUrl(e.target.value);
            setSaved(false);
          }}
          className="mt-3 w-full rounded-full border border-line bg-bone-soft px-4 py-2 text-sm font-mono focus:border-accent focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-ink/50">
          Slack: <code>https://hooks.slack.com/services/...</code> ·
          Discord: <code>https://discord.com/api/webhooks/...</code>
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-accent-wash p-3 text-sm text-accent-deep">{error}</p>
      )}
      {saved && (
        <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
          ✓ Guardado · se aplicará a las próximas notificaciones
        </p>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-bone transition hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}
