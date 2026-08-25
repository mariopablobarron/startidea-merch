/**
 * Tests de POST /api/proposal/send, centrados en el MODO ENSAYO (`dryRun`).
 *
 * Por qué existe el ensayo: esta ruta no se podía probar de punta a punta
 * contra producción sin causar tres efectos reales — un email a una persona,
 * una fila `Proposal` y un aviso a los admins por Telegram. El ensayo recorre
 * el mismo camino y corta antes de todos ellos.
 *
 * Lo que se prueba aquí no es que el ensayo "devuelva ok", sino lo contrario:
 * que **ninguno de los cinco efectos externos llega a ocurrir**. Un test que
 * solo mirase el 200 daría verde con un ensayo que envía el email igualmente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const proposalCreate = vi.fn();
const proposalUpdate = vi.fn();
const productViewUpsert = vi.fn();
const productFindMany = vi.fn();
const sendProposalEmail = vi.fn();
const notifyTelegram = vi.fn();
const notifyAdmins = vi.fn();
const generateProposalNumber = vi.fn();
const requireAdminSession = vi.fn();
const renderToBuffer = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proposal: {
      create: (...a: unknown[]) => proposalCreate(...a),
      update: (...a: unknown[]) => proposalUpdate(...a),
    },
    product: { findMany: (...a: unknown[]) => productFindMany(...a) },
    productView: { upsert: (...a: unknown[]) => productViewUpsert(...a) },
  },
}));
vi.mock("@/lib/proposal-mailer", () => ({
  sendProposalEmail: (...a: unknown[]) => sendProposalEmail(...a),
}));
vi.mock("@/lib/telegram", () => ({
  notifyTelegram: (...a: unknown[]) => notifyTelegram(...a),
  escapeTgHtml: (s: string) => s,
}));
vi.mock("@/lib/notify-admin", () => ({
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));
vi.mock("@/lib/notification-rules", () => ({
  isNotificationEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/proposal-number", () => ({
  generateProposalNumber: (...a: unknown[]) => generateProposalNumber(...a),
}));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminSession: (...a: unknown[]) => requireAdminSession(...a),
}));
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (...a: unknown[]) => renderToBuffer(...a),
}));
vi.mock("@/lib/recommender-proposal-pdf", () => ({ RecommenderProposalPdf: () => null }));
vi.mock("@/lib/proposal-token", () => ({ signProposalToken: () => "tok" }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));

import { POST } from "./route";

const ITEM = {
  description: "Bidón de acero 500ml",
  notFound: false,
  quantity: 100,
  technique: "láser",
  colorRequested: "negro",
  product: {
    slug: "bidon-acero",
    name: "Bidón acero",
    ref: "STM-001",
    url: "https://merchandising.startidea.es/catalogo/bidon-acero",
    primaryImageUrl: "/api/m/abc",
  },
  unitPriceCents: 500,
  markingPerUnitCents: 50,
  markingSetupCents: 3000,
  totalCents: 58000,
  priceSource: "tier" as const,
};

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://test/api/proposal/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const CUERPO = { email: "cliente@ejemplo.es", name: "Ana", quoteItems: [ITEM] };

/** Los cinco efectos que el ensayo promete no causar. */
function efectosExternos() {
  return {
    filaProposal: proposalCreate.mock.calls.length,
    email: sendProposalEmail.mock.calls.length,
    telegram: notifyTelegram.mock.calls.length,
    avisoAdmins: notifyAdmins.mock.calls.length,
    productView: productViewUpsert.mock.calls.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateProposalNumber.mockResolvedValue("PROP-2026-0013");
  renderToBuffer.mockResolvedValue(Buffer.alloc(4096));
  requireAdminSession.mockResolvedValue({
    ok: true,
    session: { userId: "u1", email: "ceo@startidea.es", name: "CEO", role: "CEO" },
  });
  sendProposalEmail.mockResolvedValue({ ok: true, id: "resend-1" });
  proposalCreate.mockResolvedValue({ id: "p1" });
  proposalUpdate.mockResolvedValue({});
  productFindMany.mockResolvedValue([]);
  notifyTelegram.mockResolvedValue(undefined);
  notifyAdmins.mockResolvedValue(undefined);
});

