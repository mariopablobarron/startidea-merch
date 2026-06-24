// Cliente API de FacturaScripts (https://facturas.startidea.tech).
//
// La API espera body application/x-www-form-urlencoded y el campo `lineas`
// como string JSON. Auth via header `Token`. Resources camelCase exactos.
// Ver docs/facturascripts-integration.md para el contrato completo.

export const FS_URL = process.env.FACTURASCRIPTS_URL || "https://facturas.startidea.tech/api/3";
const FS_KEY = process.env.FACTURASCRIPTS_API_KEY || "";

// idempresa de STARTIDEA MALAGA SL en FacturaScripts. Por defecto 2 (la
// segunda empresa que se da de alta — 1 es STARTIDEA CONSULTING SL).
export const FS_IDEMPRESA = Number(process.env.FACTURASCRIPTS_IDEMPRESA || "2");

// codalmacen de MALAGA. Por defecto AMG. Si cambia el código, sobrescribir.
export const FS_CODALMACEN = process.env.FACTURASCRIPTS_CODALMACEN || "AMG";

// codserie por defecto para las facturas del merch. Serie A = General.
export const FS_CODSERIE = process.env.FACTURASCRIPTS_CODSERIE || "A";

export class FSError extends Error {
  status: number;
  body: string;
  endpoint: string;
  constructor(endpoint: string, status: number, body: string) {
    super(`FacturaScripts ${endpoint} HTTP ${status}: ${body.slice(0, 240)}`);
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
    this.name = "FSError";
  }
}

function ensureConfigured() {
  if (!FS_KEY) throw new Error("FACTURASCRIPTS_API_KEY no está configurada");
}

