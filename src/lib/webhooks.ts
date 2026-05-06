import { createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Webhooks salientes hacia clientes API.
 *
 * Eventos soportados:
 *   - quote.status.changed   {cartId, fromStatus, toStatus, at}
 *   - payment.completed      {cartId, paymentId, amountCents, currency, at}
 *   - proof.status.changed   {cartId, proofId, fromStatus, toStatus, at}
 *
 * Cada delivery se firma con HMAC-SHA256 usando el `secret` del endpoint.
 * El receptor valida con header `X-Merch-Signature`.
 *
 * Reintentos: hasta 3 con back-off exponencial (5min, 30min, 4h).
 * Tras 3 fallos pasa a ABANDONED.
 */

export type WebhookEvent =
  | "quote.status.changed"
  | "payment.completed"
  | "proof.status.changed"
  | "test.ping";

export type WebhookPayload = Record<string, unknown>;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

const RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 4 * 60 * 60 * 1000];

/**
 * Encola un evento — busca endpoints activos suscritos a este event y crea
 * un WebhookDelivery PENDING por cada uno. Inmediatamente intenta enviarlos
 * fire-and-forget; los fallos quedan listos para el cron de reintentos.
 */
export async function emitWebhook(event: WebhookEvent, payload: WebhookPayload): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { active: true, events: { has: event } },
  });
  if (endpoints.length === 0) return;

  const deliveries = await Promise.all(
    endpoints.map((ep) =>
      prisma.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          event,
          payload: payload as Prisma.InputJsonValue,
          status: "PENDING",
        },
      }),
    ),
  );

  // Intento inmediato
  await Promise.all(
    deliveries.map((d, i) => attemptDelivery(d.id, endpoints[i].url, endpoints[i].secret)),
  );
}

export async function attemptDelivery(deliveryId: string, url: string, secret: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status === "DELIVERED" || delivery.status === "ABANDONED") return;

  const body = JSON.stringify({
    event: delivery.event,
    payload: delivery.payload,
    deliveryId: delivery.id,
    timestamp: new Date().toISOString(),
  });

  const signature = signPayload(secret, body);
  const startedAt = new Date();
  let status: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merch-Event": delivery.event,
        "X-Merch-Signature": signature,
        "X-Merch-Delivery": delivery.id,
        "User-Agent": "TodoMerchandising-Webhooks/1.0",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    if (!res.ok) error = (await res.text().catch(() => "")).slice(0, 500);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const attempts = delivery.attempts + 1;
  const ok = status != null && status >= 200 && status < 300;

  if (ok) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "DELIVERED",
        attempts,
        lastResponseStatus: status,
        deliveredAt: startedAt,
        nextRetryAt: null,
      },
    });
    await prisma.webhookEndpoint
      .update({ where: { id: delivery.endpointId }, data: { lastDeliveredAt: startedAt } })
      .catch(() => {});
    return;
  }

  // Failed
  if (attempts >= RETRY_DELAYS_MS.length + 1) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "ABANDONED",
        attempts,
        lastResponseStatus: status,
        lastError: error,
      },
    });
    return;
  }

  const nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]);
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "FAILED",
      attempts,
      lastResponseStatus: status,
      lastError: error,
      nextRetryAt,
    },
  });
  await prisma.webhookEndpoint
    .update({ where: { id: delivery.endpointId }, data: { lastFailedAt: startedAt } })
    .catch(() => {});
}

/**
 * Reintenta deliveries FAILED cuyo nextRetryAt ya pasó. Llamado por cron.
 */
export async function retryPendingDeliveries(): Promise<{ retried: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: "FAILED",
      nextRetryAt: { lte: new Date() },
    },
    include: { endpoint: true },
    take: 50,
  });
  await Promise.all(due.map((d) => attemptDelivery(d.id, d.endpoint.url, d.endpoint.secret)));
  return { retried: due.length };
}
