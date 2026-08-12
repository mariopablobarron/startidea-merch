/**
 * Resolver de credenciales de proveedor — Fase C del módulo Proveedores
 * (docs/spec-proveedores-admin.md). Lee de SupplierCredential (cifrado en
 * BD) si existe; si no, cae a process.env — así activar esto no rompe nada
 * mientras nadie rellene el formulario del admin.
 *
 * Caché en memoria 60s: cada llamada a la API del proveedor (Cifra, Makito…)
 * pasa por aquí, y no queremos un roundtrip a Postgres + descifrado por cada
 * fetch. 60s es sobradamente rápido para "rotaste una key, prueba ahora".
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";
import type { SupplierCode } from "@prisma/client";

type CacheEntry = { config: Record<string, string> | null; expiresAt: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<SupplierCode, CacheEntry>();

/**
 * Devuelve el config guardado en BD para el proveedor, o null si no hay fila
 * o el descifrado falla (ENCRYPTION_KEY rotada/perdida — degrada a env, NUNCA
 * tira el sync entero por un secret ilegible).
 */
export async function getStoredSupplierConfig(code: SupplierCode): Promise<Record<string, string> | null> {
  const cached = cache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  let config: Record<string, string> | null = null;
  try {
    const row = await prisma.supplierCredential.findUnique({ where: { code } });
    if (row) {
      const parsed = JSON.parse(decryptSecret(row.encryptedConfig));
      if (parsed && typeof parsed === "object") config = parsed as Record<string, string>;
    }
  } catch (err) {
    console.error(`[supplier-credentials] descifrado falló para ${code}, cae a .env:`, err);
  }
  cache.set(code, { config, expiresAt: Date.now() + CACHE_TTL_MS });
  return config;
}

/** Un campo concreto: BD si existe y no está vacío, si no el valor de fallback (normalmente process.env.X). */
export async function resolveCredentialField(
  code: SupplierCode,
  key: string,
  envFallback: string,
): Promise<string> {
  const stored = await getStoredSupplierConfig(code);
  const v = stored?.[key];
  return v && v.trim() ? v : envFallback;
}

export async function setSupplierConfig(
  code: SupplierCode,
  config: Record<string, string>,
  updatedBy: string,
): Promise<void> {
  const encryptedConfig = encryptSecret(JSON.stringify(config));
  await prisma.supplierCredential.upsert({
    where: { code },
    create: { code, encryptedConfig, configKeys: Object.keys(config), updatedBy },
    update: { encryptedConfig, configKeys: Object.keys(config), updatedBy },
  });
  cache.delete(code);
}

export async function recordCredentialTest(code: SupplierCode, ok: boolean, error: string | null): Promise<void> {
  await prisma.supplierCredential
    .update({ where: { code }, data: { lastTestAt: new Date(), lastTestOk: ok, lastTestError: error } })
    .catch(() => {}); // sin fila (todo en .env todavía) → no crítico
}
