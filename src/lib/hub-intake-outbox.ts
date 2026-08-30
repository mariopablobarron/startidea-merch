import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type HubIntakeKind = "contact" | "application" | "proposal" | "resource" | "newsletter" | "registration" | "event_lead" | "event_waitlist" | "other";
type DetailValue = string | number | boolean | string[];
export type HubIntakePayload = {
  schemaVersion: 1;
  submissionId: string;
  kind: HubIntakeKind;
  form: string;
  occurredAt: string;
  contact: { email: string; name?: string; phone?: string };
  organization?: { name?: string; website?: string };
  subject: string;
  message?: string;
  details?: Record<string, DetailValue>;
  consents?: { privacy?: boolean; marketing?: boolean };
};

type OutboxDb = Pick<Prisma.TransactionClient, "hubIntakeOutbox">;
export const HUB_INTAKE_MAX_BYTES = 32_768;
const LEASE_MS = 2 * 60_000;
const SUBMISSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FORM_RE = /^[a-z0-9][a-z0-9._/-]*$/;
const KINDS = new Set<HubIntakeKind>(["contact", "application", "proposal", "resource", "newsletter", "registration", "event_lead", "event_waitlist", "other"]);

function truncate(value: string, max: number) {
  return Array.from(value).slice(0, max).join("");
}

function required(value: string, max: number, label: string) {
  const normalized = truncate(value.trim(), max);
  if (!normalized) throw new Error(`${label} no puede quedar vacío`);
  return normalized;
}

function optional(value: string | undefined, max: number) {
  if (value === undefined) return undefined;
  return truncate(value.trim(), max) || undefined;
}

function normalizeEmail(value: string) {
  const email = value.trim();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) throw new Error("contact.email inválido");
  const domain = email.slice(at + 1);
  const maxLocal = 200 - domain.length - 1;
  if (maxLocal < 1) throw new Error("contact.email excede el contrato HUB");
  const normalized = `${truncate(email.slice(0, at), maxLocal)}@${domain}`;
  if (/\s/.test(normalized) || normalized.length > 200) throw new Error("contact.email inválido");
  return normalized;
}

function normalizeDetails(details: HubIntakePayload["details"]): Array<[string, DetailValue]> {
  const result: Array<[string, DetailValue]> = [];
  const seen = new Set<string>();
  for (const [rawKey, rawValue] of Object.entries(details ?? {})) {
    if (result.length >= 40) break;
    const key = truncate(rawKey.trim(), 80);
    if (!key || seen.has(key)) continue;
    let value: DetailValue | undefined;
    if (typeof rawValue === "string") value = truncate(rawValue.trim(), 2_000);
    else if (typeof rawValue === "boolean") value = rawValue;
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) value = rawValue;
    else if (Array.isArray(rawValue)) value = rawValue.filter((item): item is string => typeof item === "string").slice(0, 20).map((item) => truncate(item.trim(), 200));
    if (value === undefined) continue;
    seen.add(key);
    result.push([key, value]);
  }
  return result;
}

export function normalizeHubIntakePayload(input: HubIntakePayload): HubIntakePayload {
  const submissionId = input.submissionId.trim();
  if (submissionId.length < 8 || submissionId.length > 128 || !SUBMISSION_RE.test(submissionId)) throw new Error("submissionId no cumple el contrato HUB");
  const form = input.form.trim();
  if (!form || form.length > 80 || !FORM_RE.test(form)) throw new Error("form no cumple el contrato HUB");
  if (!KINDS.has(input.kind)) throw new Error("kind no cumple el contrato HUB");
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("occurredAt inválido");
  const name = optional(input.contact.name, 200);
  const phone = optional(input.contact.phone, 50);
  const organizationName = optional(input.organization?.name, 200);
  let website: string | undefined;
  if (input.organization?.website?.trim().length && input.organization.website.trim().length <= 500) {
    try {
      const candidate = new URL(input.organization.website.trim()).toString();
      if (candidate.length <= 500) website = candidate;
    } catch { /* se omite una URL inválida */ }
  }
  const message = optional(input.message, 5_000);
  const detailEntries = normalizeDetails(input.details);
  const normalized: HubIntakePayload = {
    schemaVersion: 1,
    submissionId,
    kind: input.kind,
    form,
    occurredAt: occurredAt.toISOString(),
    contact: { email: normalizeEmail(input.contact.email), ...(name ? { name } : {}), ...(phone ? { phone } : {}) },
    ...((organizationName || website) ? { organization: { ...(organizationName ? { name: organizationName } : {}), ...(website ? { website } : {}) } } : {}),
    subject: required(input.subject, 200, "subject"),
    ...(message ? { message } : {}),
    ...(detailEntries.length ? { details: Object.fromEntries(detailEntries) } : {}),
    ...(input.consents ? { consents: { ...(typeof input.consents.privacy === "boolean" ? { privacy: input.consents.privacy } : {}), ...(typeof input.consents.marketing === "boolean" ? { marketing: input.consents.marketing } : {}) } } : {}),
  };
  while (Buffer.byteLength(JSON.stringify(normalized), "utf8") > HUB_INTAKE_MAX_BYTES && detailEntries.length) {
    detailEntries.pop();
    if (detailEntries.length) normalized.details = Object.fromEntries(detailEntries);
    else delete normalized.details;
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > HUB_INTAKE_MAX_BYTES) throw new Error("payload HUB excede 32768 bytes tras normalizar");
  return normalized;
}

