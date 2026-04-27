import { timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireAdminSecret(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return { ok: false, status: 503, reason: "ADMIN_SECRET no configurado" };
  const provided = req.headers.get("x-admin-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!provided) return { ok: false, status: 401, reason: "missing secret" };
  if (!safeEqual(provided, secret)) return { ok: false, status: 403, reason: "bad secret" };
  return { ok: true };
}

export function requireCronSecret(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, reason: "CRON_SECRET no configurado" };
  const provided = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!provided) return { ok: false, status: 401, reason: "missing secret" };
  if (!safeEqual(provided, secret)) return { ok: false, status: 403, reason: "bad secret" };
  return { ok: true };
}
