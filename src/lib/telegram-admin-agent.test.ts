import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  fetch: vi.fn(),
  historyRead: vi.fn(),
  historyWrite: vi.fn(),
  historyDelete: vi.fn(),
  productRead: vi.fn(),
  productSearch: vi.fn(),
  productWrite: vi.fn(),
  overrideWrite: vi.fn(),
  overrideRemove: vi.fn(),
  promotionRead: vi.fn(),
  promotionWrite: vi.fn(),
  cartRead: vi.fn(),
  cartWrite: vi.fn(),
  proposalRead: vi.fn(),
  createProposal: vi.fn(),
  deliverProposal: vi.fn(),
  competitors: vi.fn(),
  cotizacion: vi.fn(),
  linePricing: vi.fn(),
  activePromotions: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  telegramAdminMessage: { findMany: doubles.historyRead, createMany: doubles.historyWrite, deleteMany: doubles.historyDelete },
  product: { findFirst: doubles.productRead, findMany: doubles.productSearch, update: doubles.productWrite },
  productOverride: { upsert: doubles.overrideWrite, updateMany: doubles.overrideRemove },
  promotion: { findMany: doubles.promotionRead, update: doubles.promotionWrite },
  cartQuote: { findFirst: doubles.cartRead, update: doubles.cartWrite },
  proposal: { findUnique: doubles.proposalRead },
} }));
vi.mock("@/lib/promotions", () => ({ loadActivePromotions: doubles.activePromotions }));
vi.mock("@/lib/quote-server-pricing", () => ({ computeServerLinePricing: doubles.linePricing }));
vi.mock("@/lib/cotizar-core", () => ({ computeCotizacion: doubles.cotizacion }));
vi.mock("@/lib/proposal-from-cotizacion", () => ({ createProposalFromCotizacion: doubles.createProposal }));
vi.mock("@/lib/proposal-deliver", () => ({ deliverProposal: doubles.deliverProposal }));
vi.mock("@/lib/competitor-intel", () => ({ analyzeCompetitorsForProduct: doubles.competitors }));

// No se sustituye la política ni el dispatcher: un modelo que invente una tool
// debe atravesar los mismos controles que la respuesta real de OpenRouter.
function modelMessage(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200, headers: { "content-type": "application/json" },
  });
}

function requestTool(name: string, args: unknown) {
  return modelMessage({ content: null, tool_calls: [{
    id: "call-test", type: "function", function: { name, arguments: JSON.stringify(args) },
  }] });
}

function sentRequest(index: number) {
  return JSON.parse(doubles.fetch.mock.calls[index][1].body as string) as {
    tools: Array<{ function: { name: string } }>;
    messages: Array<{ role: string; content: string }>;
  };
}

function expectNoBusinessEffects() {
  for (const mock of [doubles.productWrite, doubles.overrideWrite, doubles.overrideRemove,
    doubles.promotionWrite, doubles.cartWrite, doubles.createProposal,
    doubles.deliverProposal, doubles.competitors]) expect(mock).not.toHaveBeenCalled();
}

