import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Sirve archivos del volumen /uploads (customer-logos, etc).
 *
 * Seguridad:
 *  - Resolución dentro de UPLOADS_DIR (path-traversal guard).
 *  - Solo subpaths conocidos (customer-logos/, ...).
 *  - Cache headers 1 año porque los nombres incluyen token aleatorio.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  if (!parts || parts.length === 0) {
    return NextResponse.json({ error: "Path requerido" }, { status: 400 });
  }

  // Solo permitimos kinds conocidos como primera parte
  const allowedKinds = new Set([
    "customer-logos",
    "admin-proofs",
    "magnific-assets",
    "recursos", // lead magnets descargables HTML/PDF/DOCX (página /recursos)
  ]);
  if (!allowedKinds.has(parts[0])) {
    return NextResponse.json({ error: "Path no permitido" }, { status: 403 });
  }

  const requested = path.join(UPLOADS_DIR, ...parts);
  const resolved = path.resolve(requested);
  const base = path.resolve(UPLOADS_DIR);
  if (!resolved.startsWith(base + path.sep)) {
    return NextResponse.json({ error: "Path traversal denegado" }, { status: 403 });
  }

  try {
    const st = await stat(resolved);
    if (!st.isFile()) return NextResponse.json({ error: "No es archivo" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const buf = await readFile(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(buf.length),
    },
  });
}
