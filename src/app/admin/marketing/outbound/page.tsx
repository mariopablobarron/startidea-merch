"use client";

import { useEffect, useState } from "react";
import { OutboundEmailButton } from "@/components/OutboundEmailButton";
import { LinkedInMessageButton } from "@/components/LinkedInMessageButton";

type Status =
  | "NEW" | "INVITED" | "CONNECTED" | "MESSAGED" | "REPLIED"
  | "MEETING_BOOKED" | "PROPOSAL_SENT" | "WON" | "LOST" | "NURTURING";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  segment: string | null;
  source: string | null;
  status: Status;
  lastContactAt: string | null;
  nextActionAt: string | null;
  notes: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<Status, string> = {
  NEW: "Nuevo",
  INVITED: "Invitado",
  CONNECTED: "Conectado",
  MESSAGED: "Mensaje enviado",
  REPLIED: "Respondió",
  MEETING_BOOKED: "Reunión agendada",
  PROPOSAL_SENT: "Propuesta enviada",
  WON: "Cerrado ✓",
  LOST: "Descartado",
  NURTURING: "Nurturing",
};

const STATUS_COLOR: Record<Status, string> = {
  NEW: "bg-bone-soft text-ink/70",
  INVITED: "bg-accent-mist text-accent-deep",
  CONNECTED: "bg-blue-100 text-blue-700",
  MESSAGED: "bg-purple-100 text-purple-700",
  REPLIED: "bg-amber-100 text-amber-800",
  MEETING_BOOKED: "bg-accent/20 text-accent-deep",
  PROPOSAL_SENT: "bg-accent text-white",
  WON: "bg-social/15 text-social",
  LOST: "bg-line/30 text-ink/50",
  NURTURING: "bg-bone-soft text-ink/60",
};

const STATUSES: Status[] = [
  "NEW", "INVITED", "CONNECTED", "MESSAGED", "REPLIED",
  "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "NURTURING",
];

const SEGMENTS = ["tech", "events", "rsc", "rrhh", "consultora", "freelance", "agencia", "ong"];