export function newHubIntakeEventId() { return randomUUID(); }

export async function enqueueHubIntake(db: OutboxDb, payload: HubIntakePayload, id?: string) {
  const normalized = normalizeHubIntakePayload(payload);
  const row = await db.hubIntakeOutbox.create({
    data: { ...(id ? { id } : {}), submissionId: normalized.submissionId, payload: normalized as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  return row.id;
}

export function nextHubIntakeRetryAt(attemptsAfterFailure: number, now = new Date()) {
  return new Date(now.getTime() + Math.min(2 ** Math.max(0, attemptsAfterFailure - 1), 24 * 60) * 60_000);
}

type FlushOptions = { ids?: string[]; limit?: number; now?: Date; fetchImpl?: typeof fetch; db?: OutboxDb };

async function claimRows(db: OutboxDb, options: FlushOptions, now: Date) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const staleBefore = new Date(now.getTime() - LEASE_MS);
  const candidates = await db.hubIntakeOutbox.findMany({
    where: { deliveredAt: null, ...(options.ids ? { id: { in: options.ids } } : { nextAttemptAt: { lte: now } }), OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
    orderBy: { createdAt: "asc" }, take: Math.min(limit * 3, 300), select: { id: true },
  });
  const claimed: Array<{ id: string; payload: Prisma.JsonValue; attempts: number; lockToken: string }> = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    const lockToken = randomUUID();
    const claim = await db.hubIntakeOutbox.updateMany({
      where: { id: candidate.id, deliveredAt: null, ...(options.ids ? {} : { nextAttemptAt: { lte: now } }), OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] },
      data: { lockedAt: now, lockToken },
    });
    if (claim.count !== 1) continue;
    const row = await db.hubIntakeOutbox.findFirst({ where: { id: candidate.id, lockToken }, select: { id: true, payload: true, attempts: true, lockToken: true } });
    if (row?.lockToken) claimed.push({ ...row, lockToken: row.lockToken });
  }
  return claimed;
}

export async function flushHubIntakeOutbox(options: FlushOptions = {}) {
  const now = options.now ?? new Date();
  const db = options.db ?? prisma;
  const rows = await claimRows(db, options, now);
  const baseUrl = (process.env.HUB_INTAKE_URL || "https://hub.startidea.tech").replace(/\/$/, "");
  const secret = process.env.HUB_INTAKE_SECRET;
  const fetchImpl = options.fetchImpl ?? fetch;
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      if (!secret) throw new Error("HUB_INTAKE_SECRET no configurado");
      const response = await fetchImpl(`${baseUrl}/api/public/intake/startidea-merch`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(row.payload), signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`HUB respondió HTTP ${response.status}`);
      await db.hubIntakeOutbox.updateMany({ where: { id: row.id, lockToken: row.lockToken }, data: { attempts: { increment: 1 }, deliveredAt: now, lastError: null, lockedAt: null, lockToken: null } });
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Fallo desconocido";
      await db.hubIntakeOutbox.updateMany({ where: { id: row.id, lockToken: row.lockToken }, data: { attempts: { increment: 1 }, nextAttemptAt: nextHubIntakeRetryAt(row.attempts + 1, now), lastError: message, lockedAt: null, lockToken: null } });
      failed += 1;
    }
  }
  return { processed: rows.length, delivered, failed };
}

export async function flushHubIntakeOutboxNow(id: string) {
  try { await flushHubIntakeOutbox({ ids: [id], limit: 1 }); }
  catch (error) { console.error("[hub-intake] el flush inmediato falló; queda en outbox", error); }
}
