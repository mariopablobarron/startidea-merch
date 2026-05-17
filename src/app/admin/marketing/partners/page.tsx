"use client";

import { useEffect, useState } from "react";

type Application = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  audience: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  approvedPartner: {
    id: string;
    slug: string;
    commissionPct: number;
    totalEarnedCents: number;
  } | null;
};

const STATUS_COLOR: Record<Application["status"], string> = {
  PENDING: "bg-accent text-white",
  APPROVED: "bg-social/15 text-social",
  REJECTED: "bg-line/30 text-ink/55",
};

const STATUS_LABEL: Record<Application["status"], string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

export default function AdminPartnersPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/partners/applications", { credentials: "include" });
      const d = await r.json();
      if (r.ok) setApps(d.applications || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: string) {
    if (!confirm("¿Aprobar partner con comisión 10%?")) return;
    setBusy(id);
    try {
      await fetch(`/api/admin/partners/applications/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/partners/applications/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectReason || null }),
      });
      setRejectingId(null);
      setRejectReason("");
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Marketing</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Programa de partners</h1>
      <p className="mt-2 text-sm text-ink/65">
        Solicitudes recibidas en <code>/partners/programa</code>. Al aprobar, se
        crea el AffiliatePartner, se genera un slug opaco y se manda email al
        aplicante con su link único y URL del dashboard.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando…</p>
        ) : apps.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink/50">Sin solicitudes todavía.</p>
        ) : (
          <ul className="divide-y divide-line">
            {apps.map((a) => (
              <li key={a.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      <p className="text-xs text-ink/50">
                        {new Date(a.createdAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <p className="mt-1 font-display text-base font-semibold text-ink">
                      {a.name}{a.company ? ` · ${a.company}` : ""}
                    </p>
                    <p className="text-sm text-ink/65">
                      <a href={`mailto:${a.email}`} className="underline-offset-2 hover:underline">{a.email}</a>
                    </p>
                    {a.role && <p className="text-[13px] text-ink/65 mt-1">Rol: {a.role}</p>}
                    {a.audience && <p className="text-[13px] text-ink/65">Audiencia: {a.audience}</p>}
                    {a.message && (
                      <div className="mt-2 rounded-xl bg-bone-soft p-3 text-[13px] text-ink/75 whitespace-pre-wrap">
                        {a.message}
                      </div>
                    )}
                    {a.approvedPartner && (
                      <div className="mt-2 rounded-xl bg-social/10 p-3 text-[12px] text-social">
                        Partner activo · slug <code>{a.approvedPartner.slug}</code> ·{" "}
                        comisión {a.approvedPartner.commissionPct}% ·{" "}
                        ganado total {(a.approvedPartner.totalEarnedCents / 100).toFixed(2)} €
                      </div>
                    )}
                    {a.rejectionReason && (
                      <div className="mt-2 rounded-xl bg-line/30 p-3 text-[12px] text-ink/55">
                        Motivo rechazo: {a.rejectionReason}
                      </div>
                    )}
                  </div>
                  {a.status === "PENDING" && (
                    <div className="flex flex-col items-end gap-2">
                      <button
                        disabled={busy === a.id}
                        onClick={() => approve(a.id)}
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
                      >
                        Aprobar →
                      </button>
                      <button
                        disabled={busy === a.id}
                        onClick={() => setRejectingId(rejectingId === a.id ? null : a.id)}
                        className="rounded-full bg-line/30 px-4 py-2 text-xs text-ink/60 hover:bg-line/50"
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>

                {rejectingId === a.id && (
                  <div className="mt-4 rounded-xl border border-line bg-bone-soft p-4">
                    <p className="text-xs font-medium text-ink/60 mb-2">Motivo (opcional, se incluye en email)</p>
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => reject(a.id)}
                      disabled={busy === a.id}
                      className="mt-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
                    >
                      Confirmar rechazo
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
