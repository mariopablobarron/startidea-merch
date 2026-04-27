import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AdminChrome } from "@/components/AdminChrome";
import type { QuoteStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Cotizaciones",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  NEW: "Nueva",
  IN_PROGRESS: "En curso",
  SENT: "Enviada",
  WON: "Ganada",
  LOST: "Perdida",
  ARCHIVED: "Archivada",
};

const STATUS_COLOR: Record<QuoteStatus, string> = {
  NEW: "bg-accent/15 text-accent",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SENT: "bg-purple-100 text-purple-700",
  WON: "bg-social/15 text-social",
  LOST: "bg-red-100 text-red-700",
  ARCHIVED: "bg-ink/5 text-ink/50",
};

const ALL_STATUS: QuoteStatus[] = ["NEW", "IN_PROGRESS", "SENT", "WON", "LOST", "ARCHIVED"];

export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { status } = await searchParams;
  const filter = status && ALL_STATUS.includes(status as QuoteStatus)
    ? { status: status as QuoteStatus }
    : undefined;

  const [items, counts] = await Promise.all([
    prisma.quoteRequest.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { _count: { select: { notes: true } } },
    }),
    prisma.quoteRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const summary = Object.fromEntries(ALL_STATUS.map((s) => [s, 0])) as Record<QuoteStatus, number>;
  for (const c of counts) summary[c.status] = c._count._all;
  const total = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <AdminChrome>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Cotizaciones</h1>
            <p className="mt-2 text-sm text-ink/60">
              {total} solicitudes en total
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <FilterChip href="/admin/quotes" active={!filter} label="Todas" count={total} />
          {ALL_STATUS.map((s) => (
            <FilterChip
              key={s}
              href={`/admin/quotes?status=${s}`}
              active={filter?.status === s}
              label={STATUS_LABEL[s]}
              count={summary[s]}
            />
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-ink/10 bg-bone-soft">
          {items.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink/60">
              No hay cotizaciones {filter ? "con este estado" : "todavía"}.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 bg-bone text-left text-xs uppercase tracking-wider text-ink/50">
                <tr>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium">Producto</th>
                  <th className="px-5 py-3 font-medium">Cant.</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-ink/5 last:border-0 hover:bg-bone"
                  >
                    <td className="px-5 py-4 text-ink/70">
                      <Link href={`/admin/quotes/${q.id}`} className="block">
                        {new Date(q.createdAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/quotes/${q.id}`} className="block">
                        <div className="font-medium text-ink">{q.name}</div>
                        {q.company && <div className="text-xs text-ink/50">{q.company}</div>}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-ink/70">
                      <Link href={`/admin/quotes/${q.id}`} className="block">
                        {q.productHint || <span className="text-ink/30">—</span>}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-ink/70">
                      {q.quantity ?? <span className="text-ink/30">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLOR[q.status]}`}
                      >
                        {STATUS_LABEL[q.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-ink/50">{q._count.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminChrome>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition ${
        active
          ? "bg-ink text-bone"
          : "border border-ink/15 bg-bone-soft text-ink/70 hover:border-ink/40"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs ${
          active ? "bg-bone/20 text-bone" : "bg-ink/5 text-ink/60"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
