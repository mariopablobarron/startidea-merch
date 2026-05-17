"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  brief: string | null;
  productSlug: string;
  positionId: string | null;
  status: "NEW" | "IN_PROGRESS" | "DELIVERED" | "CANCELLED";
  createdAt: string;
  fulfilledAt: string | null;
  product: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<Item["status"], string> = {
  NEW: "Nueva",
  IN_PROGRESS: "En curso",
  DELIVERED: "Enviada",
  CANCELLED: "Cancelada",
};

const STATUS_COLOR: Record<Item["status"], string> = {
  NEW: "bg-accent text-white",
  IN_PROGRESS: "bg-accent-mist text-accent-deep",
  DELIVERED: "bg-line/40 text-ink/50",
  CANCELLED: "bg-line/20 text-ink/40",
};

export default function MockupRequestsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | Item["status"]>("");

  async function load() {
    setLoading(true);
    try {
      const url = filter ? `/api/admin/mockup-requests?status=${filter}` : "/api/admin/mockup-requests";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateStatus(id: string, status: Item["status"]) {
    await fetch(`/api/admin/mockup-requests/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
        — Mockups solicitados
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        Peticiones de mockup técnico (Capa D)
      </h1>
      <p className="mt-2 text-sm text-ink/65">
        Compromiso público: respuesta con mockup técnico real en menos de 4h
        laborables. Marca como <strong>Enviada</strong> cuando el equipo le mande
        el mockup definitivo por email.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["", "NEW", "IN_PROGRESS", "DELIVERED", "CANCELLED"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              filter === s ? "bg-ink text-white" : "bg-bone-soft text-ink hover:bg-line/30"
            }`}
          >
            {s ? STATUS_LABEL[s as Item["status"]] : "Todas"}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink/50">
            No hay peticiones {filter ? `con estado ${STATUS_LABEL[filter as Item["status"]]}` : ""}.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink/50">
                      {new Date(it.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    <p className="mt-1 font-display text-base font-semibold text-ink">
                      {it.name}{it.company ? ` · ${it.company}` : ""}
                    </p>
                    <p className="text-sm text-ink/65">
                      <a href={`mailto:${it.email}`} className="underline-offset-2 hover:underline">
                        {it.email}
                      </a>
                      {it.phone ? ` · ${it.phone}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">
                      Producto: <strong>{it.product?.name || it.productSlug}</strong>
                      {it.positionId ? ` · ${it.positionId}` : ""}
                    </p>
                    {it.brief && (
                      <div className="mt-2 rounded-xl bg-bone-soft p-3 text-[13px] text-ink/75 whitespace-pre-wrap">
                        {it.brief}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLOR[it.status]}`}>
                      {STATUS_LABEL[it.status]}
                    </span>
                    <div className="flex gap-1">
                      {it.status !== "IN_PROGRESS" && it.status !== "DELIVERED" && (
                        <button
                          onClick={() => updateStatus(it.id, "IN_PROGRESS")}
                          className="rounded-full bg-bone-soft px-3 py-1 text-xs hover:bg-line/30"
                        >
                          En curso
                        </button>
                      )}
                      {it.status !== "DELIVERED" && (
                        <button
                          onClick={() => updateStatus(it.id, "DELIVERED")}
                          className="rounded-full bg-social/15 px-3 py-1 text-xs text-social hover:bg-social/25"
                        >
                          Enviada
                        </button>
                      )}
                      {it.status !== "CANCELLED" && it.status !== "DELIVERED" && (
                        <button
                          onClick={() => updateStatus(it.id, "CANCELLED")}
                          className="rounded-full bg-line/20 px-3 py-1 text-xs text-ink/60 hover:bg-line/40"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
