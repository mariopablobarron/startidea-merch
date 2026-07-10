import { prisma } from "@/lib/prisma";
import { loadActivePromotions } from "@/lib/promotions";
import { computeServerLinePricing, type ServerMarkingInput } from "@/lib/quote-server-pricing";
import { displayFromPrice } from "@/lib/product-pricing";
import { publicRef } from "@/lib/internal-ref";
import { withIva } from "@/lib/iva";
import { computeCotizacion } from "@/lib/cotizar-core";
import { createProposalFromCotizacion } from "@/lib/proposal-from-cotizacion";
import { deliverProposal } from "@/lib/proposal-deliver";

/**
 * Agente admin de Telegram — Mario (o quien esté en la allowlist) pregunta en
 * lenguaje natural desde el móvil, en plena reunión comercial, y el agente
 * responde con DATOS REALES del sistema vía tools:
 *
 *   buscar_productos · detalle_producto · cotizar · estado_pedidos ·
 *   estadisticas · promociones_activas · estado_sistema
 *
 * Diseño "delante del cliente": las tools de catálogo/cotización devuelven lo
 * mismo que vería el cliente (refs STM, precios CON margen) — se puede enseñar
 * la pantalla sin miedo. Lo interno (pipeline de ventas, syncs) se marca 🔒.
 * NUNCA se exponen proveedores ni costes netos, ni siquiera aquí.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_TELEGRAM || "anthropic/claude-sonnet-4.5";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";
const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 12; // mensajes de contexto por chat
const HISTORY_KEEP = 40; // poda: máximo almacenado por chat

const EUR = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmt = (cents: number) => EUR.format(cents / 100);

// ── Tools (formato OpenAI function-calling, compatible OpenRouter) ──────────

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "buscar_productos",
      description:
        "Busca productos activos del catálogo por nombre o referencia STM. Devuelve nombre, ref, precio 'desde' de cliente, stock y URL de la ficha.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto de búsqueda (ej. 'botella térmica', 'STM-82A8NU')" },
          limit: { type: "number", description: "Máx resultados (default 5, máx 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "detalle_producto",
      description:
        "Ficha completa de un producto: colores, tallas, stock por variante (agregado), técnicas de personalización disponibles con sus códigos (necesarios para cotizar) y URL.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string", description: "Referencia STM-XXXXXX o slug del producto" },
        },
        required: ["ref_o_slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cotizar",
      description:
        "Cotiza un producto a una cantidad, opcionalmente con personalización. Usa EXACTAMENTE el mismo motor que el checkout (margen, promos, tarifas de marcaje reales). Si piden personalización sin especificar técnica, pasa personalizado=true y el sistema usa la técnica MÁS COMÚN del producto (la respuesta indica cuál). Devuelve precio producto + marcaje + total + unitario, sin IVA y con IVA.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string" },
          cantidad: { type: "number" },
          tecnica_code: {
            type: "string",
            description: "Código de técnica de marcaje concreto (sale de detalle_producto). Omitir si no lo especifican.",
          },
          personalizado: {
            type: "boolean",
            description: "true si quieren personalización sin técnica concreta → se usa la más común del producto.",
          },
          colores: { type: "number", description: "Número de colores del marcaje (default 1)" },
        },
        required: ["ref_o_slug", "cantidad"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crear_presupuesto",
      description:
        "Crea un presupuesto FORMAL numerado (PROP-YYYY-NNNN) con PDF a partir de una cotización. Lo crea como BORRADOR (no envía nada): devuelve número, totales y link al PDF para revisarlo. Para mandarlo al cliente usa después enviar_presupuesto. Necesita el email del destinatario.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string" },
          cantidad: { type: "number" },
          tecnica_code: { type: "string", description: "Técnica concreta; omitir para usar la más común si personalizado=true" },
          personalizado: { type: "boolean" },
          colores: { type: "number" },
          email_cliente: { type: "string", description: "Email del destinatario del presupuesto" },
          nombre_cliente: { type: "string" },
          empresa: { type: "string" },
        },
        required: ["ref_o_slug", "cantidad", "email_cliente"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "enviar_presupuesto",
      description:
        "Envía por email al cliente un presupuesto ya creado (por su número PROP-YYYY-NNNN). SOLO llamar cuando el usuario haya CONFIRMADO explícitamente el envío en este chat. Si ya estaba enviado, lo reenvía.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "string", description: "Número de propuesta, ej. PROP-2026-0042" },
        },
        required: ["numero"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estado_pedidos",
      description:
        "🔒 Busca pedidos/cotizaciones por empresa, nombre o email del cliente. Devuelve estado, importes, pagos, propuestas y seguimiento de envío. También sirve para 'los últimos pedidos' (query vacía).",
      parameters: {
        type: "object",
        properties: {
          busqueda: { type: "string", description: "Empresa, nombre o email. Vacío = últimos 5" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estadisticas",
      description:
        "🔒 Números del negocio en un periodo: cotizaciones recibidas, pedidos cerrados, facturado (pagos), presupuestos pendientes de pago.",
      parameters: {
        type: "object",
        properties: {
          periodo: { type: "string", enum: ["hoy", "semana", "mes"], description: "default: semana" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "promociones_activas",
      description:
        "Promociones de la web. Por defecto solo las activas; incluir_pausadas=true lista también las pausadas (necesario antes de activar una).",
      parameters: {
        type: "object",
        properties: {
          incluir_pausadas: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cambiar_promocion",
      description:
        "⚠️ ACCIÓN EN VIVO: pausa (activa=false) o activa (activa=true) una promoción por su nombre. Afecta a los precios de la web al instante. SOLO tras confirmación explícita del usuario.",
      parameters: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "Nombre (o parte única del nombre) de la promoción" },
          activa: { type: "boolean" },
        },
        required: ["nombre", "activa"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cambiar_precio",
      description:
        "⚠️ ACCIÓN EN VIVO: fija el precio 'desde' de VENTA de un producto (override manual en euros, ej. 4.5) o lo quita (quitar=true → vuelve al precio automático con margen). Afecta a la web al instante. SOLO tras confirmación explícita.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string" },
          precio_desde_eur: { type: "number", description: "Nuevo precio cliente en euros (ej. 4.5)" },
          quitar: { type: "boolean", description: "true = eliminar el precio manual y volver al automático" },
        },
        required: ["ref_o_slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "activar_producto",
      description:
        "⚠️ ACCIÓN EN VIVO: oculta (activo=false) o publica (activo=true) un producto del catálogo. SOLO tras confirmación explícita.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string" },
          activo: { type: "boolean" },
        },
        required: ["ref_o_slug", "activo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "anotar_pedido",
      description:
        "Añade una nota interna a la cotización/pedido más reciente que case con la búsqueda (empresa, nombre o email). El cliente NO la ve. Útil en reunión: 'apunta que quieren entrega antes del 20'.",
      parameters: {
        type: "object",
        properties: {
          busqueda: { type: "string" },
          nota: { type: "string" },
        },
        required: ["busqueda", "nota"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "margen_interno",
      description:
        "🔒 SOLO USO INTERNO: coste que NOS cobra el proveedor vs PVP del cliente → margen absoluto y % de una venta concreta. Usar únicamente si lo piden explícitamente (margen, coste, 'cuánto ganamos'). La respuesta NUNCA debe verse en una pantalla delante del cliente.",
      parameters: {
        type: "object",
        properties: {
          ref_o_slug: { type: "string" },
          cantidad: { type: "number", description: "Unidades (default 100)" },
          tecnica_code: { type: "string" },
          personalizado: { type: "boolean", description: "true → técnica más común del producto" },
          colores: { type: "number" },
        },
        required: ["ref_o_slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estado_sistema",
      description:
        "🔒 Salud interna: última sincronización de cada catálogo de origen y tamaño del catálogo. Solo para uso interno, no enseñar al cliente.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Implementación de tools ──────────────────────────────────────────────────

async function resolveProduct(refOrSlug: string) {
  const q = refOrSlug.trim();
  // STM-XXXXXX → internalRef; si no, slug; si no, nombre.
  return prisma.product.findFirst({
    where: {
      active: true,
      OR: [
        { internalRef: { equals: q, mode: "insensitive" } },
        { slug: q.toLowerCase() },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      override: true,
      variants: { select: { colorName: true, size: true, stockQty: true } },
      positions: { include: { techniques: { include: { technique: true } } } },
    },
  });
}

type ResolvedProduct = NonNullable<Awaited<ReturnType<typeof resolveProduct>>>;

/**
 * Técnica "más común" de un producto para cotizar cuando piden personalización
 * sin especificar técnica: 1º la marcada isDefault en alguna posición, 2º la
 * ofrecida en MÁS posiciones del producto, 3º la primera disponible.
 */
