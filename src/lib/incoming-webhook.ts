/**
 * Helper para el secret del webhook de integraciones.
 *
 * Guarda el secret en AdminSetting.incoming_webhook_secret. Lo auto-genera
 * en la primera lectura si no existe. Permite rotarlo desde el admin.
 */
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY = "incoming_webhook_secret";

export async function getOrCreateWebhookSecret(): Promise<string> {
  const row = await prisma.adminSetting.findUnique({
    where: { key: KEY },
    select: { value: true },
  });
  if (typeof row?.value === "string" && row.value.length > 20) {
    return row.value;
  }
  const newSecret = crypto.randomBytes(24).toString("base64url");
  await prisma.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: newSecret },
    update: { value: newSecret },
  });
  return newSecret;
}

export async function rotateWebhookSecret(): Promise<string> {
  const newSecret = crypto.randomBytes(24).toString("base64url");
  await prisma.adminSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: newSecret },
    update: { value: newSecret },
  });
  return newSecret;
}

export async function verifyWebhookSecret(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const current = await getOrCreateWebhookSecret();
  if (provided.length !== current.length) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(current);
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
