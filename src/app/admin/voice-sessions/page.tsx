/**
 * /admin/voice-sessions — Conversaciones de Diego (asistente IA de la web).
 *
 * Para qué: repasar conversaciones REALES (transcripción completa persistida
 * en VoiceSession.transcript desde 2026-07-13) y decidir mejoras con datos:
 * qué piden los clientes, dónde se atasca Diego, qué tools usa, cuánto cuesta.
 *
 * Server component puro: transcripciones desplegables con <details> (sin JS).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Diego · Conversaciones",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type TranscriptMsg = { role?: string; text?: string };
type ToolCall = { tool?: string };

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDur(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

function pagePath(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).pathname;
  } catch {
    return url.slice(0, 40);
  }
}

export default async function VoiceSessionsPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const since30d = new Date(Date.now() - 30 * 86400_000);
  const [sessions, stats30d, withCart30d] = await Promise.all([
    prisma.voiceSession.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        startedAt: true,
        durationSec: true,
        estimatedCostCents: true,
        sourceUrl: true,
        toolsCalled: true,
        transcript: true,
        productSlugsDiscussed: true,
        resultingCartId: true,
      },
    }),
    prisma.voiceSession.aggregate({
      where: { startedAt: { gte: since30d } },
      _count: true,
      _avg: { durationSec: true },
      _sum: { estimatedCostCents: true },
    }),
    prisma.voiceSession.count({
      where: { startedAt: { gte: since30d }, resultingCartId: { not: null } },
    }),
  ]);

  const conConversacion = sessions.filter(
    (s) => Array.isArray(s.transcript) && (s.transcript as TranscriptMsg[]).length > 0,
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
        <Link href="/admin" className="hover:text-accent">Panel</Link>
        <span>/</span>
        <span>Diego · Conversaciones</span>
      </nav>
      <h1 className="font-display text-2xl font-bold text-ink">
        Conversaciones de Diego 🎙️
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        Transcripciones reales del asistente IA de la web. Léelas para decidir la siguiente
        mejora: qué piden, dónde se atasca, qué convierte.
      </p>

      {/* Métricas 30 días */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-ink/50">Sesiones 30d</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{stats30d._count}</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-ink/50">Duración media</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">
            {fmtDur(Math.round(stats30d._avg.durationSec ?? 0))}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-ink/50">Coste estimado 30d</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">
            {((stats30d._sum.estimatedCostCents ?? 0) / 100).toLocaleString("es-ES", {
              style: "currency",
              currency: "EUR",
            })}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-ink/50">Con carrito 30d</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{withCart30d}</p>
        </div>
      </div>

      {/* Lista de sesiones */}
      <div className="mt-8 space-y-3">
        <p className="text-xs text-ink/50">
          Últimas {sessions.length} sesiones · {conConversacion} con transcripción
          (guardadas desde el 13-jul-2026)
        </p>
        {sessions.length === 0 && (
          <div className="rounded-xl border border-dashed border-line bg-bone-soft/50 p-8 text-center text-sm text-ink/55">
            Aún no hay sesiones. En cuanto alguien hable con Diego aparecerán aquí.
          </div>
        )}
        {sessions.map((s) => {
          const transcript = Array.isArray(s.transcript)
            ? (s.transcript as TranscriptMsg[])
            : [];
          const tools = Array.isArray(s.toolsCalled)
            ? [...new Set((s.toolsCalled as ToolCall[]).map((t) => t.tool).filter(Boolean))]
            : [];
          return (
            <details
              key={s.id}
              className="group rounded-xl border border-line bg-white open:border-accent/40"
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm marker:content-none">
                <span className="font-medium text-ink">{fmtDate(s.startedAt)}</span>
                <span className="text-ink/55">{pagePath(s.sourceUrl)}</span>
                <span className="text-ink/55">{fmtDur(s.durationSec)}</span>
                {transcript.length > 0 ? (
                  <span className="rounded-full bg-social/10 px-2 py-0.5 text-[11px] font-medium text-social">
                    {transcript.length} mensajes
                  </span>
                ) : (
                  <span className="rounded-full bg-bone-soft px-2 py-0.5 text-[11px] text-ink/45">
                    sin conversación
                  </span>
                )}
                {s.resultingCartId && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-deep">
                    🛒 carrito
                  </span>
                )}
                {tools.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-bone-soft px-2 py-0.5 text-[11px] text-ink/60"
                  >
                    {t}
                  </span>
                ))}
                <span className="ml-auto text-[11px] text-ink/40">
                  {s.estimatedCostCents != null
                    ? `${(s.estimatedCostCents / 100).toFixed(2)} €`
                    : ""}
                </span>
              </summary>
              <div className="border-t border-line px-4 py-3">
                {s.productSlugsDiscussed.length > 0 && (
                  <p className="mb-2 text-xs text-ink/55">
                    Productos:{" "}
                    {s.productSlugsDiscussed.map((slug, i) => (
                      <span key={slug}>
                        {i > 0 && ", "}
                        <Link
                          href={`/catalogo/${slug}`}
                          target="_blank"
                          className="text-accent hover:underline"
                        >
                          {slug}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                {transcript.length === 0 ? (
                  <p className="text-xs text-ink/45">
                    Sin mensajes (abrió el widget y no llegó a conversar, o es anterior al
                    13-jul-2026).
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {transcript.map((m, i) => (
                      <p
                        key={i}
                        className={`rounded-lg px-3 py-1.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "ml-8 bg-accent/10 text-ink/85"
                            : "bg-bone-soft text-ink/80"
                        }`}
                      >
                        <span className="mr-1.5">{m.role === "user" ? "👤" : "💬"}</span>
                        {m.text}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
