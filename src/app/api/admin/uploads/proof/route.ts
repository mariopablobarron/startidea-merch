import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { requireRole } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const KIND = "admin-proofs";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (mockups pueden ser PDF grande)
const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
  "application/pdf",
];

/**
 * Sube un mockup desde admin para crear un OrderProof. Solo CEO/COMERCIAL.
 *
 * Persiste en /uploads/admin-proofs/{token}-{filename}, devuelve URL pública
 * /files/admin-proofs/{filename} para usarla luego al crear el proof.
 *
 * Endpoint separado del customer-logo para:
 *  - Permitir tipo PDF (mockups oficiales suelen ser PDF)
 *  - Límite tamaño superior (20 MB)
 *  - Auth distinta (admin role vs cliente público)
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
    return NextResponse.json({ error: "Archivo > 20 MB" }, { status: 413 });
  }
  const ct = file.type || "application/octet-stream";
  if (!ALLOWED.includes(ct)) {
    return NextResponse.json(
      { error: `Tipo no permitido (${ct}). Acepta PNG, JPG, SVG, WebP o PDF.` },
      { status: 415 },
    );
  }

  const rawName = (file as File).name || "mockup";
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