export default function OutboundCRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "">("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const url = filter ? `/api/admin/outbound?status=${filter}` : "/api/admin/outbound";
      const r = await fetch(url, { credentials: "include" });
      const d = await r.json();
      if (r.ok) {
        setLeads(d.leads || []);
        setSummary(d.summary || {});
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function updateLead(id: string, patch: Partial<Lead> & { nextActionInDays?: number }) {
    const r = await fetch(`/api/admin/outbound/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) load();
  }

  async function deleteLead(id: string) {
    if (!confirm("¿Borrar este lead? No es recuperable.")) return;
    await fetch(`/api/admin/outbound/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  const now = Date.now();
  const overdueCount = leads.filter(
    (l) => l.nextActionAt && new Date(l.nextActionAt).getTime() < now,
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">— Marketing</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">CRM outbound</h1>
          <p className="mt-1 text-sm text-ink/65">
            Pipeline manual de leads (LinkedIn, email, eventos). {leads.length} leads totales ·{" "}
            {overdueCount > 0 && <span className="text-accent font-medium">{overdueCount} con acción pendiente</span>}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          {showAdd ? "Cancelar" : "+ Añadir lead"}
        </button>
      </div>

      {showAdd && <AddLeadForm onDone={() => { setShowAdd(false); load(); }} />}

      {/* Filtro chips */}
      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip active={filter === ""} onClick={() => setFilter("")}>
          Todos ({leads.length})
        </FilterChip>
        {STATUSES.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {STATUS_LABEL[s]} ({summary[s] || 0})
          </FilterChip>
        ))}
      </div>

      {/* Lista */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-ink/50">Cargando…</p>
        ) : leads.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink/50">
            Sin leads {filter ? `en estado ${STATUS_LABEL[filter as Status]}` : ""}. Añade el primero.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {leads.map((l) => {
              const overdue = l.nextActionAt && new Date(l.nextActionAt).getTime() < now;
              const isEditing = editingId === l.id;
              return (
                <li key={l.id} className={`p-4 ${overdue ? "bg-accent/5" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[l.status]}`}>
                          {STATUS_LABEL[l.status]}
                        </span>
                        {l.segment && (
                          <span className="rounded-full bg-bone-soft px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/55">
                            {l.segment}
                          </span>
                        )}
                        {overdue && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">
                            acción pendiente
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-display text-base font-semibold text-ink">
                        {l.name}{l.company ? ` · ${l.company}` : ""}
                      </p>
                      {l.role && <p className="text-[13px] text-ink/65">{l.role}</p>}
                      <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-ink/60">
                        {l.email && <span><a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a></span>}
                        {l.linkedinUrl && (
                          <span>
                            <a href={l.linkedinUrl} target="_blank" rel="noopener" className="hover:underline">
                              LinkedIn ↗
                            </a>
                          </span>
                        )}
                        {l.phone && <span>{l.phone}</span>}
                      </div>
                      {l.nextActionAt && (
                        <p className={`mt-1 text-[12px] ${overdue ? "text-accent font-medium" : "text-ink/60"}`}>
                          Siguiente acción: {new Date(l.nextActionAt).toLocaleDateString("es-ES", { dateStyle: "medium" })}
                        </p>
                      )}
                      {l.notes && !isEditing && (
                        <p className="mt-2 text-[12px] text-ink/65 whitespace-pre-wrap line-clamp-3">{l.notes}</p>
                      )}
                      <div className="flex flex-wrap items-start gap-2">
                        <OutboundEmailButton leadId={l.id} hasEmail={!!l.email} />
                        <LinkedInMessageButton leadId={l.id} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingId(isEditing ? null : l.id)} className="rounded-full bg-bone-soft px-3 py-1.5 text-xs hover:bg-line/30">
                        {isEditing ? "Cerrar" : "Editar"}
                      </button>
                      <button onClick={() => deleteLead(l.id)} className="rounded-full bg-line/20 px-2.5 py-1.5 text-xs text-ink/50 hover:bg-line/40">
                        ✕
                      </button>
                    </div>
                  </div>

                  {isEditing && <EditLeadInline lead={l} onSave={(patch) => updateLead(l.id, patch)} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-ink text-white" : "bg-bone-soft text-ink hover:bg-line/30"
      }`}
    >
      {children}
    </button>
  );
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState({
    name: "", company: "", role: "", email: "", linkedinUrl: "",
    phone: "", segment: "", source: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/outbound", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `Error ${r.status}`);
        return;
      }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-line bg-white p-5 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input placeholder="Nombre*" value={data.name} onChange={(v) => setData({ ...data, name: v })} required />
        <Input placeholder="Empresa" value={data.company} onChange={(v) => setData({ ...data, company: v })} />
        <Input placeholder="Rol (Marketing Manager, RSC…)" value={data.role} onChange={(v) => setData({ ...data, role: v })} />
        <Input placeholder="Email" type="email" value={data.email} onChange={(v) => setData({ ...data, email: v })} />
        <Input placeholder="URL LinkedIn" value={data.linkedinUrl} onChange={(v) => setData({ ...data, linkedinUrl: v })} />
        <Input placeholder="Teléfono" value={data.phone} onChange={(v) => setData({ ...data, phone: v })} />
        <select
          value={data.segment}
          onChange={(e) => setData({ ...data, segment: e.target.value })}
          className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm"
        >
          <option value="">Segmento (opcional)</option>
          {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Input placeholder="Origen (sales-navigator, evento-xxx…)" value={data.source} onChange={(v) => setData({ ...data, source: v })} />
      </div>
      <textarea
        rows={2}
        placeholder="Notas iniciales"
        value={data.notes}
        onChange={(e) => setData({ ...data, notes: e.target.value })}
        className="w-full rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm"
      />
      {error && <p className="text-xs text-accent-deep">⚠ {error}</p>}
      <button type="submit" disabled={busy || !data.name} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
        {busy ? "Guardando…" : "Añadir lead"}
      </button>
    </form>
  );
}

function EditLeadInline({
  lead,
  onSave,
}: {
  lead: Lead;
  onSave: (patch: Partial<Lead> & { nextActionInDays?: number }) => void;
}) {
  const [status, setStatus] = useState<Status>(lead.status);
  const [notes, setNotes] = useState(lead.notes || "");
  const [nextDays, setNextDays] = useState<number>(0);

  return (
    <div className="mt-3 rounded-xl bg-bone-soft p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-ink/55">Estado</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-ink/55">Siguiente acción en…</span>
          <select
            value={nextDays}
            onChange={(e) => setNextDays(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value={0}>(no cambiar)</option>
            <option value={1}>1 día</option>
            <option value={3}>3 días</option>
            <option value={7}>1 semana</option>
            <option value={14}>2 semanas</option>
            <option value={30}>1 mes</option>
            <option value={90}>3 meses</option>
          </select>
        </label>
      </div>
      <textarea
        rows={3}
        placeholder="Notas, último mensaje, contexto…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
      />
      <button
        onClick={() => onSave({ status, notes, ...(nextDays > 0 ? { nextActionInDays: nextDays } : {}) })}
        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white"
      >
        Guardar
      </button>
    </div>
  );
}

function Input({
  placeholder,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-line bg-bone-soft px-3 py-2.5 text-sm outline-none focus:border-accent"
    />
  );
}
