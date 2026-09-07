/**
 * La cola de trabajo del panel: qué tiene cada uno pendiente AHORA.
 *
 * El inicio enseñaba una sola lista —carritos de más de 24 h— y decía «no hay
 * nada» cuando había cinco peticiones de esta mañana, tres presupuestos sin
 * enviar y un pedido que falló al cursarse. Un panel que dice «no hay nada»
 * teniendo trabajo es peor que uno que no dice nada: el empleado se lo cree.
 *
 * Reglas que se cumplen aquí y conviene no romper:
 *
 *   1. Cada cola es TRABAJO, no una estadística. Si nadie tiene que hacer nada
 *      con ello, no es cola: es un KPI y va abajo, con los demás.
 *   2. Cada cola la ve quien puede resolverla. A OPERACIONES no se le pone
 *      delante una factura, y a FACTURACION no se le pide cotizar. El CEO lo
 *      ve todo. Esto es presentación, no seguridad: la puerta sigue siendo el
 *      guard de cada endpoint y de cada pantalla.
 *   3. Ninguna cola enseña coste de proveedor ni margen. Las de OPERACIONES no
 *      enseñan tampoco precio de cliente, que es lo que dice su rol en el
 *      esquema («pedidos producción, tracking, proofs, sin precios cliente»).
 *   4. Todo enlace lleva a una pantalla que existe. Una cola que no se puede
 *      abrir es una lista de reproches.
 */
import type { AdminRole } from "@prisma/client";

export type Urgencia = 1 | 2 | 3;

export type ItemDeCola = {
  id: string;
  titulo: string;
  subtitulo: string | null;
  /** ISO. La UI decide cómo contar el tiempo; aquí no se formatea nada. */
  desde: string;
  href: string;
};

export type Cola = {
  clave: string;
  titulo: string;
  /** Por qué esto es trabajo. Una frase, en la pantalla, no en un tooltip. */
  porque: string;
  /** 1 = algo se ha roto · 2 = alguien está esperando · 3 = seguimiento. */
  urgencia: Urgencia;
  total: number;
  verTodas: string | null;
  items: ItemDeCola[];
};

/** Cuántos elementos se listan por cola. El resto se cuenta, no se pinta. */
const POR_COLA = 5;

const DIA = 24 * 60 * 60 * 1000;

function iso(d: Date | null | undefined, respaldo: Date): string {
  return (d ?? respaldo).toISOString();
}

function conEmpresa(nombre: string, empresa: string | null): string {
  return empresa ? `${empresa} · ${nombre}` : nombre;
}

/**
 * Qué colas le tocan a cada rol. CEO lo ve todo, igual que en `requireRole`.
 * Un rol desconocido no ve ninguna: mejor un inicio vacío que uno que enseña
 * lo que no debe.
 */
export function colasDelRol(rol: AdminRole | string): string[] {
  const comercial = [
    "cotizaciones-sin-abrir",
    "peticiones-sin-abrir",
    "cotizaciones-paradas",
    "presupuestos-en-borrador",
    "presupuestos-sin-respuesta",
  ];
  const operaciones = ["pedidos-con-error", "pedidos-sin-cursar", "mockups-pedidos"];
  const facturacion = ["facturas-con-error", "facturas-por-emitir"];

  if (rol === "CEO") return [...operaciones, ...comercial, ...facturacion];
  if (rol === "COMERCIAL") return comercial;
  if (rol === "OPERACIONES") return operaciones;
  if (rol === "FACTURACION") return facturacion;
  return [];
}

/** Lo que la cola necesita de Prisma. Tipado laxo a propósito: el contrato
 *  real lo comprueba `tsc` en la ruta, y así el test no arrastra el cliente. */
type ClienteCola = {
  cartQuote: { count: Function; findMany: Function };
  quoteRequest: { count: Function; findMany: Function };
  presupuesto: { count: Function; findMany: Function };
  purchaseOrder: { count: Function; findMany: Function };
  mockupRequest: { count: Function; findMany: Function };
  payment: { count: Function; findMany: Function };
};

