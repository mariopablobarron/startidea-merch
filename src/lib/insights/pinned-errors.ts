/**
 * "Pinned errors" — bugs que el admin convierte en sugerencias visibles
 * desde /admin/insights.
 *
 * Persistencia: AdminSetting key `pinned_errors` con shape JSON:
 *   [{ errorId, signature, context, message, pinnedAt, note }]
 *
 * Auto-unpin: al marcar el ErrorEvent como resolved o borrarlo,
 * el pin asociado se limpia automáticamente (ver capture-error.ts).
 */
import { prisma } from "@/lib/prisma";

export type PinnedError = {
  errorId: string;
  signature: string;
  context: string | null;
  message: string;
  pinnedAt: string; // ISO
  note?: string;
};

const KEY = "pinned_errors";

export async function getPinnedErrors(): Promise<PinnedError[]> {
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: KEY },
      select: { value: true },
    });
    if (!row) return [];
    if (!Array.isArray(row.value)) return [];
    return row.value as unknown as PinnedError[];
  } catch {
    return [];
  }
}

export async function pinError(input: Omit<PinnedError, "pinnedAt">): Promise<PinnedError[]> {
  const list = await getPinnedErrors();
  // Si ya está pinneado por errorId, actualiza el note y pinnedAt
  const idx = list.findIndex((p) => p.errorId === input.errorId);
  const entry: PinnedError = { ...input, pinnedAt: new Date().toISOString() };
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.unshift(entry);
  }
  // Cap defensivo: 50 pins máximo
  const capped = list.slice(0, 50);
  await prisma.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: capped as unknown as object },
    update: { value: capped as unknown as object },
  });
  return capped;
}

export async function unpinError(errorId: string): Promise<PinnedError[]> {
  const list = await getPinnedErrors();
  const next = list.filter((p) => p.errorId !== errorId);
  if (next.length === list.length) return list;
  await prisma.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as object },
    update: { value: next as unknown as object },
  });
  return next;
}

export async function isPinned(errorId: string): Promise<boolean> {
  const list = await getPinnedErrors();
  return list.some((p) => p.errorId === errorId);
}

/** Quita pins cuyos errorId ya no existen O están resolved. */
export async function cleanupResolvedPins(): Promise<{
  removed: number;
  remaining: number;
}> {
  const list = await getPinnedErrors();
  if (list.length === 0) return { removed: 0, remaining: 0 };
  const ids = list.map((p) => p.errorId);
  const existing = await prisma.errorEvent.findMany({
    where: { id: { in: ids } },
    select: { id: true, resolved: true },
  });
  const validIds = new Set(
    existing.filter((e) => !e.resolved).map((e) => e.id),
  );
  const next = list.filter((p) => validIds.has(p.errorId));
  if (next.length === list.length) return { removed: 0, remaining: list.length };
  await prisma.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as object },
    update: { value: next as unknown as object },
  });
  return { removed: list.length - next.length, remaining: next.length };
}
