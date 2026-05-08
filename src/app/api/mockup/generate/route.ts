import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Genera un mockup PNG componiendo:
 *   1. Imagen base de la zona de marcaje (printposition-img-api-v2 de MidOcean)
 *   2. El logo subido por el cliente, redimensionado al área máxima
 *
 * Acepta multipart/form-data:
 *   logo: archivo de imagen
 *   productSlug: string
 *   positionId: string (opcional, default primera zona del producto)
 *
 * Responde con image/png.
 *
 * Es una composición simplificada: respeta proporción del logo, lo centra
 * en la zona y aplica blend "multiply" para integrarlo. Resultado suficiente
 * para validar visualmente, no para producción final.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data esperado" }, { status: 400 });

  const file = form.get("logo");
  const productSlug = String(form.get("productSlug") || "");
  const positionIdInput = form.get("positionId") ? String(form.get("positionId")) : null;

  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Logo no recibido" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Logo > 5 MB. Súbelo más ligero." }, { status: 413 });
  }
  if (!productSlug) {
    return NextResponse.json({ error: "productSlug requerido" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: {
      positions: { orderBy: { positionId: "asc" } },
    },
  });
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const position = positionIdInput
    ? product.positions.find((p) => p.positionId === positionIdInput)
    : product.positions.find((p) => !!p.imageUrl) || product.positions[0];

  const baseUrl = position?.imageUrl || product.primaryImageUrl;
  if (!baseUrl) {
    return NextResponse.json({ error: "Producto sin imagen base disponible" }, { status: 422 });
  }

  // Descargar imagen base con UA real (algunos CDN bloquean fetch sin UA)
  let baseBuffer: Buffer;
  try {
    const baseRes = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TodoMerchandising/1.0)",
        Accept: "image/jpeg,image/png,image/*,*/*;q=0.8",
      },
    });
    if (!baseRes.ok) {
      return NextResponse.json(
        { error: `No se pudo descargar imagen base del producto (HTTP ${baseRes.status})` },
        { status: 502 },
      );
    }
    const ct = baseRes.headers.get("content-type") || "";
    if (!ct.startsWith("image/") && ct !== "application/octet-stream") {
      return NextResponse.json(
        { error: `Imagen base inválida (content-type ${ct})` },
        { status: 502 },
      );
    }
    baseBuffer = Buffer.from(await baseRes.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: `Error descargando imagen base: ${e instanceof Error ? e.message : "network"}` },
      { status: 502 },
    );
  }

  const logoBuffer = Buffer.from(await file.arrayBuffer());

  // Procesar imagen base (separado del logo para distinguir errores)
  let baseImg: ReturnType<typeof sharp>;
  let baseW: number;
  let baseH: number;
  try {
    baseImg = sharp(baseBuffer, { failOn: "none" }).rotate();
    const baseMeta = await baseImg.metadata();
    baseW = baseMeta.width || 800;
    baseH = baseMeta.height || 800;
  } catch (e) {
    console.error("[mockup] base sharp error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        error:
          "La imagen base de este producto no se puede procesar. Pídenos cotización con tu logo y lo aplicamos a mano.",
      },
      { status: 502 },
    );
  }

  // Tamaño del logo: ~30% del ancho de la imagen base
  const targetLogoW = Math.round(baseW * 0.3);
  let logoResized: { data: Buffer; info: { width: number; height: number } };
  try {
    logoResized = await sharp(logoBuffer, { failOn: "none" })
      .resize({ width: targetLogoW, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    console.error("[mockup] logo sharp error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        error:
          "Tu logo no se ha podido procesar. Súbelo en PNG, JPG, WEBP o SVG (no PDF, ZIP, ni archivos vacíos).",
      },
      { status: 422 },
    );
  }

  const left = Math.round((baseW - logoResized.info.width) / 2);
  const top = Math.round((baseH - logoResized.info.height) / 2);

  let out: Buffer;
  try {
    out = await baseImg
      .composite([{ input: logoResized.data, left, top, blend: "over" }])
      .png()
      .toBuffer();
  } catch (e) {
    console.error("[mockup] composite error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        error:
          "No se pudo generar el mockup. Inténtalo con un logo distinto o pídenos cotización.",
      },
      { status: 500 },
    );
  }

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Mockup-Position": position?.positionId || "default",
    },
  });
}