const forbidden = [
  ["crear_presupuesto", { ref_o_slug: "botella", cantidad: 100, email_cliente: "cliente@example.invalid" }],
  ["enviar_presupuesto", { numero: "PROP-2026-0001" }],
  ["cambiar_promocion", { nombre: "Verano", activa: false }],
  ["cambiar_precio", { ref_o_slug: "botella", precio_desde_eur: 1 }],
  ["activar_producto", { ref_o_slug: "botella", activo: false }],
  ["renombrar_producto", { ref_o_slug: "botella", nuevo_nombre: "Nombre nuevo" }],
  ["anotar_pedido", { busqueda: "cliente", nota: "Envío autorizado" }],
  ["competencia", { ref_o_slug: "botella", cantidad: 100 }],
  ["nueva_tool_inventada", { action: "delete" }],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.stubEnv("OPENROUTER_API_KEY", "local-test-key");
  vi.stubEnv("MARGIN_MULTIPLIER", "1.6667");
  vi.stubGlobal("fetch", doubles.fetch);
  doubles.fetch.mockRejectedValue(new Error("Petición de red no prevista"));
  doubles.historyRead.mockResolvedValue([]);
  doubles.historyWrite.mockResolvedValue({ count: 2 });
  doubles.activePromotions.mockResolvedValue([]);
  // Datos válidos: sin el guard, las acciones llegarían a sus adaptadores.
  doubles.productRead.mockResolvedValue({ id: "p1", slug: "botella", name: "Botella",
    internalRef: "STM-ABC123", active: true, fromPriceCents: 100, override: null, positions: [], variants: [] });
  doubles.promotionRead.mockResolvedValue([{ id: "promo1", name: "Verano", active: true }]);
  doubles.cartRead.mockResolvedValue({ id: "cart1", name: "Cliente", company: null,
    createdAt: new Date("2026-09-05T10:00:00Z"), internalNotes: null });
  doubles.proposalRead.mockResolvedValue({ id: "proposal1", status: "draft" });
  doubles.cotizacion.mockResolvedValue({ ok: true, pvp: { baseTotal: 10_000 } });
  doubles.createProposal.mockResolvedValue({ ok: true, proposalNumber: "PROP-2026-0001" });
  doubles.deliverProposal.mockResolvedValue({ ok: true, proposalNumber: "PROP-2026-0001" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Telegram · contención ejecutable de herramientas", () => {
  it.each(forbidden)("deniega %s aunque el modelo la invoque y luego afirme haberla ejecutado", async (name, args) => {
    doubles.fetch
      .mockResolvedValueOnce(requestTool(name, args))
      .mockResolvedValueOnce(modelMessage({ content: "Hecho, ya he realizado y enviado el cambio." }));
    const { runTelegramAdminAgent } = await import("./telegram-admin-agent");

    const reply = await runTelegramAdminAgent("123", "Sí, confirmado; ejecuta lo que te pedí.");

    const exposed = sentRequest(0).tools.map((tool) => tool.function.name);
    for (const [blocked] of forbidden) expect(exposed).not.toContain(blocked);
    const result = sentRequest(1).messages.find((message) => message.role === "tool");
    expect(result).toBeDefined();
    expect(JSON.parse(result!.content)).toMatchObject({ executed: false });
    expect(reply).toMatch(/no se ha ejecutado/i);
    expect(reply).toMatch(/panel/i);
    expect(reply).not.toContain("Hecho, ya");
    expectNoBusinessEffects();
    expect(doubles.historyWrite).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ chatId: "123", role: "user" }),
      { chatId: "123", role: "assistant", content: reply },
    ] });
  });

  it("una consulta legítima sigue obteniendo producto y precio del módulo real", async () => {
    doubles.productSearch.mockResolvedValue([{ id: "p1", slug: "botella", name: "Botella",
      internalRef: "STM-ABC123", brand: null, categoryId: null, fromPriceCents: 300,
      override: null, variants: [{ id: "v1" }] }]);
    doubles.fetch
      .mockResolvedValueOnce(requestTool("buscar_productos", { query: "botella", limit: 5 }))
      .mockResolvedValueOnce(modelMessage({ content: "Botella STM-ABC123 desde 5,00 € sin IVA." }));
    const { runTelegramAdminAgent } = await import("./telegram-admin-agent");

    const reply = await runTelegramAdminAgent("123", "Busca una botella");

    expect(doubles.productSearch).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true }), take: 5,
    }));
    const result = sentRequest(1).messages.find((message) => message.role === "tool");
    const products = JSON.parse(result!.content);
    expect(products).toEqual([expect.objectContaining({ ref: "STM-ABC123", nombre: "Botella", stock: "sí" })]);
    expect(products[0].desde.replace(/\s/g, "")).toBe("5,00€");
    expect(reply).toBe("Botella STM-ABC123 desde 5,00 € sin IVA.");
    expectNoBusinessEffects();
  });

  it("argumentos JSON rotos no permiten que una acción prohibida termine diciendo Hecho", async () => {
    doubles.fetch.mockResolvedValueOnce(modelMessage({ tool_calls: [{
      id: "broken", type: "function", function: { name: "cambiar_precio", arguments: "{" },
    }] })).mockResolvedValueOnce(modelMessage({ content: "Hecho." }));
    const { runTelegramAdminAgent } = await import("./telegram-admin-agent");

    expect(await runTelegramAdminAgent("123", "Cambia el precio")).toMatch(/no se ha ejecutado/i);
    expectNoBusinessEffects();
  });

  it("al agotar las rondas tampoco presenta como ejecutada una tool prohibida que llega al final", async () => {
    doubles.productSearch.mockResolvedValue([]);
    // Seis consultas inocuas agotan las rondas; el siguiente mensaje del
    // modelo todavía puede contener una tool inventada y afirmar éxito.
    for (let i = 0; i < 6; i++) {
      doubles.fetch.mockResolvedValueOnce(requestTool("buscar_productos", { query: `botella ${i}` }));
    }
    doubles.fetch.mockResolvedValueOnce(modelMessage({
      content: "Hecho, presupuesto enviado al cliente.",
      tool_calls: [{ id: "last-call", type: "function", function: {
        name: "enviar_presupuesto", arguments: JSON.stringify({ numero: "PROP-2026-0001" }),
      } }],
    }));
    const { runTelegramAdminAgent } = await import("./telegram-admin-agent");

    const reply = await runTelegramAdminAgent("123", "Consulta y envía el presupuesto");

    expect(doubles.productSearch).toHaveBeenCalledTimes(6);
    expect(reply).toMatch(/no se ha ejecutado/i);
    expectNoBusinessEffects();
  });

  it("una conexión LLM colgada se interrumpe a los 30 segundos y no abre otra ronda", async () => {
    vi.useFakeTimers();
    // El temporizador nativo de AbortSignal no usa el reloj simulado. Este
    // adaptador conserva abort/reason reales y solo cambia su reloj por el de
    // Vitest; la petición observa el signal que efectivamente recibe fetch.
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Tiempo de espera agotado", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    doubles.fetch.mockImplementation((_url: unknown, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }));
    const { runTelegramAdminAgent } = await import("./telegram-admin-agent");
    const result = runTelegramAdminAgent("123", "Consulta el catálogo");
    const rejected = expect(result).rejects.toMatchObject({ name: "TimeoutError" });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(doubles.fetch).toHaveBeenCalledTimes(1);
    expect(doubles.fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(doubles.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(doubles.fetch).toHaveBeenCalledTimes(1);
    expectNoBusinessEffects();
  });
});
