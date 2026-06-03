/**
 * Modo "live orders" de MidOcean — controla si POST /orders va de verdad
 * al proveedor o se queda en simulación local.
 *
 * Origen del flag (en orden de precedencia):
 *   1. AdminSetting `midocean_live_orders` (true|false) — toggle desde
 *      /admin/suppliers/midocean sin redeploy
 *   2. env MIDOCEAN_LIVE_ORDERS=true — fallback legacy
 *   3. false (default seguro: simulación)
 *
 * Cache 60s para evitar query a BD en cada place-order.
 */
import { prisma } from "@/lib/prisma";

let cache: { at: number; value: boolean } | null = null;
const TTL_MS = 60_000;

export async function getMidoceanLiveOrders(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let value = false;
  try {
    const row = await prisma.adminSetting.findUnique({
      where: { key: "midocean_live_orders" },
      select: { value: true },
    });
    if (row && (row.value === true || row.value === false)) {
      value = row.value as boolean;
    } else {
      // Fallback al env legacy
      value = process.env.MIDOCEAN_LIVE_ORDERS === "true";
    }
  } catch {
    // BD no disponible → env fallback
    value = process.env.MIDOCEAN_LIVE_ORDERS === "true";
  }

  cache = { at: Date.now(), value };
  return value;
}

export async function setMidoceanLiveOrders(live: boolean): Promise<void> {
  await prisma.adminSetting.upsert({
    where: { key: "midocean_live_orders" },
    create: { key: "midocean_live_orders", value: live },
    update: { value: live },
  });
  cache = null; // invalidar para que el siguiente request use el valor nuevo
}

/** Para diagnóstico: reportar tanto el valor activo como su origen. */
export async function describeMidoceanLiveOrders() {
  const fromBdRaw = await prisma.adminSetting
    .findUnique({
      where: { key: "midocean_live_orders" },
      select: { value: true },
    })
    .catch(() => null);
  const fromBd =
    fromBdRaw && (fromBdRaw.value === true || fromBdRaw.value === false)
      ? (fromBdRaw.value as boolean)
      : null;
  const fromEnv = process.env.MIDOCEAN_LIVE_ORDERS === "true";
  const active = fromBd !== null ? fromBd : fromEnv;
  return {
    active,
    source: fromBd !== null ? "AdminSetting" : "env",
    fromBd,
    fromEnv,
  };
}
