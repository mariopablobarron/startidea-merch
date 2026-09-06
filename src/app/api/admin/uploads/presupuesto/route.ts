import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { requireRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
// Un route handler de Next no puede exportar constantes sueltas: el tipo
// generado del route exige que solo salgan los handlers.
const KIND_PRESUPUESTOS = "presupuestos";
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/**
 * Sube una imagen para un presupuesto: foto de producto o zona de marcaje.
 *
 * Se **redimensiona al subir** (máximo 1.400 px de lado mayor). No es una
 * optimización cosmética: estas imágenes acaban empotradas en base64 dentro del
 * documento, y una foto de móvil de 4 MB se convierte en 5,3 MB de texto por
 * cada aparición. Con seis imágenes, el HTML del presupuesto pesaría más que
 * todo el catálogo.
 *
 * Se guarda en /uploads/presupuestos y se sirve en /files/presupuestos/…, igual
 * que los mockups de admin.
 */
export async function POST(req: Request) {
  const auth = await requireRole(req, "COMERCIAL");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data esperado" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Archivo no recibido" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen pasa de 12 MB" }, { status: 413 });
  }
  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.includes(ct)) {
    return NextResponse.json(
      { error: `Tipo no permitido (${ct}). Acepta PNG, JPG o WebP.` },
      { status: 415 },
    );
  }

  const entrada = Buffer.from(await file.arrayBuffer());

  let salida: Buffer;
  let extension: string;
  try {
    const img = sharp(entrada, { failOn: "error" }).rotate(); // respeta el EXIF del móvil
    const meta = await img.metadata();
    // PNG mantiene PNG (transparencia de recortes de producto); el resto a JPEG.
    if (meta.format === "png") {
      salida = await img.resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      extension = "png";
    } else {
      salida = await img.resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      extension = "jpg";
    }
  } catch {
    return NextResponse.json({ error: "No se pudo leer la imagen" }, { status: 400 });
  }

  const rawName = (file as File).name || "imagen";
  const baseName = rawName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 60);
  const finalName = `${randomBytes(8).toString("hex")}-${baseName || "imagen"}.${extension}`;

  const dir = path.join(UPLOADS_DIR, KIND_PRESUPUESTOS);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, finalName), salida);

  return NextResponse.json({
    ok: true,
    url: `/files/${KIND_PRESUPUESTOS}/${finalName}`,
    bytes: salida.length,
  });
}