describe("POST /api/proposal/send — modo ensayo", () => {
  it("no causa NINGUNO de los cinco efectos externos", async () => {
    const res = await POST(makeReq({ ...CUERPO, dryRun: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, dryRun: true, wouldSendTo: "cliente@ejemplo.es" });
    expect(efectosExternos()).toEqual({
      filaProposal: 0,
      email: 0,
      telegram: 0,
      avisoAdmins: 0,
      productView: 0,
    });
  });

  it("renderiza el PDF de verdad — si no, el ensayo no probaría nada", async () => {
    // El render es donde se rompen las cosas: un ensayo que lo saltara sería
    // un 200 que no dice nada del camino real.
    const res = await POST(makeReq({ ...CUERPO, dryRun: true }));
    const body = await res.json();

    expect(renderToBuffer).toHaveBeenCalledTimes(1);
    expect(body.pdfBytes).toBe(4096);
    expect(body.totals.totalCents).toBeGreaterThan(0);
  });

  it("dice que el número NO queda reservado", async () => {
    // Nada se persiste, así que ese mismo número lo usará la siguiente
    // propuesta real. Prometer lo contrario induciría a error al leer el log.
    const body = await (await POST(makeReq({ ...CUERPO, dryRun: true }))).json();
    expect(body.proposalNumber).toBe("PROP-2026-0013");
    expect(body.numeroReservado).toBe(false);
  });

  it("un fallo del PDF en ensayo no despierta a nadie por Telegram", async () => {
    renderToBuffer.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ ...CUERPO, dryRun: true }));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "PDF_RENDER_FAILED", dryRun: true });
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it("sin credencial de admin el ensayo se rechaza", async () => {
    // El ensayo quita el rastro en BD; si además fuera anónimo, sería una vía
    // para hacer renderizar PDFs al servidor sin dejar ninguno.
    requireAdminSession.mockResolvedValue({ ok: false, status: 401, reason: "No autenticado" });
    const res = await POST(makeReq({ ...CUERPO, dryRun: true }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "DRY_RUN_REQUIERE_ADMIN" });
    // Y ni siquiera llega a renderizar: el cerrojo va antes del trabajo caro.
    expect(renderToBuffer).not.toHaveBeenCalled();
    expect(efectosExternos()).toEqual({
      filaProposal: 0, email: 0, telegram: 0, avisoAdmins: 0, productView: 0,
    });
  });
});

describe("POST /api/proposal/send — el camino real sigue intacto", () => {
  // El riesgo de añadir un modo es romper el otro. Estos dos lo vigilan.
  it("sin dryRun sí persiste, envía el email y avisa", async () => {
    const res = await POST(makeReq(CUERPO));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, proposalNumber: "PROP-2026-0013" });
    expect(body.dryRun).toBeUndefined();
    expect(proposalCreate).toHaveBeenCalledTimes(1);
    expect(sendProposalEmail).toHaveBeenCalledTimes(1);
    expect(notifyTelegram).toHaveBeenCalledTimes(1);
  });

  it("el camino real no pide credencial de admin: la ruta es pública", async () => {
    requireAdminSession.mockResolvedValue({ ok: false, status: 401, reason: "No autenticado" });
    const res = await POST(makeReq(CUERPO));

    expect(res.status).toBe(200);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(sendProposalEmail).toHaveBeenCalledTimes(1);
  });

  it("`dryRun: false` es el camino real, no el ensayo", async () => {
    const res = await POST(makeReq({ ...CUERPO, dryRun: false }));
    expect(res.status).toBe(200);
    expect(proposalCreate).toHaveBeenCalledTimes(1);
    expect(sendProposalEmail).toHaveBeenCalledTimes(1);
  });
});
