"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CartQuoteListItem = {
  id: string;
  createdAt: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  status: string;
  estimatedTotalCents: number | null;
  itemsCount: number;
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function AdminCartQuotesPage() {
  const [items, setItems] = useState<CartQuoteListItem[]>([]);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("merch:admin");
      if (s) setSecret(s);
    } catch {}
  }, []);

  async function load(s: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cart-quotes", { headers: { "X-Admin-Secret": s } });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error");
        return;
      }
      setItems(data.items || []);
      sessionStorage.setItem("merch:admin", s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (secret) load(secret);
  }, [secret]);

  return (
    <main className="min-h-screen bg-bone-soft p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">Admin</p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Carritos de cotización
            </h1>
          </div>
          <input
            type="password"
            placeholder="X-Admin-Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-72 rounded-xl border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </header>

        {error && <p className="mb-4 rounded-lg bg-accent-wash p-3 text-sm text-accent-deep">⚠ {error}</p>}
        {loading && <p className="text-sm text-ink/60">Cargando…</p>}

        <div className="overflow-hidden rounded-3xl border border-line bg-bone">
          <table className="w-full text-sm">
            <thead className="bg-bone-soft">
              <tr>
                <Th>Fecha</Th>
                <Th>Cliente</Th>
                <Th className="text-center">Items</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-center">Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-ink/60">
                    No hay carritos todavía.
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-t border-line hover:bg-bone-soft">
                  <Td>
                    <span className="text-xs text-ink/60">
                      {new Date(it.createdAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </Td>
                  <Td>
                    <p className="font-medium text-ink">{it.name}</p>
                    {it.company && <p className="text-xs text-ink/60">{it.company}</p>}
                    <p className="text-xs text-ink/50">{it.email}</p>
                  </Td>
                  <Td className="text-center tabular-nums">{it.itemsCount}</Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {it.estimatedTotalCents != null ? EUR.format(it.estimatedTotalCents / 100) : "—"}
                  </Td>
                  <Td className="text-center">
                    <span className="rounded-full bg-bone-soft px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-ink/70">
                      {it.status}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/cart-quotes/${it.id}`}
                      className="text-xs font-medium text-accent hover:text-accent-dark"
                    >
                      Ver →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-ink/50 ${className || ""}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className || ""}`}>{children}</td>;
}
