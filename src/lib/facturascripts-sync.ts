// Orquestador del flujo merch → FacturaScripts.
//
// Punto de entrada principal: `syncPaymentToFacturaScripts(paymentId)`.
// Idempotente: si ya existe `fsInvoiceCode` para ese payment, no hace nada.
//
// Llamar desde el webhook Stripe tras marcar el Payment como PAID, p.ej.:
//
//   void syncPaymentToFacturaScripts(payment.id).catch((err) =>
//     console.error("[fs-sync]", payment.id, err)
//   );
//
// La sincronización NO debe romper el flujo del webhook si falla — los errores
// se guardan en `Payment.fsError` para reintento manual desde admin.

import { prisma } from "@/lib/prisma";
import { facturaScripts, FSError, FS_IDEMPRESA, FS_CODSERIE, FS_CODALMACEN } from "@/lib/facturascripts";

/**
 * Genera el `codcliente` para FacturaScripts a partir del cartId.
 * Máximo 10 chars (limitación de la columna `codcliente`).
 *
 * Esquema: `M-` + primeros 8 chars del cartId.
 * Como cuid() es base32 de ~25 chars, la colisión en 8 chars es despreciable
 * a la escala del merch (probabilidad ≈ 1/(32^8) ≈ 10^-12 por par).
 */
export function codclienteFromCart(cartId: string): string {
  return `M-${cartId.slice(0, 8)}`;
}

/**
 * Genera la `referencia` de producto en FacturaScripts a partir del item.
 * Preferimos `productRef` (que es el SKU del proveedor, p.ej. "BL-A4-AZ") y
 * caemos a `productSlug` si está vacío. Truncamos a 30 chars (límite FS).
 */
function refFromItem(item: { productRef: string | null; productSlug: string }): string {
  const raw = (item.productRef && item.productRef.trim()) || item.productSlug;
  return raw.slice(0, 30);
}

/**
 * Construye la descripción de línea de factura legible (incluye marcaje si
 * existe). Truncada a 200 chars.
 */
function descripcionFromItem(item: {
  productName: string;
  colorName: string | null;
  markingTechniqueName: string | null;
  markingPositionId: string | null;
  markingColours: number | null;
}): string {
  const parts = [item.productName];
  if (item.colorName) parts.push(`(${item.colorName})`);
  if (item.markingTechniqueName) {
    const cols = item.markingColours && item.markingColours > 1 ? ` ${item.markingColours}c` : "";
    parts.push(`+ ${item.markingTechniqueName}${cols}${item.markingPositionId ? ` @${item.markingPositionId}` : ""}`);
  }
  return parts.join(" ").slice(0, 200);
}

/**
 * Devuelve tipoidfiscal según el formato del CIF/NIF del cliente.
 * Heurística simple: si empieza por letra y son 9 chars → CIF. Si es DNI estándar → NIF.
 */
function detectTipoIdFiscal(cifnif: string): "CIF" | "NIF" | "NIE" {
  const upper = cifnif.toUpperCase().replace(/[\s-]/g, "");
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[\dA-J]$/.test(upper)) return "CIF";
  if (/^[XYZ]\d{7}[A-Z]$/.test(upper)) return "NIE";
  return "NIF";
}

type SyncResult =
  | { ok: true; alreadySynced: true; fsInvoiceCode: string; fsInvoiceId: number }
  | { ok: true; alreadySynced: false; fsInvoiceCode: string; fsInvoiceId: number; total: number }
  | { ok: false; error: string };

/**
 * Sincroniza un Payment con FacturaScripts: crea/actualiza cliente, productos,
 * crea factura y la marca como pagada. Persiste los códigos en Payment para
 * idempotencia futura.
 *
 * Errores se guardan en `Payment.fsError` y se devuelven en el resultado SIN
 * lanzar excepción (es responsabilidad del caller decidir si reintenta).
 */
