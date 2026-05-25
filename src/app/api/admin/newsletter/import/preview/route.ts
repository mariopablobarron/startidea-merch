import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/lib/admin-auth";
import { parseAny } from "@/lib/newsletter-parser";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (un Excel con 50.000 contactos pesa ~3 MB)

/**
 * POST /api/admin/newsletter/import/preview
 *
 * Recibe multipart/form-data con campo `file` (XLSX o CSV).
 * Parsea, valida emails, dedupe contra DB y devuelve resumen + primeras 10 filas
 * para que el admin confirme antes de hacer el import real.
 *
 * NO toca la BD (excepto SELECT para detectar duplicados).
 *
 * Response:
 *   {
 *     ok, filename, totalRows,
 *     mapping: { email, name, company, phone, extras[] },
 *     headers: string[],
 *     preview: ParsedRow[10],
 *     stats: {
 *       valid: N,          // filas con email válido
 *       invalid: N,        // sin email o email malformado
 *       duplicated_in_file: N,  // emails repetidos dentro del archivo
 *       already_exists: N,      // emails ya en BD (se actualizarán, no se duplican)
 *       new: N,                 // emails que se crearán nuevos
 *       unsubscribed_existing: N // ya en BD pero opted-out — NO se reactivarán
 *     },
 *     temp_token: string  // token corto para confirmar la import sin re-subir
 *   }
 */
export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Body inválido (multipart)" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta campo 'file'" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB, máx 10 MB)` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseAny(buffer, file.name);
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo parsear el archivo: ${e instanceof Error ? e.message : "error desconocido"}` },
      { status: 400 },
    );
  }

  if (parsed.totalRows === 0) {
    return NextResponse.json(
      { error: "El archivo no tiene filas (¿hoja vacía o solo cabecera?)" },
      { status: 400 },
    );
  }
  if (!parsed.mapping.email) {
    return NextResponse.json(
      {
        error: "No se detectó columna de email. Asegúrate de que el archivo tenga una cabecera tipo 'email', 'correo', 'e-mail'…",
        headers: parsed.headers,
      },
      { status: 400 },
    );
  }

  // Dedupe dentro del archivo
  const emailsInFile = new Map<string, number>(); // email → cuántas veces aparece
  let invalid = 0;
  for (const r of parsed.rows) {
    if (!r.email) {
      invalid++;
      continue;
    }
    emailsInFile.set(r.email, (emailsInFile.get(r.email) || 0) + 1);
  }
  const duplicatedInFile = Array.from(emailsInFile.values()).reduce((s, n) => s + (n - 1), 0);
  const uniqueEmails = Array.from(emailsInFile.keys());

  // Lookup en BD (qué emails ya existen)
  const existing = uniqueEmails.length
    ? await prisma.newsletterSubscriber.findMany({
        where: { email: { in: uniqueEmails } },
        select: { email: true, unsubscribedAt: true },
      })
    : [];
  const existingMap = new Map(existing.map((e) => [e.email, e.unsubscribedAt != null]));
  let alreadyExists = 0;
  let unsubscribedExisting = 0;
  for (const e of uniqueEmails) {
    if (existingMap.has(e)) {
      alreadyExists++;
      if (existingMap.get(e)) unsubscribedExisting++;
    }
  }

  // Guardar el buffer en una "papelera" temporal para que `/import` lo recoja
  // sin re-subir. Usamos /tmp con un token random + cleanup a las 30 min.
  const { randomBytes } = await import("node:crypto");
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const token = randomBytes(16).toString("hex");
  const tmpDir = path.join("/tmp", "newsletter-import");
  await mkdir(tmpDir, { recursive: true });
  await writeFile(path.join(tmpDir, `${token}.bin`), buffer);
  await writeFile(
    path.join(tmpDir, `${token}.meta.json`),
    JSON.stringify({
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.email,
    }),
  );

  return NextResponse.json({
    ok: true,
    filename: file.name,
    totalRows: parsed.totalRows,
    mapping: parsed.mapping,
    headers: parsed.headers,
    preview: parsed.rows.slice(0, 10),
    stats: {
      valid: parsed.totalRows - invalid,
      invalid,
      duplicated_in_file: duplicatedInFile,
      already_exists: alreadyExists,
      new: uniqueEmails.length - alreadyExists,
      unsubscribed_existing: unsubscribedExisting,
    },
    temp_token: token,
  });
}