function mostCommonTechnique(p: ResolvedProduct): { code: string; nombre: string } | null {
  const counts = new Map<string, { code: string; nombre: string; n: number; isDefault: boolean }>();
  for (const pos of p.positions) {
    for (const t of pos.techniques) {
      const cur = counts.get(t.technique.code) ?? {
        code: t.technique.code,
        nombre: t.technique.name,
        n: 0,
        isDefault: false,
      };
      cur.n += 1;
      cur.isDefault = cur.isDefault || t.isDefault;
      counts.set(t.technique.code, cur);
    }
  }
  const ranked = [...counts.values()].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || b.n - a.n,
  );
  return ranked[0] ? { code: ranked[0].code, nombre: ranked[0].nombre } : null;
}

async function toolBuscarProductos(args: { query: string; limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 10);
  const activePromos = await loadActivePromotions();
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: args.query, mode: "insensitive" } },
        { internalRef: { contains: args.query, mode: "insensitive" } },
      ],
    },
    take: limit,
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      categoryId: true,
      internalRef: true,
      fromPriceCents: true,
      override: { select: { customFromPriceCents: true, marginPct: true, marketingTags: true } },
      variants: { where: { stockQty: { gt: 0 } }, take: 1, select: { id: true } },
    },
  });
  return products.map((p) => {
    const price = displayFromPrice(
      { id: p.id, name: p.name, brand: p.brand, categoryId: p.categoryId, fromPriceCents: p.fromPriceCents },
      p.override,
      activePromos,
    );
    return {
      ref: publicRef(p),
      nombre: p.name,
      desde: price.finalCents != null ? fmt(price.finalCents) : "consultar",
      stock: p.variants.length > 0 ? "sí" : "bajo pedido",
      url: `${SITE_URL}/catalogo/${p.slug}`,
    };
  });
}

