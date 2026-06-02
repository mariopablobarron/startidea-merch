"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IntegrationsClient({
  webhookUrl,
  secret,
  exampleCurl,
}: {
  webhookUrl: string;
  secret: string;
  exampleCurl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  async function rotate() {
    if (!confirm("¿Rotar el secret? El antiguo dejará de funcionar inmediatamente.")) return;
    setBusy(true);
    try {
      await fetch("/api/admin/integrations/rotate-secret", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-line bg-bone p-6">
      <div className="grid gap-5">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
            URL del webhook
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="flex-1 rounded-full border border-line bg-bone-soft px-4 py-2 font-mono text-xs"
            />
            <button
              onClick={() => copy(webhookUrl, "url")}
              className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone hover:bg-accent"
            >
              {copied === "url" ? "✓" : "Copiar"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
            Secret (header x-webhook-secret)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              type={revealed ? "text" : "password"}
              readOnly
              value={secret}
              className="flex-1 rounded-full border border-line bg-bone-soft px-4 py-2 font-mono text-xs"
            />
            <button
              onClick={() => setRevealed(!revealed)}
              className="rounded-full border border-line bg-bone-soft px-3 py-2 text-xs text-ink/70 hover:bg-bone"
            >
              {revealed ? "Ocultar" : "Mostrar"}
            </button>
            <button
              onClick={() => copy(secret, "secret")}
              className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bone hover:bg-accent"
            >
              {copied === "secret" ? "✓" : "Copiar"}
            </button>
            <button
              onClick={rotate}
              disabled={busy}
              className="rounded-full border border-accent-deep/40 bg-accent-wash px-3 py-2 text-xs font-medium text-accent-deep hover:bg-accent-wash/80 disabled:opacity-50"
            >
              {busy ? "Rotando…" : "🔄 Rotar"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium uppercase tracking-wider text-ink/60">
            Ejemplo curl
          </label>
          <pre className="mt-1 overflow-x-auto rounded-2xl bg-ink p-4 font-mono text-[11px] text-bone">
            {exampleCurl}
          </pre>
          <button
            onClick={() => copy(exampleCurl, "curl")}
            className="mt-2 rounded-full bg-bone-soft px-3 py-1 text-xs text-ink/70 hover:bg-bone"
          >
            {copied === "curl" ? "✓ Copiado" : "Copiar curl"}
          </button>
        </div>
      </div>
    </section>
  );
}
