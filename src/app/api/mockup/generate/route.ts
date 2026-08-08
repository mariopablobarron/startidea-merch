import { NextResponse } from "next/server";
import sharp from "sharp";
import { removeLogoBackgroundSafe } from "@/lib/logo-tools";
import { prisma } from "@/lib/prisma";
import { getMarkingBase } from "@/lib/marking-base-cache";
import { rateLimit } from "@/lib/rate-limit";
import { resolveProductBySlug } from "@/lib/product-slug-resolver";

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
  // Endpoint público CPU-intensivo (sharp decode/compose, uploads 5MB):
  // mismo guard que quote/calculate y search/semantic (auditoría 2026-07-15).
  const rl = rateLimit(req, { key: "mockup-generate", max: 15, windowMs: 60_000 });
  if (!rl.ok) return rl.response;

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

  const resolved = await resolveProductBySlug(productSlug, (slug) =>
    prisma.product.findUnique({
      where: { slug },
      include: {
        positions: { orderBy: { positionId: "asc" } },
      },
    }),
  );
  const product = resolved?.product;
  if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const position = positionIdInput
    ? product.positions.find((p) => p.positionId === positionIdInput)
    : product.positions.find((p) => !!p.imageUrl) || product.positions[0];

  const baseUrl = position?.imageUrl || product.primaryImageUrl;
  if (!baseUrl) {
    return NextResponse.json({ error: "Producto sin imagen base disponible" }, { status: 422 });
  }

  // La imagen base suele ser una ruta RELATIVA del proxy de proveedor
  // (/api/m/<hash>). Dos problemas si se fetcha tal cual:
  //   1. El fetch de Node exige URL absoluta ("Failed to parse URL").
  //   2. Resolverla al dominio público y auto-llamarse falla dentro del
  //      contenedor ("fetch failed" — loopback Docker al FQDN externo).
  // Solución: resolver el hash → MediaAsset.originalUrl (URL real del CDN del
  // proveedor) y fetchar ESA directamente, que el contenedor sí alcanza.
  // Es server-side: el buffer se compone con el logo y se devuelve como PNG
  // propio, nunca se expone la URL del proveedor al cliente.
  let baseFetchUrl = baseUrl;
  const proxyMatch = baseUrl.match(/^\/api\/m\/([^/?#]+)/);
  if (proxyMatch) {
    const asset = await prisma.mediaAsset.findUnique({
      where: { hash: proxyMatch[1] },
      select: { originalUrl: true },
    });
    baseFetchUrl = asset?.originalUrl || new URL(baseUrl, new URL(req.url).origin).toString();
  } else if (baseUrl.startsWith("/")) {
    baseFetchUrl = new URL(baseUrl, new URL(req.url).origin).toString();
  }

  // Si la base elegida es una marking-position técnica del proveedor,
  // intentar cache local primero (anti-rotura si el CDN externo cambia).
  // Si no es de marking-position o el cache no la tiene, fallback a fetch
  // directo del CDN.
  let baseBuffer: Buffer | null = null;
  const isMarkingPositionBase = position?.imageUrl === baseUrl;
  if (isMarkingPositionBase) {
    baseBuffer = await getMarkingBase(baseFetchUrl);
  }
  if (!baseBuffer) {
    try {
      const baseRes = await fetch(baseFetchUrl, {
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
  }

  let logoBuffer: Buffer = Buffer.from(await file.arrayBuffer());
  // Se rellena tras leer metadata: true si rembg quitó el fondo de un JPG/PNG
  // opaco. Cambia el warning "no_alpha" por un aviso positivo.
  let backgroundRemoved = false;

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

  // Metadata original del logo (para validaciones geométricas)
  let logoOriginalW = 0;
  let logoOriginalH = 0;
  let logoHasAlpha = false;
  let logoFormat: string | undefined;
  try {
    const meta = await sharp(logoBuffer, { failOn: "none" }).metadata();
    logoOriginalW = meta.width || 0;
    logoOriginalH = meta.height || 0;
    logoHasAlpha = meta.hasAlpha === true;
    logoFormat = meta.format;
  } catch {
    /* lo manejamos abajo si el resize falla */
  }

  // Logo opaco (JPG o PNG sin alpha): intentar quitar el fondo con el sidecar
  // rembg ANTES de componer — el cliente sube el logo "de WhatsApp" y aun así
  // el mockup sale limpio. Si rembg falla/está caído, seguimos con el
  // original y el warning clásico (nunca bloquea).
  if (!logoHasAlpha && logoFormat !== "svg" && logoOriginalW > 0) {
    const cleaned = await removeLogoBackgroundSafe(logoBuffer);
    if (cleaned) {
      logoBuffer = cleaned;
      logoHasAlpha = true;
      backgroundRemoved = true;
    }
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

  // ── Validaciones geométricas (warnings, no errores) ──────────────
  // El cliente las recibe en header X-Mockup-Warnings (JSON base64)
  // para decidir si avisar. No bloquean el render — informan.
  const warnings: Array<{ code: string; level: "info" | "warn"; text: string }> = [];

  // 1) Logo sin canal alfa → fondo no transparente (probable JPG con bg).
  //    Si rembg lo limpió, el aviso pasa a ser positivo.
  if (backgroundRemoved) {
    warnings.push({
      code: "bg_removed",
      level: "info",
      text:
        "Tu logo venía con fondo y se lo hemos quitado automáticamente para la vista previa. " +
        "Para producción final te pediremos el original en vectorial si lo tienes.",
    });
  } else if (!logoHasAlpha && logoFormat !== "svg") {
    warnings.push({
      code: "no_alpha",
      level: "warn",
      text:
        "Tu logo NO tiene fondo transparente (PNG con alfa o SVG). Si tiene fondo blanco, " +
        "se verá ese rectángulo en la pieza producida. Recomendamos PNG transparente o SVG.",
    });
  }

  // 2) Aspect ratio del logo vs área (si tenemos dimensiones MM)
  if (position?.maxWidthMm && position?.maxHeightMm && logoOriginalW > 0 && logoOriginalH > 0) {
    const logoAR = logoOriginalW / logoOriginalH;
    const areaAR = position.maxWidthMm / position.maxHeightMm;
    const ratio = Math.max(logoAR, areaAR) / Math.min(logoAR, areaAR);
    if (ratio > 2.5) {
      const logoShape = logoAR > 1.5 ? "muy alargado" : logoAR < 0.7 ? "muy alto" : "cuadrado";
      const areaShape = areaAR > 1.5 ? "alargada" : areaAR < 0.7 ? "alta" : "cuadrada";
      warnings.push({
        code: "aspect_mismatch",
        level: "warn",
        text:
          `Tu logo es ${logoShape} pero el área de marcaje es ${areaShape}. ` +
          `Tu logo quedará pequeño y centrado para que entre completo. ` +
          `Si quieres más impacto, sube una versión con proporción similar al área (${position.maxWidthMm}×${position.maxHeightMm} mm).`,
      });
    }
  }

  // 3) Logo demasiado pequeño en píxeles (no llega a 150 DPI cuando se imprima)
  // Asumiendo 150 DPI = 6 px/mm, un logo de 200 px serviría para área de ~33 mm.
  // Por debajo de 400 px de ancho, casi siempre queda pixelado al imprimir.
  if (logoOriginalW > 0 && logoOriginalW < 400 && logoFormat !== "svg") {
    warnings.push({
      code: "low_resolution",
      level: "warn",
      text:
        `Tu logo mide ${logoOriginalW}×${logoOriginalH} px. Para impresión nítida ` +
        `recomendamos al menos 800×800 px o un SVG vectorial. Si solo lo tienes pequeño, ` +
        `podemos vectorizarlo sin coste — coméntalo en el brief.`,
    });
  }

  // 4) Información dimensional del área (siempre que esté disponible)
  if (position?.maxWidthMm && position?.maxHeightMm) {
    warnings.push({
      code: "area_info",
      level: "info",
      text:
        `Área disponible: ${position.maxWidthMm} × ${position.maxHeightMm} mm. ` +
        `Tu logo se ajustará respetando proporción.`,
    });
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
      "X-Mockup-Warnings": Buffer.from(JSON.stringify(warnings)).toString("base64"),
    },
  });
}
