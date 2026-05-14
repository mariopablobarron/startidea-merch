import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const KIND = "customer-logos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "application/pdf"];

/**
 * Subida de logo del cliente para personalización.
 *
 * - multipart/form-data con campo "logo" (file).
 * - Persiste en /uploads/customer-logos/{token}-{basename} (volumen Docker).
 * - Devuelve URL pública relativa /files/customer-logos/{filename}.
 * - Idempotente solo por token aleatorio: cada upload genera URL distinta.
 *
 * Anti-abuso básico: validación content-type + límite 5MB.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data esperado" }, { status: 400 });

  const file = form.get("logo");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Logo no recibido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo > 5 MB. Comprime o súbelo a menor resolución." }, { status: 413 });
  }

  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.includes(ct)) {
    return NextResponse.json(
      { error: `Tipo no permitido (${ct}). Acepta PNG, JPG, SVG, WebP o PDF.` },
      { status: 415 },
    );
  }

  // Nombre original sanitizado + token aleatorio
  const rawName = (file as File).name || "logo";
  const baseName = rawName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 80);
  const token = randomBytes(8).toString("hex");
  const finalName = `${token}-${baseName}`;

  const dir = path.join(UPLOADS_DIR, KIND);
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, finalName), buffer);

  return NextResponse.json({
    ok: true,
    url: `/files/${KIND}/${finalName}`,
    filename: baseName,
    size: file.size,
  });
}
