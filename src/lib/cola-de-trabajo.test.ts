import { describe, expect, it } from "vitest";
import { colasDelRol, construirColas } from "@/lib/cola-de-trabajo";

const AHORA = new Date("2026-09-07T12:00:00.000Z");
const HACE_UN_MES = new Date("2026-08-07T12:00:00.000Z");

/** Un Prisma de mentira: devuelve lo que se le diga por modelo y apunta las
 *  llamadas, para poder afirmar qué se consultó y qué no. */
function db(datos: Record<string, unknown[]> = {}) {
  const llamadas: { modelo: string; where: unknown }[] = [];
  const modelo = (nombre: string) => ({
    count: async ({ where }: any) => {
      llamadas.push({ modelo: nombre, where });
      return (datos[nombre] ?? []).length;
    },
    findMany: async ({ where, take }: any) => {
      llamadas.push({ modelo: nombre, where });
      return (datos[nombre] ?? []).slice(0, take);
    },
  });
  return {
    cliente: {
      cartQuote: modelo("cartQuote"),
      quoteRequest: modelo("quoteRequest"),
      presupuesto: modelo("presupuesto"),
      purchaseOrder: modelo("purchaseOrder"),
      mockupRequest: modelo("mockupRequest"),
      payment: modelo("payment"),
    },
    llamadas,
  };
}

const carrito = (id: string) => ({ id, name: "Ana", company: "Acme", createdAt: HACE_UN_MES });
const pago = (id: string) => ({
  id,
  amountCents: 12100,
  paidAt: HACE_UN_MES,
  createdAt: HACE_UN_MES,
  fsError: "timeout",
  cart: { name: "Ana", company: "Acme" },
});
const pedido = (id: string) => ({
  id,
  cartId: "c1",
  supplier: "MIDOCEAN",
  errorMessage: "sin stock",
  updatedAt: HACE_UN_MES,
  createdAt: HACE_UN_MES,
  cart: { name: "Ana", company: "Acme" },
});

describe("qué cola ve cada rol", () => {
  it("el CEO ve todas", () => {
    const todas = colasDelRol("CEO");
    for (const rol of ["COMERCIAL", "OPERACIONES", "FACTURACION"]) {
      for (const clave of colasDelRol(rol)) expect(todas).toContain(clave);
    }
  });

  it("cada rol ve solo lo suyo, y no se solapan", () => {
    const c = new Set(colasDelRol("COMERCIAL"));
    const o = new Set(colasDelRol("OPERACIONES"));
    const f = new Set(colasDelRol("FACTURACION"));
    expect([...c].some((k) => o.has(k) || f.has(k))).toBe(false);
    expect([...o].some((k) => f.has(k))).toBe(false);
    expect(c.size).toBeGreaterThan(0);
    expect(o.size).toBeGreaterThan(0);
    expect(f.size).toBeGreaterThan(0);
  });

  it("un rol que no existe no ve nada", () => {
    expect(colasDelRol("BECARIO")).toEqual([]);
  });
});

describe("construir las colas", () => {
  it("un rol desconocido no consulta la base de datos siquiera", async () => {
    const { cliente, llamadas } = db({ cartQuote: [carrito("a")] });
    expect(await construirColas(cliente, "BECARIO", AHORA)).toEqual([]);
    expect(llamadas).toHaveLength(0);
  });

  it("a FACTURACION no se le pregunta por carritos ni por pedidos", async () => {
    const { cliente, llamadas } = db({ payment: [pago("p1")] });
    await construirColas(cliente, "FACTURACION", AHORA);
    const modelos = new Set(llamadas.map((l) => l.modelo));
    expect(modelos).toEqual(new Set(["payment"]));
  });

  it("a OPERACIONES no se le pregunta por pagos", async () => {
    const { cliente, llamadas } = db({ purchaseOrder: [pedido("po1")] });
    await construirColas(cliente, "OPERACIONES", AHORA);
    expect(llamadas.some((l) => l.modelo === "payment")).toBe(false);
  });

  it("las colas vacías no se devuelven", async () => {
    const { cliente } = db({});
    expect(await construirColas(cliente, "CEO", AHORA)).toEqual([]);
  });

  it("lo roto va antes que lo que solo espera", async () => {
    const { cliente } = db({
      cartQuote: [carrito("a")], // urgencia 2
      purchaseOrder: [pedido("po1")], // urgencia 1
    });
    const colas = await construirColas(cliente, "CEO", AHORA);
    expect(colas[0].urgencia).toBe(1);
    expect(colas.map((c) => c.urgencia)).toEqual([...colas.map((c) => c.urgencia)].sort());
  });

  it("ninguna cola de OPERACIONES lleva dinero", async () => {
    const { cliente } = db({ purchaseOrder: [pedido("po1")] });
    const colas = await construirColas(cliente, "OPERACIONES", AHORA);
    expect(colas.length).toBeGreaterThan(0);
    const texto = JSON.stringify(colas);
    expect(texto).not.toMatch(/Cents|€/);
  });

  it("cada item lleva un enlace de panel utilizable", async () => {
    const { cliente } = db({
      cartQuote: [carrito("a")],
      quoteRequest: [{ id: "q1", name: "Ana", company: null, productHint: "tazas", createdAt: HACE_UN_MES }],
      presupuesto: [{ id: "pr1", numero: "PRE-2026-0001", asunto: "Tazas", clienteNombre: "Acme", enviadoAt: HACE_UN_MES, createdAt: HACE_UN_MES }],
      purchaseOrder: [pedido("po1")],
      mockupRequest: [{ id: "m1", name: "Ana", company: null, productSlug: "taza", createdAt: HACE_UN_MES }],
      payment: [pago("p1")],
    });
    const colas = await construirColas(cliente, "CEO", AHORA);
    expect(colas.length).toBeGreaterThan(0);
    for (const cola of colas) {
      for (const item of cola.items) {
        expect(item.href, `${cola.clave} enlaza fuera del panel`).toMatch(/^\/admin\//);
        expect(item.titulo.length).toBeGreaterThan(0);
        expect(() => new Date(item.desde).toISOString()).not.toThrow();
      }
      if (cola.verTodas) expect(cola.verTodas).toMatch(/^\/admin\//);
      expect(cola.porque.length).toBeGreaterThan(0);
    }
  });

  it("el corte de «paradas» y «sin respuesta» se calcula desde el ahora que se pasa", async () => {
    const { cliente, llamadas } = db({ cartQuote: [carrito("a")], presupuesto: [] });
    await construirColas(cliente, "COMERCIAL", AHORA);
    const paradas = llamadas.find(
      (l) => l.modelo === "cartQuote" && (l.where as any)?.status === "IN_PROGRESS",
    );
    expect((paradas?.where as any).createdAt.lt.toISOString()).toBe("2026-09-04T12:00:00.000Z");
    const sinRespuesta = llamadas.find(
      (l) => l.modelo === "presupuesto" && (l.where as any)?.estado === "ENVIADO",
    );
    expect((sinRespuesta?.where as any).enviadoAt.lt.toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });
});
