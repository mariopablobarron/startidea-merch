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

  // Descargar imagen base
  const baseRes = await fetch(baseUrl);
  if (!baseRes.ok) {
    return NextResponse.json({ error: `No se pudo descargar imagen base: ${baseRes.status}` }, { status: 502 });
  }
  const baseBuffer = Buffer.from(await baseRes.arrayBuffer());
  const logoBuffer = Buffer.from(await file.arrayBuffer());

  // Procesar
  const baseImg = sharp(baseBuffer).rotate();
  const baseMeta = await baseImg.metadata();
  const baseW = baseMeta.width || 800;
  const baseH = baseMeta.height || 800;

  // Tamaño del logo: ~30% del ancho de la imagen base
  const targetLogoW = Math.round(baseW * 0.3);
  const logoResized = await sharp(logoBuffer)
    .resize({ width: targetLogoW, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((baseW - logoResized.info.width) / 2);
  const top = Math.round((baseH - logoResized.info.height) / 2);

  const out = await baseImg
    .composite([{ input: logoResized.data, left, top, blend: "over" }])
    .png()
    .toBuffer();

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      "X-Mockup-Position": position?.positionId || "default",
    },
  });
}