async function toolDetalleProducto(args: { ref_o_slug: string }) {
  const p = await resolveProduct(args.ref_o_slug);
  if (!p) return { error: "Producto no encontrado" };

  // Colores con stock agregado; tallas únicas.
  const colorStock = new Map<string, number>();
  const sizes = new Set<string>();
  for (const v of p.variants) {
    if (v.colorName) colorStock.set(v.colorName, (colorStock.get(v.colorName) ?? 0) + v.stockQty);
    if (v.size && v.size !== "S/T") sizes.add(v.size);
  }
  const tecnicas = new Map<string, { code: string; nombre: string }>();
  for (const pos of p.positions) {
    for (const t of pos.techniques) {
      tecnicas.set(t.technique.code, { code: t.technique.code, nombre: t.technique.name });
    }
  }
  return {
    ref: publicRef(p),
    nombre: p.name,
    colores: [...colorStock.entries()].map(([c, s]) => ({ color: c, stock: s })).slice(0, 25),
    tallas: [...sizes].slice(0, 15),
    tecnicas: [...tecnicas.values()].slice(0, 15),
    tecnica_mas_comun: mostCommonTechnique(p),
    zonas_marcaje: p.positions.length,
    url: `${SITE_URL}/catalogo/${p.slug}`,
  };
}

/** Resuelve la técnica a usar: la pedida, o la más común si personalizado. */
function resolveTechnique(
  p: ResolvedProduct,
  args: { tecnica_code?: string; personalizado?: boolean },
): { code: string; nombre: string; auto: boolean } | null {
  if (args.tecnica_code) {
    const found = p.positions
      .flatMap((pos) => pos.techniques)
      .find((t) => t.technique.code === args.tecnica_code);
    return { code: args.tecnica_code, nombre: found?.technique.name ?? args.tecnica_code, auto: false };
  }
  if (args.personalizado) {
    const common = mostCommonTechnique(p);
    return common ? { ...common, auto: true } : null;
  }
  return null;
}