async function fsPost<T = unknown>(path: string, body: Record<string, string | number>): Promise<T> {
  ensureConfigured();
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const res = await fetch(`${FS_URL}${path}`, {
    method: "POST",
    headers: {
      Token: FS_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new FSError(path, res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

async function fsGet<T = unknown>(path: string): Promise<T> {
  ensureConfigured();
  const res = await fetch(`${FS_URL}${path}`, {
    headers: { Token: FS_KEY, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new FSError(path, res.status, text);
  return JSON.parse(text) as T;
}

// ─── Tipos públicos ───────────────────────────────────────────────────────

export type FsCliente = {
  codcliente: string;
  cifnif: string;
  nombre: string;
  razonsocial?: string;
  email?: string;
  telefono1?: string;
  direccion?: string;
  codpostal?: string;
  ciudad?: string;
  provincia?: string;
  codpais?: string;
  personafisica?: 0 | 1;
  tipoidfiscal?: "CIF" | "NIF" | "NIE" | "PAS" | "OTRO";
  idempresa?: number;
};

export type FsProducto = {
  referencia: string;
  descripcion: string;
  precio: number;
  codimpuesto?: "IVA21" | "IVA10" | "IVA4" | "IVA0";
  nostock?: 0 | 1;
  ventasinstock?: 0 | 1;
  idempresa?: number;
};

export type FsLinea = {
  referencia: string;
  descripcion: string;
  cantidad: number;
  pvpunitario: number;
  codimpuesto?: "IVA21" | "IVA10" | "IVA4" | "IVA0";
  dtopor?: number;
};

export type FsFactura = {
  codcliente: string;
  codserie?: string;
  observaciones?: string;
  lineas: FsLinea[];
  idempresa?: number;
  codalmacen?: string;
};

export type FsFacturaResponse = {
  doc: {
    idfactura: number;
    codigo: string;
    numero: string;
    codserie: string;
    codcliente: string;
    fecha: string;
    neto: number;
    totaliva: number;
    total: number;
    pagada: boolean;
    editable: boolean;
    idempresa: number;
  };
  lines: unknown[];
};

// ─── Operaciones ──────────────────────────────────────────────────────────

export const facturaScripts = {
  /**
   * Crea o actualiza un cliente. Idempotente sobre `codcliente`.
   * codcliente máximo 10 chars: usa el mapeo de tu lado (p.ej. `M-<8 chars>`).
   */
  upsertCliente(c: FsCliente): Promise<unknown> {
    const body: Record<string, string | number> = {
      codcliente: c.codcliente,
      cifnif: c.cifnif,
      nombre: c.nombre,
      razonsocial: c.razonsocial ?? c.nombre,
      personafisica: c.personafisica ?? 0,
      tipoidfiscal: c.tipoidfiscal ?? "CIF",
      codpais: c.codpais ?? "ESP",
      idempresa: c.idempresa ?? FS_IDEMPRESA,
    };
    if (c.email) body.email = c.email;
    if (c.telefono1) body.telefono1 = c.telefono1;
    if (c.direccion) body.direccion = c.direccion;
    if (c.codpostal) body.codpostal = c.codpostal;
    if (c.ciudad) body.ciudad = c.ciudad;
    if (c.provincia) body.provincia = c.provincia;
    return fsPost("/clientes", body);
  },

  /**
   * Crea o actualiza un producto (idempotente sobre `referencia`).
   * Por defecto productos sin stock (servicios / merch sin gestión interna).
   */
  upsertProducto(p: FsProducto): Promise<unknown> {
    return fsPost("/productos", {
      referencia: p.referencia,
      descripcion: p.descripcion,
      precio: p.precio,
      codimpuesto: p.codimpuesto ?? "IVA21",
      nostock: p.nostock ?? 1,
      ventasinstock: p.ventasinstock ?? 1,
      idempresa: p.idempresa ?? FS_IDEMPRESA,
    });
  },

  /**
   * Crea una factura de cliente. La numeración se asigna automáticamente
   * según la secuencia (idempresa, ejercicio, codserie). NO duplica si la
   * factura ya existe — controla idempotencia en tu lado con `fsInvoiceCode`.
   */
  async crearFactura(params: FsFactura): Promise<FsFacturaResponse> {
    const body: Record<string, string | number> = {
      codcliente: params.codcliente,
      codserie: params.codserie ?? FS_CODSERIE,
      idempresa: params.idempresa ?? FS_IDEMPRESA,
      codalmacen: params.codalmacen ?? FS_CODALMACEN,
      observaciones: params.observaciones ?? "",
      lineas: JSON.stringify(params.lineas),
    };
    const res = await fsPost<FsFacturaResponse>("/crearFacturaCliente", body);
    // La API de FacturaScripts devuelve los numéricos como STRING ("9", "12.10").
    // Normalizamos en el borde para que el resto del sistema (marcarPagada,
    // persistencia en Payment.fsInvoiceId Int) reciba números de verdad — si no,
    // el update de Prisma falla y se rompe la idempotencia → factura duplicada.
    if (res?.doc) {
      res.doc.idfactura = Number(res.doc.idfactura);
      res.doc.total = Number(res.doc.total);
    }
    return res;
  },

  /**
   * Marca una factura como pagada. La URL lleva el idfactura (PK numérica),
   * NO el `codigo` (cadena tipo "1511").
   */
  marcarPagada(idfactura: number, codpago: string = "TRANS", fecha?: string): Promise<unknown> {
    return fsPost(`/pagarFacturaCliente/${idfactura}`, {
      pagada: 1,
      fecha: fecha ?? new Date().toISOString().slice(0, 10),
      codpago,
    });
  },

  /**
   * Lista facturas por cliente. Útil para comprobar si una factura ya existe
   * antes de crearla (fallback de idempotencia si perdimos `fsInvoiceCode`).
   */
  listFacturas(params: { codcliente?: string; codserie?: string; limit?: number }): Promise<unknown[]> {
    const q = new URLSearchParams();
    if (params.codcliente) q.set("codcliente", params.codcliente);
    if (params.codserie) q.set("codserie", params.codserie);
    if (params.limit) q.set("limit", String(params.limit));
    return fsGet<unknown[]>(`/facturaclientes?${q.toString()}`);
  },

  /**
   * Lista productos (paginado). Útil para sincronización inicial: detectar
   * qué ya existe antes de POST.
   */
  listProductos(params: { limit?: number; offset?: number } = {}): Promise<unknown[]> {
    const q = new URLSearchParams();
    q.set("limit", String(params.limit ?? 100));
    if (params.offset) q.set("offset", String(params.offset));
    return fsGet<unknown[]>(`/productos?${q.toString()}`);
  },
};
