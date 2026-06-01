/**
 * Capturador de errores interno — alternativa simple a Sentry.
 *
 * Persiste cada error en ErrorEvent + opcionalmente dispara push admin
 * para severity=error (rate-limited a 1 push/hour para no saturar).
 *
 * Uso:
 *   import { captureError } from "@/lib/insights/capture-error";
 *
 *   try { ... } catch (e) {
 *     captureError(e, { context: "proposal.send", notifyAdmin: true });
 *   }
 */
import { prisma } from "@/lib/prisma";
import { notifyAdmins } from "@/lib/notify-admin";

export type CaptureOpts = {
  context?: string;
  severity?: "error" | "warning" | "info";
  url?: string;
  userAgent?: string;
  notifyAdmin?: boolean;
};

let lastPushNotifyAt = 0;
const PUSH_COOLDOWN_MS = 3600_000;

export function captureError(err: unknown, opts: CaptureOpts = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const severity = opts.severity ?? "error";
  const context = opts.context ?? "unknown";

  // Persist fire-and-forget
  void prisma.errorEvent
    .create({
      data: {
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 5000),
        context,
        severity,
        url: opts.url,
        userAgent: opts.userAgent?.slice(0, 500),
      },
    })
    .catch((e) => {
      // Si BD falla, log a stderr para no perder el error completamente
      console.error("[captureError] persist failed:", e, "Original:", message);
    });

  // Push admin si es error grave y no hemos saturado en últimas 1h
  if (severity === "error" && opts.notifyAdmin) {
    const now = Date.now();
    if (now - lastPushNotifyAt > PUSH_COOLDOWN_MS) {
      lastPushNotifyAt = now;
      void notifyAdmins({
        title: `🐛 Error en ${context}`,
        body: message.slice(0, 200),
        url: "/admin/insights/errors",
        tag: `error-${context}`,
      }).catch(() => {});
    }
  }
}

export type ErrorSummary = {
  total: number;
  unresolved: number;
  last24h: number;
  topErrors: Array<{ message: string; count: number; lastSeen: Date }>;
};

export async function getErrorSummary(): Promise<ErrorSummary> {
  const since24h = new Date(Date.now() - 24 * 3600_000);
  const [total, unresolved, last24h, grouped] = await Promise.all([
    prisma.errorEvent.count(),
    prisma.errorEvent.count({ where: { resolved: false } }),
    prisma.errorEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.$queryRaw<Array<{ message: string; count: bigint; lastseen: Date }>>`
      SELECT message, COUNT(*) AS count, MAX("createdAt") AS lastseen
      FROM "ErrorEvent"
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        AND resolved = false
      GROUP BY message
      ORDER BY count DESC
      LIMIT 5
    `,
  ]);
  return {
    total,
    unresolved,
    last24h,
    topErrors: grouped.map((g) => ({
      message: g.message,
      count: Number(g.count),
      lastSeen: g.lastseen,
    })),
  };
}