async function toolCotizar(args: {
  ref_o_slug: string;
  cantidad: number;
  tecnica_code?: string;
  personalizado?: boolean;
  colores?: number;
}) {
  const p = await resolveProduct(args.ref_o_slug);
  if (!p) return { error: "Producto no encontrado" };

  const tecnica = resolveTechnique(p, args);
  if (args.personalizado && !args.tecnica_code && !tecnica) {
    return { error: "El producto no tiene técnicas de personalización registradas — cotizar sin marcaje u ofrecer presupuesto manual." };
  }
  const markings: ServerMarkingInput[] = tecnica
    ? [
        {
          techniqueCode: tecnica.code,
          numberOfColours: args.colores ?? 1,
          // Área de la primera posición con dimensiones (igual que la ficha).
          printAreaCm2: (() => {
            const pos = p.positions.find((x) => x.maxWidthMm && x.maxHeightMm);
            return pos ? (pos.maxWidthMm! / 10) * (pos.maxHeightMm! / 10) : null;
          })(),
        },
      ]
    : [];

  const activePromos = await loadActivePromotions();
  const result = await computeServerLinePricing(
    { productSlug: p.slug, quantity: Math.trunc(args.cantidad), markings },
    activePromos,
  );
  if (!result.ok) {
    return {
      error: `No cotizable automáticamente: ${result.reason}. Ofrecer presupuesto manual en 24h.`,
    };
  }
  return {
    ref: publicRef(p),
    nombre: p.name,
    cantidad: Math.trunc(args.cantidad),
    tecnica_usada: tecnica
      ? { code: tecnica.code, nombre: tecnica.nombre, elegida_automaticamente: tecnica.auto }
      : null,
    producto: fmt(result.productClientCents),
    marcaje: fmt(result.markingClientCents),
    total_sin_iva: fmt(result.totalClientCents),
    total_con_iva: fmt(withIva(result.totalClientCents)),
    unitario_sin_iva: fmt(result.unitClientCents),
    nota: result.priceSource === "estimate" ? "precio orientativo" : "tarifa cerrada",
    url: `${SITE_URL}/catalogo/${p.slug}`,
  };
}

async function toolCrearPresupuesto(args: {
  ref_o_slug: string;
  cantidad: number;
  tecnica_code?: string;
  personalizado?: boolean;
  colores?: number;
  email_cliente: string;
  nombre_cliente?: string;
  empresa?: string;
}) {
  const p = await resolveProduct(args.ref_o_slug);
  if (!p) return { error: "Producto no encontrado" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email_cliente)) {
    return { error: "Email del cliente no válido" };
  }
  const tecnica = resolveTechnique(p, args);

  // Mismo puente que el cotizador del admin: cotización → propuesta numerada
  // con PDF. NUNCA devolvemos el desglose de coste del CotizarOk al modelo.
  const quote = await computeCotizacion({
    ref: p.slug,
    qty: Math.trunc(args.cantidad),
    techniqueCode: tecnica?.code,
    numberOfColours: args.colores ?? undefined,
  });
  if (!quote.ok) {
    return { error: `No cotizable: ${quote.error}. Ofrecer presupuesto manual en 24h.` };
  }

  const created = await createProposalFromCotizacion({
    quote,
    email: args.email_cliente,
    name: args.nombre_cliente ?? null,
    company: args.empresa ?? null,
    status: "draft", // SIEMPRE borrador: el envío es un paso aparte confirmado
    send: false,
  });
  if (!created.ok) return { error: created.error };

  return {
    numero: created.proposalNumber,
    estado: "borrador (SIN enviar)",
    destinatario: args.email_cliente,
    tecnica_usada: tecnica ? { code: tecnica.code, nombre: tecnica.nombre, elegida_automaticamente: tecnica.auto } : null,
    total_sin_iva: fmt(quote.pvp.baseTotal),
    total_con_iva: fmt(withIva(quote.pvp.baseTotal)),
    pdf: created.downloadUrl,
    siguiente_paso: "Revisar el PDF y, si el usuario confirma, llamar a enviar_presupuesto",
  };
}

async function toolEnviarPresupuesto(args: { numero: string }) {
  const proposal = await prisma.proposal.findUnique({
    where: { proposalNumber: args.numero.trim().toUpperCase() },
  });
  if (!proposal) return { error: `No existe la propuesta ${args.numero}` };
  if (proposal.status === "accepted" || proposal.status === "rejected") {
    return { error: `La propuesta ya está ${proposal.status === "accepted" ? "aceptada" : "rechazada"} — no tiene sentido reenviarla.` };
  }
  const wasDraft = proposal.status === "draft";
  const res = await deliverProposal(proposal, "telegram-bot", { resend: !wasDraft });
  if (!res.ok) return { error: `Envío fallido: ${res.error}` };
  return {
    numero: res.proposalNumber,
    enviado_a: res.sentTo,
    tipo: wasDraft ? "primer envío" : "reenvío",
  };
}

