/**
 * /admin/propuestas — Listado de propuestas enviadas desde el recomendador.
 *
 * Distinto de /admin/proposals (que es para CartQuote). Aquí va el
 * nuevo modelo `Proposal` generado cuando un visitante introduce su
 * email en el recomendador para recibir la propuesta en PDF.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { AdminChrome } from "@/components/AdminChrome";
import { signProposalToken } from "@/lib/proposal-token";
import type { ProposalQuoteItem } from "@/lib/proposal-types";
import { predictProposalsBatch } from "@/lib/insights/proposal-prediction";
import { SendProposalDraftButton } from "@/components/SendProposalDraftButton";
import { ResendProposalButton } from "@/components/ResendProposalButton";

export const metadata: Metadata = {
  title: "Propuestas (recomendador)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador (agente)",
  sent: "Enviada",
  opened: "Abierta",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  sent: "bg-accent/15 text-accent",
  opened: "bg-social/15 text-social",
  accepted: "bg-social text-bone",
  rejected: "bg-accent-wash text-accent-deep",
};

const ALL_STATUS = ["sent", "opened", "accepted", "rejected"];

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function PropuestasListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { status } = await searchParams;
  const filter =
    status && ALL_STATUS.includes(status) ? { status } : undefined;

  const [proposals, totalCount, sentCount, openedCount, acceptedCount] =
    await Promise.all([
      prisma.proposal.findMany({
        where: filter,
        orderBy: { sentAt: "desc" },
        take: 100,
        select: {
          id: true,
          proposalNumber: true,
          email: true,
          name: true,
          company: true,
          subtotalCents: true,
          ivaCents: true,
          totalCents: true,
          status: true,
          sentAt: true,
          openedAt: true,
          acceptedAt: true,
          quoteItems: true,
          cartQuoteId: true,
        },
      }),
      prisma.proposal.count(),
      prisma.proposal.count({ where: { status: "sent" } }),
      prisma.proposal.count({ where: { status: "opened" } }),
      prisma.proposal.count({ where: { status: "accepted" } }),
    ]);

  const probabilities = await predictProposalsBatch(proposals.map((p) => p.id));

  return (
    <AdminChrome>
      <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
            <Link href="/admin" className="hover:text-accent">
              Panel
            </Link>
            <span>/</span>
            <span>Propuestas (recomendador)</span>
          </nav>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Propuestas del recomendador
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            PDFs generados desde el recomendador cuando el visitante deja su
            email. {totalCount} en total · {sentCount} enviadas · {openedCount}{" "}
            abiertas · {acceptedCount} aceptadas.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/propuestas"
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
            !status ? "bg-ink text-bone" : "bg-bone-soft text-ink hover:bg-bone"
          }`}
        >
          Todas
        </Link>
        {ALL_STATUS.map((s) => (
          <Link
            key={s}
            href={`/admin/propuestas?status=${s}`}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
              status === s
                ? STATUS_COLOR[s]
                : "bg-bone-soft text-ink hover:bg-bone"
            }`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

      {proposals.length === 0 ? (
        <p className="rounded-3xl border border-line bg-bone-soft p-10 text-center text-sm text-ink/60">
          Sin propuestas aún. Cuando alguien introduzca su email en el
          recomendador y solicite el PDF, aparecerá aquí.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-line bg-bone-soft">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-bone text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-ink/70">Nº</th>
                <th className="px-4 py-3 font-medium text-ink/70">Cliente</th>
                <th className="px-4 py-3 font-medium text-ink/70">Items</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">
                  Total (sin IVA)
                </th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">
                  Total (con IVA)
                </th>
                <th className="px-4 py-3 font-medium text-ink/70">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-ink/70">% cierre</th>
                <th className="px-4 py-3 font-medium text-ink/70">Enviada</th>
                <th className="px-4 py-3 font-medium text-ink/70">Abierta</th>
                <th className="px-4 py-3 font-medium text-ink/70">PDF</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => {
                const itemsArr = (p.quoteItems as unknown as ProposalQuoteItem[]) ?? [];
                const itemsLabel = `${itemsArr.length}`;
                const token = signProposalToken(p.id);
                const pdfUrl = `/api/proposal/${encodeURIComponent(p.proposalNumber)}/pdf?token=${encodeURIComponent(token)}`;
                return (
                  <tr key={p.id} className="border-b border-line/60 hover:bg-bone">
                    <td className="px-4 py-3 font-mono text-xs text-accent-deep">
                      {p.proposalNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{p.email}</div>
                      {(p.name || p.company) && (
                        <div className="text-[11px] text-ink/60">
                          {[p.name, p.company].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{itemsLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink/70">
                      {EUR.format(p.subtotalCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                      {EUR.format(p.totalCents / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${
                          STATUS_COLOR[p.status] ?? "bg-bone-soft text-ink"
                        }`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(() => {
                        const prob = probabilities[p.id];
                        if (prob === undefined) return <span className="text-ink/40">—</span>;
                        const color =
                          prob >= 70 ? "bg-emerald-100 text-emerald-700"
                          : prob >= 40 ? "bg-amber-100 text-amber-700"
                          : "bg-accent-wash text-accent-deep";
                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-mono font-semibold ${color}`}
                            title="Probabilidad estimada de cierre (heurística)"
                          >
                            {prob}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink/60">
                      {fmtDate(p.sentAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink/60">
                      {fmtDate(p.openedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Ver PDF →
                        </a>
                        {p.cartQuoteId && (
                          <a
                            href={`/admin/cart-quotes/${p.cartQuoteId}`}
                            className="text-xs font-medium text-ink/55 hover:text-accent hover:underline"
                            title="Carrito/presupuesto de origen"
                          >
                            ↗ carrito
                          </a>
                        )}
                        {p.status === "draft" ? (
                          <SendProposalDraftButton
                            proposalId={p.id}
                            proposalNumber={p.proposalNumber}
                            email={p.email}
                          />
                        ) : (
                          <ResendProposalButton
                            proposalId={p.id}
                            proposalNumber={p.proposalNumber}
                            email={p.email}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </AdminChrome>
  );
}
