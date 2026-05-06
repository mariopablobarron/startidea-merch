"use client";

import { useState } from "react";

export function NewsletterForm({ source = "home-footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("Email inválido");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Error");
      else setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-social">
        ✓ Te tenemos en la lista. Tu primer email llega el primer lunes del mes.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@empresa.com"
        required
        className="flex-1 rounded-full bg-bone/10 px-4 py-2.5 text-sm text-bone placeholder:text-bone/40 outline-none focus:bg-bone/20"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent-dark disabled:opacity-40"
      >
        {busy ? "…" : "Suscribirme"}
      </button>
      {error && <p className="text-xs text-accent-light">⚠ {error}</p>}
    </form>
  );
}
