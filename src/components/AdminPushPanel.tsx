"use client";

import { useEffect, useState } from "react";

type SubInfo = { id: string; label: string | null; createdAt: string; lastUsedAt: string | null };

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "needs-permission"; vapidPublicKey: string }
  | { kind: "denied" }
  | { kind: "subscribed"; vapidPublicKey: string; subs: SubInfo[] }
  | { kind: "not-configured" };

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

export function AdminPushPanel({ secret }: { secret: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState({ kind: "unsupported", reason: "Tu navegador no soporta notificaciones push." });
      return;
    }
    if (Notification.permission === "denied") {
      setState({ kind: "denied" });
      return;
    }
    const res = await fetch("/api/admin/push/subscribe", { headers: { "X-Admin-Secret": secret } });
    const data = await res.json();
    if (!res.ok) {
      setState({ kind: "not-configured" });
      return;
    }
    if (!data.vapidPublicKey) {
      setState({ kind: "not-configured" });
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      setState({ kind: "subscribed", vapidPublicKey: data.vapidPublicKey, subs: data.subscriptions || [] });
    } else {
      setState({ kind: "needs-permission", vapidPublicKey: data.vapidPublicKey });
    }
  }

  useEffect(() => {
    if (!secret) return;
    refresh();
  }, [secret]);

  async function activate() {
    if (state.kind !== "needs-permission") return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState({ kind: "denied" });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          label: navigator.userAgent.slice(0, 80),
        }),
      });
      setMsg("Notificaciones activadas en este dispositivo.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error activando push");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/push/test", {
        method: "POST",
        headers: { "X-Admin-Secret": secret },
      });
      const data = await res.json();
      setMsg(data.ok ? `Push test enviada (${data.sent} dispositivos).` : `Error: ${data.error}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/admin/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
          headers: { "X-Admin-Secret": secret },
        });
        await sub.unsubscribe();
      }
      await refresh();
      setMsg("Notificaciones desactivadas en este dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return <p className="text-xs text-ink/50">Comprobando notificaciones…</p>;
  }
  if (state.kind === "unsupported") {
    return <p className="text-xs text-ink/60">⚠ {state.reason}</p>;
  }
  if (state.kind === "not-configured") {
    return (
      <div className="rounded-2xl border border-line bg-bone p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Notificaciones push</p>
        <p className="mt-2 text-sm text-ink/70">
          ⚠ VAPID no configurado en el servidor. Para activar push, genera VAPID keys con{" "}
          <code className="rounded bg-bone-soft px-1.5">pnpm dlx web-push generate-vapid-keys</code>{" "}
          y añade <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> y{" "}
          <code>VAPID_SUBJECT</code> al .env del proyecto.
        </p>
      </div>
    );
  }
  if (state.kind === "denied") {
    return (
      <div className="rounded-2xl border border-line bg-bone p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Notificaciones push</p>
        <p className="mt-2 text-sm text-ink/70">
          🔕 Has bloqueado las notificaciones para este sitio. Reactívalas desde el icono de
          permisos en la barra del navegador y recarga la página.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-bone p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Notificaciones push</p>
        {state.kind === "subscribed" && (
          <span className="rounded-full bg-social/10 px-2.5 py-0.5 text-[11px] font-medium text-social">
            ✓ Activadas
          </span>
        )}
      </div>
      {state.kind === "needs-permission" && (
        <>
          <p className="mt-2 text-sm text-ink/70">
            Recibe notificación instantánea cuando llega una cotización nueva — incluso con la web
            cerrada (móvil + desktop).
          </p>
          <button
            type="button"
            onClick={activate}
            disabled={busy}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-xs font-medium text-bone hover:bg-accent disabled:opacity-40"
          >
            {busy ? "Activando…" : "Activar notificaciones en este dispositivo"}
          </button>
        </>
      )}
      {state.kind === "subscribed" && (
        <>
          <p className="mt-2 text-sm text-ink/70">
            {state.subs.length} dispositivo{state.subs.length === 1 ? "" : "s"} recibiendo
            notificaciones del equipo.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={busy}
              className="rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs hover:border-accent disabled:opacity-40"
            >
              Enviar push de prueba
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="rounded-full border border-line bg-bone-soft px-4 py-1.5 text-xs text-ink/60 hover:border-accent disabled:opacity-40"
            >
              Desactivar en este dispositivo
            </button>
          </div>
        </>
      )}
      {msg && <p className="mt-3 rounded-lg bg-bone-soft p-2.5 text-xs text-ink/70">{msg}</p>}
    </div>
  );
}