async function toolEstadoPedidos(args: { busqueda?: string }) {
  const q = (args.busqueda ?? "").trim();
  const carts = await prisma.cartQuote.findMany({
    where: q
      ? {
          OR: [
            { company: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      items: { select: { quantity: true, productName: true } },
      payments: { where: { status: "PAID" }, select: { amountCents: true, paidAt: true } },
      trackings: { orderBy: { fetchedAt: "desc" }, take: 1, select: { carrier: true, trackingCode: true, status: true } },
      // NUNCA seleccionar supplier de los POs.
      purchaseOrders: { select: { status: true, estimatedDeliveryDate: true, trackingNumber: true } },
    },
  });
  return carts.map((c) => ({
    fecha: c.createdAt.toISOString().slice(0, 10),
    cliente: `${c.name}${c.company ? ` (${c.company})` : ""}`,
    estado: c.status,
    unidades: c.items.reduce((s, it) => s + it.quantity, 0),
    productos: c.items.slice(0, 3).map((it) => `${it.quantity}× ${it.productName}`),
    total: c.acceptedTotalCents ? fmt(c.acceptedTotalCents) : c.estimatedTotalCents ? `~${fmt(c.estimatedTotalCents)}` : "sin precio",
    pagado: c.payments.reduce((s, p) => s + p.amountCents, 0) > 0 ? fmt(c.payments.reduce((s, p) => s + p.amountCents, 0)) : "no",
    envios: c.purchaseOrders.map((po) => ({
      estado: po.status,
      eta: po.estimatedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      tracking: po.trackingNumber ?? null,
    })),
  }));
}

async function toolEstadisticas(args: { periodo?: string }) {
  const now = Date.now();
  const from =
    args.periodo === "hoy"
      ? new Date(new Date().setHours(0, 0, 0, 0))
      : args.periodo === "mes"
        ? new Date(now - 30 * 86400_000)
        : new Date(now - 7 * 86400_000);

  const [cotizaciones, pedidos, pagos, pendientes] = await Promise.all([
    prisma.cartQuote.count({ where: { createdAt: { gte: from } } }),
    prisma.cartQuote.count({ where: { status: "ORDERED", orderedAt: { gte: from } } }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidAt: { gte: from } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.cartQuote.count({
      where: { paymentLinkToken: { not: null }, payments: { none: { status: "PAID" } } },
    }),
  ]);
  return {
    periodo: args.periodo ?? "semana",
    cotizaciones_recibidas: cotizaciones,
    pedidos_cerrados: pedidos,
    facturado: fmt(pagos._sum.amountCents ?? 0),
    numero_pagos: pagos._count,
    presupuestos_pendientes_de_pago: pendientes,
  };
}

async function toolPromociones(args: { incluir_pausadas?: boolean }) {
  const promos = args.incluir_pausadas
    ? await prisma.promotion.findMany({
        orderBy: [{ active: "desc" }, { startsAt: "desc" }],
        take: 20,
      })
    : await loadActivePromotions();
  return promos.map((p) => ({
    nombre: p.name,
    badge: p.badgeText,
    tipo: p.kind,
    valor: p.kind === "PERCENT" ? `-${p.value}%` : `-${fmt(p.value)}`,
    activa: p.active,
  }));
}

async function toolCambiarPromocion(args: { nombre: string; activa: boolean }) {
  const matches = await prisma.promotion.findMany({
    where: { name: { contains: args.nombre, mode: "insensitive" } },
    select: { id: true, name: true, active: true },
  });
  if (matches.length === 0) return { error: `Ninguna promoción casa con "${args.nombre}"` };
  if (matches.length > 1) {
    return {
      error: "El nombre coincide con varias — concreta cuál",
      candidatas: matches.map((m) => `${m.name} (${m.active ? "activa" : "pausada"})`),
    };
  }
  const p = matches[0];
  if (p.active === args.activa) {
    return { ok: true, sin_cambios: `"${p.name}" ya estaba ${args.activa ? "activa" : "pausada"}` };
  }
  await prisma.promotion.update({ where: { id: p.id }, data: { active: args.activa } });
  console.log(`[telegram-agent] promoción "${p.name}" → ${args.activa ? "ACTIVA" : "PAUSADA"}`);
  return {
    ok: true,
    promocion: p.name,
    ahora: args.activa ? "ACTIVA (afecta a precios de la web YA)" : "PAUSADA",
    reversible: "sí — pídemelo o desde /admin/promotions",
  };
}

async function toolCambiarPrecio(args: {
  ref_o_slug: string;
  precio_desde_eur?: number;
  quitar?: boolean;
}) {
  const p = await resolveProduct(args.ref_o_slug);
  if (!p) return { error: "Producto no encontrado" };

  if (args.quitar) {
    await prisma.productOverride.updateMany({
      where: { productId: p.id },
      data: { customFromPriceCents: null, updatedBy: "telegram-bot" },
    });
    console.log(`[telegram-agent] precio manual QUITADO en ${p.slug}`);
    return { ok: true, producto: p.name, ref: publicRef(p), precio: "automático (margen estándar)" };
  }

  if (!args.precio_desde_eur || args.precio_desde_eur <= 0) {
    return { error: "Indica precio_desde_eur > 0, o quitar=true para volver al automático" };
  }
  const cents = Math.round(args.precio_desde_eur * 100);
  await prisma.productOverride.upsert({
    where: { productId: p.id },
    create: { productId: p.id, customFromPriceCents: cents, updatedBy: "telegram-bot" },
    update: { customFromPriceCents: cents, updatedBy: "telegram-bot" },
  });
  console.log(`[telegram-agent] precio manual ${fmt(cents)} en ${p.slug}`);
  return {
    ok: true,
    producto: p.name,
    ref: publicRef(p),
    nuevo_precio_desde: fmt(cents),
    // Guarda interna sin revelar cifras: el watchdog semanal también lo vigila.
    advertencia:
      p.fromPriceCents != null && cents < p.fromPriceCents
        ? "OJO: ese precio queda POR DEBAJO del coste del producto"
        : undefined,
    reversible: "quitar=true vuelve al precio automático",
  };
}

async function toolActivarProducto(args: { ref_o_slug: string; activo: boolean }) {
  // Sin filtro de activo: hay que poder ENCONTRAR un producto oculto para republicarlo.
  const q = args.ref_o_slug.trim();
  const p = await prisma.product.findFirst({
    where: {
      OR: [
        { internalRef: { equals: q, mode: "insensitive" } },
        { slug: q.toLowerCase() },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, slug: true, internalRef: true, active: true },
  });
  if (!p) return { error: "Producto no encontrado" };
  if (p.active === args.activo) {
    return { ok: true, sin_cambios: `"${p.name}" ya estaba ${args.activo ? "publicado" : "oculto"}` };
  }
  await prisma.product.update({ where: { id: p.id }, data: { active: args.activo } });
  console.log(`[telegram-agent] producto ${p.slug} → ${args.activo ? "ACTIVO" : "OCULTO"}`);
  return {
    ok: true,
    producto: p.name,
    ref: publicRef(p),
    ahora: args.activo ? "PUBLICADO en el catálogo" : "OCULTO del catálogo",
    nota: args.activo ? undefined : "el sync del proveedor puede reactivarlo si vuelve con precio — para retirada definitiva, /admin",
  };
}

async function toolMargenInterno(args: {
  ref_o_slug: string;
  cantidad?: number;
  tecnica_code?: string;
  personalizado?: boolean;
  colores?: number;
}) {
  const p = await resolveProduct(args.ref_o_slug);
  if (!p) return { error: "Producto no encontrado" };
  const tecnica = resolveTechnique(p, args);
  const qty = Math.trunc(args.cantidad ?? 100);

  // Motor del cotizador admin: coste NETO real (tramo aplicable + tarifa de
  // marcaje del proveedor) vs PVP con margen/override/promos.
  const quote = await computeCotizacion({
    ref: p.slug,
    qty,
    techniqueCode: tecnica?.code,
    numberOfColours: args.colores ?? undefined,
  });
  if (!quote.ok) return { error: quote.error };

  const margenAbs = quote.pvp.baseTotal - quote.coste.total;
  return {
    AVISO: "🔒 DATOS INTERNOS — no enseñar esta respuesta al cliente",
    producto: quote.product.name,
    ref: quote.product.publicRef,
    proveedor: quote.product.supplier,
    ref_proveedor: quote.product.supplierRef,
    cantidad: qty,
    tecnica_usada: tecnica
      ? { code: tecnica.code, nombre: tecnica.nombre, elegida_automaticamente: tecnica.auto }
      : null,
    coste_nuestro: {
      producto: fmt(quote.coste.productoTotal),
      marcaje: fmt(quote.coste.marcajeTotal),
      total: fmt(quote.coste.total),
    },
    pvp_cliente: {
      total_sin_iva: fmt(quote.pvp.baseTotal),
      unitario: fmt(quote.pvp.unit),
    },
    margen: {
      absoluto: fmt(margenAbs),
      porcentaje: `${quote.margenEfectivoPct.toFixed(1)}%`,
    },
    tarifa_cerrada: quote.product.hasRealPricing,
  };
}

async function toolAnotarPedido(args: { busqueda: string; nota: string }) {
  const q = args.busqueda.trim();
  const cart = await prisma.cartQuote.findFirst({
    where: {
      OR: [
        { company: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, company: true, createdAt: true, internalNotes: true },
  });
  if (!cart) return { error: `Ningún pedido/cotización casa con "${q}"` };
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const linea = `[${stamp} vía Telegram] ${args.nota.trim()}`;
  await prisma.cartQuote.update({
    where: { id: cart.id },
    data: { internalNotes: cart.internalNotes ? `${cart.internalNotes}\n${linea}` : linea },
  });
  return {
    ok: true,
    pedido: `${cart.name}${cart.company ? ` (${cart.company})` : ""} · ${cart.createdAt.toISOString().slice(0, 10)}`,
    nota_guardada: linea,
    visibilidad: "solo interna (el cliente no la ve)",
  };
}

async function toolEstadoSistema() {
  const [syncs, productos, conStock] = await Promise.all([
    prisma.supplierSync.findMany({ orderBy: { startedAt: "desc" } }),
    prisma.product.count({ where: { active: true } }),
    prisma.productVariant.count({ where: { stockQty: { gt: 0 } } }),
  ]);
  return {
    catalogo_activo: productos,
    variantes_con_stock: conStock,
    // Los nombres de origen son internos (🔒): el agente sabe no enseñarlos.
    sincronizaciones: syncs.map((s) => ({
      origen: s.supplier,
      ok: s.ok,
      fin: s.finishedAt?.toISOString() ?? "en curso",
      productos: s.productsUpserted,
    })),
  };
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "buscar_productos":
      return toolBuscarProductos(args as { query: string; limit?: number });
    case "detalle_producto":
      return toolDetalleProducto(args as { ref_o_slug: string });
    case "cotizar":
      return toolCotizar(args as { ref_o_slug: string; cantidad: number; tecnica_code?: string; personalizado?: boolean; colores?: number });
    case "crear_presupuesto":
      return toolCrearPresupuesto(args as {
        ref_o_slug: string;
        cantidad: number;
        tecnica_code?: string;
        personalizado?: boolean;
        colores?: number;
        email_cliente: string;
        nombre_cliente?: string;
        empresa?: string;
      });
    case "enviar_presupuesto":
      return toolEnviarPresupuesto(args as { numero: string });
    case "estado_pedidos":
      return toolEstadoPedidos(args as { busqueda?: string });
    case "estadisticas":
      return toolEstadisticas(args as { periodo?: string });
    case "promociones_activas":
      return toolPromociones(args as { incluir_pausadas?: boolean });
    case "cambiar_promocion":
      return toolCambiarPromocion(args as { nombre: string; activa: boolean });
    case "cambiar_precio":
      return toolCambiarPrecio(args as { ref_o_slug: string; precio_desde_eur?: number; quitar?: boolean });
    case "activar_producto":
      return toolActivarProducto(args as { ref_o_slug: string; activo: boolean });
    case "anotar_pedido":
      return toolAnotarPedido(args as { busqueda: string; nota: string });
    case "margen_interno":
      return toolMargenInterno(args as {
        ref_o_slug: string;
        cantidad?: number;
        tecnica_code?: string;
        personalizado?: boolean;
        colores?: number;
      });
    case "estado_sistema":
      return toolEstadoSistema();
    default:
      return { error: `Tool desconocida: ${name}` };
  }
}

// ── Loop del agente ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres Carmen, la asistente comercial de TodoMerchandising (Startidea Málaga SL) por Telegram. Hablas con un ADMINISTRADOR (Mario u otro comercial), a menudo EN PLENA REUNIÓN con un cliente delante.

REGLAS:
- Responde en español, CORTO y directo (es un móvil): lo esencial primero, sin relleno.
- Usa las tools para TODO dato (precio, stock, estado): nunca inventes números.
- Precios: siempre del motor real (tool cotizar). Indica si es sin IVA / con IVA.
- La pantalla puede verla el cliente final: por defecto usa refs STM-XXXXXX y precios de venta, SIN proveedores ni costes ni márgenes. EXCEPCIÓN: si el usuario pide explícitamente margen/coste/"cuánto ganamos", usa margen_interno y responde empezando por "🔒" para recordar que esa respuesta no debe verse delante del cliente. Nunca mezcles costes o proveedor en respuestas de cotización normales. Las demás tools 🔒 (pedidos, estadísticas, sistema): respóndelas sin añadir datos sensibles que no pidan.
- Si una cotización no sale automática (sin tarifa), dilo claro y ofrece "presupuesto manual en 24h".
- PERSONALIZACIÓN sin técnica concreta: pasa personalizado=true y el sistema usa la técnica MÁS COMÚN del producto. Di siempre qué técnica se usó (ej: "con Tampografía, la habitual de este producto").
- PRESUPUESTOS FORMALES: puedes crearlos (crear_presupuesto crea un BORRADOR con número y PDF; pide el email del cliente si falta) y enviarlos (enviar_presupuesto). REGLA DE ORO: enviar_presupuesto SOLO tras confirmación explícita del usuario en este chat ("envíalo", "sí, manda") — nunca en el mismo turno en que se crea, salvo que el usuario ya lo haya pedido literalmente ("crea Y envía"). Muestra número, total y link al PDF al crear.
- ACCIONES EN VIVO (tools marcadas ⚠️: cambiar_promocion, cambiar_precio, activar_producto): modifican la web al instante. SOLO ejecutarlas tras confirmación EXPLÍCITA del usuario en este chat ("sí", "confirma", "hazlo"). Antes de confirmar, resume exactamente qué va a cambiar. Después, confirma el cambio y cómo revertirlo. Excepción: si el mensaje ya es una orden inequívoca con todos los datos ("pausa la promo X"), pide confirmación igualmente si afecta a TODO el catálogo; ejecuta directo si es puntual y reversible.
- anotar_pedido es inocua (nota interna): ejecútala directamente.
- Formato Telegram HTML: <b>negrita</b> para totales, listas con "·" o saltos de línea. Sin Markdown.
- Si piden algo que aún no puedes hacer con tus tools, dilo y sugiere hacerlo desde /admin — no lo simules.`;

type ChatMsg =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export async function runTelegramAdminAgent(chatId: string, userText: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    return "⚠️ El asistente no tiene OPENROUTER_API_KEY configurada.";
  }

  // Contexto: últimos mensajes del chat (orden cronológico).
  const history = await prisma.telegramAdminMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.reverse().map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user", content: userText },
  ];

  let finalText = "No he podido generar respuesta.";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: TOOLS,
        temperature: 0.2,
        max_tokens: 900,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[telegram-agent] OpenRouter", res.status, errBody.slice(0, 300));
      finalText = "⚠️ Error consultando el asistente. Prueba de nuevo en unos segundos.";
      break;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) {
      finalText = "⚠️ Respuesta vacía del asistente.";
      break;
    }

    if (msg.tool_calls && msg.tool_calls.length > 0 && round < MAX_TOOL_ROUNDS) {
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        let result: unknown;
        try {
          const args = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
          result = await executeTool(tc.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 12_000),
        });
      }
      continue;
    }

    finalText = (msg.content ?? "").trim() || "Hecho.";
    break;
  }

  // Persistir turno + podar historial.
  try {
    await prisma.telegramAdminMessage.createMany({
      data: [
        { chatId, role: "user", content: userText.slice(0, 4000) },
        { chatId, role: "assistant", content: finalText.slice(0, 4000) },
      ],
    });
    const excess = await prisma.telegramAdminMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      skip: HISTORY_KEEP,
      select: { id: true },
    });
    if (excess.length > 0) {
      await prisma.telegramAdminMessage.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
    }
  } catch (e) {
    console.error("[telegram-agent] persistir historial falló:", e instanceof Error ? e.message : e);
  }

  return finalText;
}
