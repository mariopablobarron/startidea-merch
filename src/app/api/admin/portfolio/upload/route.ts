/**
 * POST /api/admin/portfolio/upload
 *
 * Sube una imagen del portfolio al volumen UPLOADS_DIR/portfolio/.
 * Devuelve la URL pública (/files/portfolio/{filename}) lista para
 * pegar en el campo imageUrl del editor de PortfolioItem.
 *
 * Clon del patrón ya usado por /api/uploads/customer-logo, con dos
 * cambios: auth admin (CEO/COMERCIAL) y kind="portfolio".
 *
 * - multipart/form-data, campo "image" (file).
 * - Máx 8 MB (bocetos PDF de Cifra suelen ser ~3-5 MB).
 * - Acepta PNG, JPG, SVG, WebP, PDF.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { authenticateAdminRequest } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const KIND = "portfolio";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp", "application/pdf"];

export async function POST(req: Request) {
  const session = await authenticateAdminRequest(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!(session.role === "CEO" || session.role === "COMERCIAL")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data esperado" }, { status: 400 });

  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Imagen no recibida" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Imagen > 8 MB. Comprime o reduce resolución antes de subir." },
      { status: 413 },
    );
  }

  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.includes(ct)) {
    return NextResponse.json(
      { error: `Tipo no permitido (${ct}). Acepta PNG, JPG, SVG, WebP o PDF.` },
      { status: 415 },
    );
  }

  const rawName = (file as File).name || "boceto";
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