export async function syncPaymentToFacturaScripts(paymentId: string): Promise<SyncResult> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      cart: {
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
          vatNumber: true,
          shippingAddress: true,
          shippingPostalCode: true,
          shippingCity: true,
          shippingCountry: true,
          items: {
            select: {
              productRef: true,
              productSlug: true,
              productName: true,
              colorName: true,
              quantity: true,
              unitPriceClientCents: true,
              markingTechniqueName: true,
              markingPositionId: true,
              markingColours: true,
            },
          },
        },
      },
    },
  });

  if (!payment) {
    return { ok: false, error: `payment ${paymentId} not found` };
  }
  if (payment.status !== "PAID") {
    return { ok: false, error: `payment ${paymentId} not PAID (status=${payment.status})` };
  }
  if (payment.fsInvoiceCode && payment.fsInvoiceId) {
    return { ok: true, alreadySynced: true, fsInvoiceCode: payment.fsInvoiceCode, fsInvoiceId: payment.fsInvoiceId };
  }

  // CIF obligatorio: para B2B en serie A FacturaScripts lo requiere. Si el
  // cliente no lo dio en el checkout, marcamos error y salimos — Mario lo
  // completará desde admin antes de reintentar.
  const cifnif = (payment.cart.vatNumber || "").trim();
  if (!cifnif) {
    const error = "cliente sin vatNumber (CIF/NIF). Completar en admin y reintentar.";
    await prisma.payment.update({ where: { id: paymentId }, data: { fsError: error } });
    return { ok: false, error };
  }

  if (payment.cart.items.length === 0) {
    const error = "carrito sin items";
    await prisma.payment.update({ where: { id: paymentId }, data: { fsError: error } });
    return { ok: false, error };
  }

  try {
    const codcliente = codclienteFromCart(payment.cart.id);

    // 1) Upsert cliente
    await facturaScripts.upsertCliente({
      codcliente,
      cifnif,
      nombre: payment.cart.company || payment.cart.name,
      razonsocial: payment.cart.company || payment.cart.name,
      email: payment.cart.email,
      telefono1: payment.cart.phone || undefined,
      direccion: payment.cart.shippingAddress || undefined,
      codpostal: payment.cart.shippingPostalCode || undefined,
      ciudad: payment.cart.shippingCity || undefined,
      codpais: payment.cart.shippingCountry || "ESP",
      personafisica: payment.cart.company ? 0 : 1,
      tipoidfiscal: detectTipoIdFiscal(cifnif),
      idempresa: FS_IDEMPRESA,
    });

    // 2) Upsert productos (deduplicar por referencia: el mismo SKU puede
    // aparecer en N items por colores/tallas distintas).
    const uniqueProducts = new Map<string, (typeof payment.cart.items)[number]>();
    for (const it of payment.cart.items) {
      const ref = refFromItem(it);
      if (!uniqueProducts.has(ref)) uniqueProducts.set(ref, it);
    }
    for (const [ref, it] of uniqueProducts) {
      await facturaScripts.upsertProducto({
        referencia: ref,
        descripcion: descripcionFromItem(it),
        precio: (it.unitPriceClientCents ?? 0) / 100,
        codimpuesto: "IVA21",
        idempresa: FS_IDEMPRESA,
      });
    }

    // 3) Crear factura. `lineas` son una por cada CartQuoteItem (no agregamos
    // — un item con misma ref y distinto color sigue siendo línea aparte).
    const observaciones = [
      `Pedido merch ${payment.cart.id}`,
      payment.stripePaymentIntentId ? `Stripe ${payment.stripePaymentIntentId}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const lineas = payment.cart.items.map((it) => ({
      referencia: refFromItem(it),
      descripcion: descripcionFromItem(it),
      cantidad: it.quantity,
      pvpunitario: (it.unitPriceClientCents ?? 0) / 100,
      codimpuesto: "IVA21" as const,
    }));

    const { doc } = await facturaScripts.crearFactura({
      codcliente,
      codserie: FS_CODSERIE,
      observaciones,
      lineas,
      idempresa: FS_IDEMPRESA,
      codalmacen: FS_CODALMACEN,
    });

    // 4) Marcar pagada
    await facturaScripts.marcarPagada(doc.idfactura, "TRANS", payment.paidAt?.toISOString().slice(0, 10));

    // 5) Persistir referencia para idempotencia
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        fsInvoiceCode: doc.codigo,
        fsInvoiceId: doc.idfactura,
        fsSyncedAt: new Date(),
        fsError: null,
      },
    });

    return {
      ok: true,
      alreadySynced: false,
      fsInvoiceCode: doc.codigo,
      fsInvoiceId: doc.idfactura,
      total: doc.total,
    };
  } catch (err) {
    const msg = err instanceof FSError ? `${err.endpoint} ${err.status} ${err.body.slice(0, 200)}` : err instanceof Error ? err.message : String(err);
    await prisma.payment.update({
      where: { id: paymentId },
      data: { fsError: msg.slice(0, 1000) },
    });
    return { ok: false, error: msg };
  }
}
