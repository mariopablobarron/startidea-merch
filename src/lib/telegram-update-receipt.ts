import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

type TelegramReceipt = { actorId: string; chatId: string; messageId: number };
const prefix = "telegram_update:";

/** Clave única: deduplica entregas entre procesos y reinicios.
 * Guarda identidad y resultado, nunca texto del mensaje ni datos de clientes.
 */
export async function claimTelegramUpdate(updateId: number, actor: TelegramReceipt): Promise<string | null> {
  const key = `${prefix}${updateId}`;
  const token = randomUUID();
  const value = { ...actor, status: "processing", token };
  try {
    await prisma.adminSetting.create({
      data: { key, value },
    });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    const existing = await prisma.adminSetting.findUnique({ where: { key }, select: { value: true, updatedAt: true } });
    const previous = existing?.value;
    if (!existing || !previous || typeof previous !== "object" || Array.isArray(previous) ||
      previous.status !== "processing" || existing.updatedAt.getTime() > Date.now() - 10 * 60_000) return null;
    // Un reenvío puede retomar una consulta interrumpida. CAS y token impiden
    // que dos reintentos ganen o que el proceso anterior cierre el recibo nuevo.
    const claimed = await prisma.adminSetting.updateMany({
      where: { key, updatedAt: existing.updatedAt, value: { equals: previous } },
      data: { value },
    });
    if (claimed.count !== 1) return null;
  }
  // Retención superior a la ventana de entrega. Un fallo de limpieza no deshace el claim.
  await prisma.adminSetting.deleteMany({
    where: { key: { startsWith: prefix }, createdAt: { lt: new Date(Date.now() - 48 * 3600_000) } },
  }).catch(() => console.warn("[telegram-webhook] receipt cleanup failed"));
  return token;
}

export async function finishTelegramUpdate(
  updateId: number,
  actor: TelegramReceipt,
  status: "answered" | "failed" | "undelivered",
  token: string,
): Promise<void> {
  await prisma.adminSetting.updateMany({
    where: { key: `${prefix}${updateId}`, value: { path: ["token"], equals: token } },
    data: { value: { ...actor, status, token, finishedAt: new Date().toISOString() } },
  });
}