export async function construirColas(
  db: ClienteCola,
  rol: AdminRole | string,
  ahora: Date = new Date(),
): Promise<Cola[]> {
  const permitidas = new Set(colasDelRol(rol));
  if (permitidas.size === 0) return [];

  const hace3d = new Date(ahora.getTime() - 3 * DIA);
  const hace7d = new Date(ahora.getTime() - 7 * DIA);

  const constructores: Record<string, () => Promise<Cola>> = {
    "cotizaciones-sin-abrir": async () => {
      const where = { status: "NEW" as const };
      const [total, filas] = await Promise.all([
        db.cartQuote.count({ where }),
        db.cartQuote.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: { id: true, name: true, company: true, createdAt: true },
        }),
      ]);
      return {
        clave: "cotizaciones-sin-abrir",
        titulo: "Cotizaciones sin abrir",
        porque: "Alguien pidió precio desde la web y todavía no ha hablado con nadie.",
        urgencia: 2,
        total,
        verTodas: "/admin/cart-quotes",
        items: filas.map((c: any) => ({
          id: c.id,
          titulo: conEmpresa(c.name, c.company),
          subtitulo: null,
          desde: iso(c.createdAt, ahora),
          href: `/admin/cart-quotes/${c.id}`,
        })),
      };
    },

    "peticiones-sin-abrir": async () => {
      const where = { status: "NEW" as const };
      const [total, filas] = await Promise.all([
        db.quoteRequest.count({ where }),
        db.quoteRequest.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: { id: true, name: true, company: true, productHint: true, createdAt: true },
        }),
      ]);
      return {
        clave: "peticiones-sin-abrir",
        titulo: "Peticiones del formulario",
        porque: "Llegaron por el formulario corto, sin carrito. Nadie las ha leído.",
        urgencia: 2,
        total,
        verTodas: "/admin/quotes?status=NEW",
        items: filas.map((q: any) => ({
          id: q.id,
          titulo: conEmpresa(q.name, q.company),
          subtitulo: q.productHint || null,
          desde: iso(q.createdAt, ahora),
          href: `/admin/quotes`,
        })),
      };
    },

    "cotizaciones-paradas": async () => {
      const where = { status: "IN_PROGRESS" as const, createdAt: { lt: hace3d } };
      const [total, filas] = await Promise.all([
        db.cartQuote.count({ where }),
        db.cartQuote.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: { id: true, name: true, company: true, createdAt: true },
        }),
      ]);
      return {
        clave: "cotizaciones-paradas",
        titulo: "Cotizaciones paradas",
        porque: "Se abrieron hace más de tres días y siguen en curso, sin enviar.",
        urgencia: 3,
        total,
        verTodas: "/admin/cart-quotes",
        items: filas.map((c: any) => ({
          id: c.id,
          titulo: conEmpresa(c.name, c.company),
          subtitulo: null,
          desde: iso(c.createdAt, ahora),
          href: `/admin/cart-quotes/${c.id}`,
        })),
      };
    },

    "presupuestos-en-borrador": async () => {
      const where = { estado: "BORRADOR" as const };
      const [total, filas] = await Promise.all([
        db.presupuesto.count({ where }),
        db.presupuesto.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: { id: true, numero: true, asunto: true, clienteNombre: true, createdAt: true },
        }),
      ]);
      return {
        clave: "presupuestos-en-borrador",
        titulo: "Presupuestos sin enviar",
        porque: "Están escritos pero el cliente todavía no los ha recibido.",
        urgencia: 2,
        total,
        verTodas: "/admin/presupuestos",
        items: filas.map((p: any) => ({
          id: p.id,
          titulo: `${p.numero} · ${p.clienteNombre}`,
          subtitulo: p.asunto || null,
          desde: iso(p.createdAt, ahora),
          href: `/admin/presupuestos/${p.id}`,
        })),
      };
    },

    "presupuestos-sin-respuesta": async () => {
      const where = { estado: "ENVIADO" as const, enviadoAt: { lt: hace7d } };
      const [total, filas] = await Promise.all([
        db.presupuesto.count({ where }),
        db.presupuesto.findMany({
          where,
          orderBy: { enviadoAt: "asc" },
          take: POR_COLA,
          select: { id: true, numero: true, asunto: true, clienteNombre: true, enviadoAt: true, createdAt: true },
        }),
      ]);
      return {
        clave: "presupuestos-sin-respuesta",
        titulo: "Presupuestos sin respuesta",
        porque: "Enviados hace más de una semana y sin aceptar. Toca llamar.",
        urgencia: 3,
        total,
        verTodas: "/admin/presupuestos",
        items: filas.map((p: any) => ({
          id: p.id,
          titulo: `${p.numero} · ${p.clienteNombre}`,
          subtitulo: p.asunto || null,
          desde: iso(p.enviadoAt ?? p.createdAt, ahora),
          href: `/admin/presupuestos/${p.id}`,
        })),
      };
    },

    // — Producción. Sin precio de cliente: no es lo suyo y el esquema lo dice.
    "pedidos-con-error": async () => {
      const where = { status: "FAILED" as const };
      const [total, filas] = await Promise.all([
        db.purchaseOrder.count({ where }),
        db.purchaseOrder.findMany({
          where,
          orderBy: { updatedAt: "asc" },
          take: POR_COLA,
          select: {
            id: true,
            cartId: true,
            supplier: true,
            errorMessage: true,
            updatedAt: true,
            createdAt: true,
            cart: { select: { name: true, company: true } },
          },
        }),
      ]);
      return {
        clave: "pedidos-con-error",
        titulo: "Pedidos que fallaron al cursarse",
        porque: "El pedido no llegó al proveedor. Está parado hasta que alguien lo mire.",
        urgencia: 1,
        total,
        verTodas: null,
        items: filas.map((po: any) => ({
          id: po.id,
          titulo: conEmpresa(po.cart?.name ?? "Pedido", po.cart?.company ?? null),
          subtitulo: po.errorMessage ? String(po.errorMessage).slice(0, 140) : null,
          desde: iso(po.updatedAt ?? po.createdAt, ahora),
          href: `/admin/cart-quotes/${po.cartId}`,
        })),
      };
    },

    "pedidos-sin-cursar": async () => {
      const where = { status: "PENDING" as const };
      const [total, filas] = await Promise.all([
        db.purchaseOrder.count({ where }),
        db.purchaseOrder.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: {
            id: true,
            cartId: true,
            supplier: true,
            createdAt: true,
            cart: { select: { name: true, company: true } },
          },
        }),
      ]);
      return {
        clave: "pedidos-sin-cursar",
        titulo: "Pedidos sin cursar al proveedor",
        porque: "El cliente ya pagó. La producción no empieza hasta que se cursa.",
        urgencia: 1,
        total,
        verTodas: null,
        items: filas.map((po: any) => ({
          id: po.id,
          titulo: conEmpresa(po.cart?.name ?? "Pedido", po.cart?.company ?? null),
          subtitulo: po.supplier ? String(po.supplier) : null,
          desde: iso(po.createdAt, ahora),
          href: `/admin/cart-quotes/${po.cartId}`,
        })),
      };
    },

    "mockups-pedidos": async () => {
      const where = { status: "NEW" as const };
      const [total, filas] = await Promise.all([
        db.mockupRequest.count({ where }),
        db.mockupRequest.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: POR_COLA,
          select: { id: true, name: true, company: true, productSlug: true, createdAt: true },
        }),
      ]);
      return {
        clave: "mockups-pedidos",
        titulo: "Mockups pedidos",
        porque: "Un cliente pidió ver su logo puesto antes de decidir.",
        urgencia: 2,
        total,
        verTodas: "/admin/mockup-requests",
        items: filas.map((m: any) => ({
          id: m.id,
          titulo: conEmpresa(m.name, m.company),
          subtitulo: m.productSlug || null,
          desde: iso(m.createdAt, ahora),
          href: "/admin/mockup-requests",
        })),
      };
    },

    // — Facturación. Los estados son los mismos que pinta /admin/facturascripts.
    "facturas-con-error": async () => {
      const where = { status: "PAID" as const, fsError: { not: null } };
      const [total, filas] = await Promise.all([
        db.payment.count({ where }),
        db.payment.findMany({
          where,
          orderBy: { paidAt: "asc" },
          take: POR_COLA,
          select: {
            id: true,
            amountCents: true,
            paidAt: true,
            createdAt: true,
            fsError: true,
            cart: { select: { name: true, company: true } },
          },
        }),
      ]);
      return {
        clave: "facturas-con-error",
        titulo: "Facturas que fallaron al emitirse",
        porque: "El cobro entró, la factura no salió. Hay que reintentarla.",
        urgencia: 1,
        total,
        verTodas: "/admin/facturascripts",
        items: filas.map((p: any) => ({
          id: p.id,
          titulo: conEmpresa(p.cart?.name ?? "Cobro", p.cart?.company ?? null),
          subtitulo: p.fsError ? String(p.fsError).slice(0, 140) : null,
          desde: iso(p.paidAt ?? p.createdAt, ahora),
          href: "/admin/facturascripts",
        })),
      };
    },

    "facturas-por-emitir": async () => {
      const where = { status: "PAID" as const, fsInvoiceCode: null, fsError: null };
      const [total, filas] = await Promise.all([
        db.payment.count({ where }),
        db.payment.findMany({
          where,
          orderBy: { paidAt: "asc" },
          take: POR_COLA,
          select: {
            id: true,
            amountCents: true,
            paidAt: true,
            createdAt: true,
            cart: { select: { name: true, company: true } },
          },
        }),
      ]);
      return {
        clave: "facturas-por-emitir",
        titulo: "Cobros sin factura",
        porque: "Están pagados y todavía no tienen factura emitida.",
        urgencia: 2,
        total,
        verTodas: "/admin/facturascripts",
        items: filas.map((p: any) => ({
          id: p.id,
          titulo: conEmpresa(p.cart?.name ?? "Cobro", p.cart?.company ?? null),
          subtitulo: null,
          desde: iso(p.paidAt ?? p.createdAt, ahora),
          href: "/admin/facturascripts",
        })),
      };
    },
  };

  const colas = await Promise.all(
    [...permitidas].filter((c) => constructores[c]).map((c) => constructores[c]()),
  );

  // Vacías fuera: una cola a cero no es información, es ruido. Y el orden lo
  // manda la urgencia, no el orden en que se escribieron los constructores.
  return colas
    .filter((c) => c.total > 0)
    .sort((a, b) => a.urgencia - b.urgencia || b.total - a.total);
}
