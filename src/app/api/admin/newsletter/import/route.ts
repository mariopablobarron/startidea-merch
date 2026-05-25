import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { parseAny, parseXlsxAllSheets, type ParseResult } from "@/lib/newsletter-parser";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min para imports grandes (50k rows)

/**
 * POST /api/admin/newsletter/import
 *
 * Confirma la import iniciada con /preview. Lee el archivo del directorio temp,
 * re-parsea (más seguro que confiar en datos del cliente), crea NewsletterImport,
 * upsertea NewsletterSubscriber en chunks de 200 dentro de transacciones.
 *
 * Body JSON:
 *   {
 *     temp_token: string  (devuelto por /preview)
 *     tag: string         (etiqueta para identificar el lote, ej "lista-2026-05")
 *     respect_unsubscribed?: boolean (default true — no reactiva opt-outs)
 *   }
 *
 * Idempotente por email: si ya existe el subscriber, añade el tag al array
 * (sin duplicar) y actualiza name/company si vienen en el archivo. Si está
 * unsubscribed y `respect_unsubscribed=true`, NO se modifica.
 */

const TAG_RE = /^[a-zA-Z0-9_\-:.]+$/;

const BodySchema = z.object({
  temp_token: z.string().min(8).max(64).regex(/^[a-f0-9]+$/),
  // Modo simple (1 hoja): pasar solo tag
  tag: z.string().min(2).max(60).regex(TAG_RE).optional(),
  // Modo multi-hoja: lista de {sheet_index, tag}. Si presente, ignora `tag` global
  sheets: z
    .array(
      z.object({
        sheet_index: z.number().int().min(0).max(50),
        tag: z.string().min(2).max(60).regex(TAG_RE),
      }),
    )
    .max(20)
    .optional(),
  respect_unsubscribed: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { temp_token, tag, sheets: sheetsToImport, respect_unsubscribed } = parsed.data;

  if (!tag && (!sheetsToImport || sheetsToImport.length === 0)) {
    return NextResponse.json(
      { error: "Falta `tag` (modo simple) o `sheets` (modo multi-hoja)" },
      { status: 400 },
    );
  }

  // Leer archivo + meta del temp dir
  const { readFile, unlink } = await import("node:fs/promises");
  const path = await import("node:path");
  const tmpDir = path.join("/tmp", "newsletter-import");
  const binPath = path.join(tmpDir, `${temp_token}.bin`);
  const metaPath = path.join(tmpDir, `${temp_token}.meta.json`);

  let buffer: Buffer;
  let meta: { filename: string; uploadedAt: string; uploadedBy: string };
  try {
    buffer = await readFile(binPath);
    meta = JSON.parse(await readFile(metaPath, "utf-8"));
  } catch {
    return NextResponse.json(
      { error: "Sesión de import expirada (>30 min). Vuelve a subir el archivo." },
      { status: 410 },
    );
  }

  // Seguridad básica: solo el admin que subió puede confirmar
  if (meta.uploadedBy !== session.email) {
    return NextResponse.json(
      { error: "Solo el admin que subió el archivo puede confirmar" },
      { status: 403 },
    );
  }

  // Cargar todas las hojas (compatible con CSV — devuelve 1)
  const isXlsx = /\.(xlsx|xls)$/i.test(meta.filename);
  let allSheets: Array<{ sheetName: string; sheetIndex: number } & ParseResult>;
  if (isXlsx) {
    allSheets = await parseXlsxAllSheets(buffer);
  } else {
    const single = await parseAny(buffer, meta.filename);
    allSheets = [{ sheetName: "CSV", sheetIndex: 0, ...single }];
  }

  // Determinar qué hojas + tag procesar
  const plan: Array<{ sheetIndex: number; tag: string }> = sheetsToImport
    ? sheetsToImport.map((s) => ({ sheetIndex: s.sheet_index, tag: s.tag }))
    : [{ sheetIndex: 0, tag: tag! }]; // modo simple: solo hoja 0 con el tag global

  // Procesar cada hoja → un batch independiente
  const results: Array<{
    batch_id: string;
    sheet_name: string;
    tag: string;
    inserted: number;
    updated: number;
    skipped: number;
    errors: Array<{ row: number; email: string | null; message: string }>;
  }> = [];

  for (const { sheetIndex, tag: sheetTag } of plan) {
    const sheet = allSheets.find((s) => s.sheetIndex === sheetIndex);
    if (!sheet || sheet.totalRows === 0 || !sheet.mapping.email) {
      results.push({
        batch_id: "",
        sheet_name: sheet?.sheetName || `#${sheetIndex}`,
        tag: sheetTag,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [
          { row: 0, email: null, message: "Hoja inválida (vacía o sin email)" },
        ],
      });
      continue;
    }

    // Crear batch
    const importRow = await prisma.newsletterImport.create({
      data: {
        filename: `${meta.filename} · ${sheet.sheetName}`,
        importedBy: session.email,
        tag: sheetTag,
        totalRows: sheet.totalRows,
      },
    });

    // Procesar
    const CHUNK = 200;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; email: string | null; message: string }> = [];

    const dedup = new Map<string, (typeof sheet.rows)[0]>();
    for (const r of sheet.rows) {
      if (!r.email) {
        skipped++;
        if (errors.length < 50)
          errors.push({ row: r.rowNumber, email: null, message: r.rawError || "Sin email" });
        continue;
      }
      dedup.set(r.email, r);
    }
    const rows = Array.from(dedup.values());

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const emails = chunk.map((r) => r.email!) as string[];
      const existing = await prisma.newsletterSubscriber.findMany({
        where: { email: { in: emails } },
        select: { email: true, tags: true, unsubscribedAt: true },
      });
      const existingMap = new Map(existing.map((e) => [e.email, e]));

      await prisma.$transaction(
        chunk.map((r) => {
          const ex = existingMap.get(r.email!);
          if (ex) {
            if (ex.unsubscribedAt != null && respect_unsubscribed) {
              skipped++;
              return prisma.$queryRaw`SELECT 1`;
            }
            updated++;
            const mergedTags = Array.from(new Set([...ex.tags, sheetTag]));
            return prisma.newsletterSubscriber.update({
              where: { email: r.email! },
              data: {
                tags: mergedTags,
                name: r.name ?? undefined,
                company: r.company ?? undefined,
                phone: r.phone ?? undefined,
                meta: Object.keys(r.meta).length > 0 ? r.meta : undefined,
                importBatchId: importRow.id,
                source: `import:${importRow.id}`,
              },
            });
          }
          inserted++;
          return prisma.newsletterSubscriber.create({
            data: {
              email: r.email!,
              name: r.name,
              company: r.company,
              phone: r.phone,
              tags: [sheetTag],
              meta: Object.keys(r.meta).length > 0 ? r.meta : undefined,
              importBatchId: importRow.id,
              source: `import:${importRow.id}`,
            },
          });
        }),
      );
    }

    await prisma.newsletterImport.update({
      where: { id: importRow.id },
      data: {
        insertedRows: inserted,
        updatedRows: updated,
        skippedRows: skipped,
        errorsJson: errors.length > 0 ? errors : undefined,
      },
    });

    results.push({
      batch_id: importRow.id,
      sheet_name: sheet.sheetName,
      tag: sheetTag,
      inserted,
      updated,
      skipped,
      errors: errors.slice(0, 20),
    });
  }

  // Cleanup
  await Promise.all([unlink(binPath).catch(() => {}), unlink(metaPath).catch(() => {})]);

  // Totales agregados
  const totals = results.reduce(
    (acc, r) => ({
      inserted: acc.inserted + r.inserted,
      updated: acc.updated + r.updated,
      skipped: acc.skipped + r.skipped,
    }),
    { inserted: 0, updated: 0, skipped: 0 },
  );

  return NextResponse.json({ ok: true, results, totals });
}
