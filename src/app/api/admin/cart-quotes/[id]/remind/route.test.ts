/**
 * Tests para POST /api/admin/cart-quotes/[id]/remind.
 *
 * Esta ruta manda un email REAL al cliente y la dispara un botón del panel de
 * admin. Lo que se fija aquí es el orden claim-then-send: el cooldown de 48h
 * tiene que reclamarse ANTES de enviar, porque comprobarlo antes y apuntarlo
 * después deja una ventana entera —la llamada a Resend— en la que un segundo
 * clic lee el mismo `reminderSentAt` vacío y manda el recordatorio dos veces al
 * mismo cliente.
 *
 * Es la tercera vez que aparece esta forma en el proyecto (emails de drip en
 * `599a91e`, publicación en redes en `8b0c615`), así que los tests prueban el
 * INVARIANTE («dos disparos solapados mandan un solo email») y no que se haya
 * llamado a tal función: el cerrojo se ejerce de verdad contra una tabla falsa
 * con la condición evaluada de forma síncrona, porque si la evaluase después de
 * un `await` las dos llamadas ganarían y el test mentiría.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
const requireAdminSecret = vi.fn();

/** Traza del orden real de los efectos: quién reclama, quién envía, quién suelta. */
let calls: string[] = [];

/** Fila única de CartQuote, mutada como lo haría la BD. */
type Fila = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  status: string;
  reminderSentAt: Date | null;
  reminderCount: number;
  estimatedTotalCents: number | null;
  items: { quantity: number; productName: string; primaryImageUrl: string | null; totalClientCents: number | null }[];
};

let fila: Fila;

const COOLDOWN_MS = 48 * 3_600_000;

/**
 * `updateMany` con la MISMA semántica que usa la ruta: filtra por id, por
 * status y por el cooldown, y devuelve cuántas filas tocó. La comprobación y la
 * escritura son síncronas antes de devolver la promesa — así dos llamadas
 * concurrentes compiten de verdad y solo una puede contar 1.
 */
function updateManyReal(args: {
  where: { id: string; status?: { in: string[] }; OR?: { reminderSentAt: null | { lt: Date } }[] };
  data: { reminderSentAt: Date; reminderCount: { increment: number } };
}): Promise<{ count: number }> {
  calls.push("claim");
  const w = args.where;
  if (w.id !== fila.id) return Promise.resolve({ count: 0 });
  if (w.status && !w.status.in.includes(fila.status)) return Promise.resolve({ count: 0 });
  if (w.OR) {
    const cutoff = w.OR.find((c) => c.reminderSentAt !== null)?.reminderSentAt as { lt: Date } | undefined;
    const libre = fila.reminderSentAt === null || (cutoff ? fila.reminderSentAt < cutoff.lt : false);
    if (!libre) return Promise.resolve({ count: 0 });
  }
  fila.reminderSentAt = args.data.reminderSentAt;
  fila.reminderCount += args.data.reminderCount.increment;
  return Promise.resolve({ count: 1 });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cartQuote: {
      findUnique: (args: { select?: Record<string, unknown> }) => {
        // La relectura del camino "perdí la reclamación" pide solo 2 campos.
        if (args.select && !("items" in args.select)) {
          return Promise.resolve({ status: fila.status, reminderSentAt: fila.reminderSentAt });
        }
        return Promise.resolve(fila ? { ...fila } : null);
      },
      updateMany: (args: Parameters<typeof updateManyReal>[0]) => updateManyReal(args),
      update: (args: { data: { reminderSentAt: Date | null; reminderCount: { decrement: number } } }) => {
        calls.push("release");
        fila.reminderSentAt = args.data.reminderSentAt;
        fila.reminderCount -= args.data.reminderCount.decrement;
        return Promise.resolve(fila);
      },
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  sendEmail: (...a: unknown[]) => {
    calls.push("send");
    return sendEmail(...a);
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAdminSecret: (...a: unknown[]) => requireAdminSecret(...a),
}));

import { POST } from "./route";

function makeReq(body: Record<string, unknown> = {}): Request {
  return new Request("https://test/api/admin/cart-quotes/cart_1/remind", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-secret": "s3cr3t" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "cart_1" });

function nuevaFila(over: Partial<Fila> = {}): Fila {
  return {
    id: "cart_1",
    name: "Ana Ruiz",
    email: "ana@example.com",
    company: "Acme",
    status: "NEW",
    reminderSentAt: null,
    reminderCount: 0,
    estimatedTotalCents: 24_000,
    items: [
      { quantity: 3, productName: "Camiseta", primaryImageUrl: null, totalClientCents: 12_000 },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  fila = nuevaFila();
  requireAdminSecret.mockReturnValue({ ok: true });
  sendEmail.mockResolvedValue({ ok: true });
});

describe("POST remind · el cooldown se reclama antes de enviar", () => {
  it("el camino feliz envía y deja el cooldown puesto", async () => {
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, sentTo: "ana@example.com", reminderCount: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fila.reminderSentAt).not.toBeNull();
    expect(fila.reminderCount).toBe(1);
  });

  it("reclama ANTES de enviar, no después", async () => {
    await POST(makeReq(), { params });
    // Es el orden lo que cierra la ventana: reclamar después de enviar no
    // impide el segundo email, solo lo apunta.
    expect(calls).toEqual(["claim", "send"]);
  });

  it("DOS CLICS SOLAPADOS mandan UN SOLO email al cliente", async () => {
    // El caso real: el admin pulsa dos veces el botón del panel. Antes de este
    // arreglo los dos leían reminderSentAt=null y los dos enviaban.
    let liberarEnvio: () => void = () => {};
    const envioEnCurso = new Promise<void>((r) => {
      liberarEnvio = r;
    });
    sendEmail.mockImplementation(async () => {
      await envioEnCurso; // el primer envío sigue en vuelo cuando entra el segundo
      return { ok: true };
    });

    const a = POST(makeReq(), { params });
    const b = POST(makeReq(), { params });
    liberarEnvio();
    const [ra, rb] = await Promise.all([a, b]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const estados = [ra.status, rb.status].sort();
    expect(estados).toEqual([200, 429]);
    expect(fila.reminderCount).toBe(1);
  });

  it("dentro del cooldown no envía, y responde 429", async () => {
    fila.reminderSentAt = new Date(Date.now() - 3 * 3_600_000); // hace 3h
    fila.reminderCount = 1;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("Cooldown activo") });
    expect(fila.reminderCount).toBe(1); // no se ha tocado el contador
  });

  it("pasado el cooldown vuelve a enviar", async () => {
    fila.reminderSentAt = new Date(Date.now() - COOLDOWN_MS - 60_000);
    fila.reminderCount = 1;
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(fila.reminderCount).toBe(2);
  });

  it("un carrito ya cerrado no recibe recordatorio", async () => {
    fila.status = "CONFIRMED";
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("si Resend dice que no lo envió, se devuelve el cooldown para poder reintentar", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "dominio no verificado" });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(502);
    // El fallo es conocido (no salió el email): bloquear 48h al admin por un
    // error de Resend sería castigar al que no falló.
    expect(calls).toEqual(["claim", "send", "release"]);
    expect(fila.reminderSentAt).toBeNull();
    expect(fila.reminderCount).toBe(0);

    sendEmail.mockResolvedValue({ ok: true });
    const reintento = await POST(makeReq(), { params });
    expect(reintento.status).toBe(200);
  });

  it("si la llamada revienta a medias, el cooldown se queda puesto", async () => {
    // Aquí no se sabe si el email salió. La dirección segura es no repetir:
    // un recordatorio de menos se manda a mano, uno de más ya se leyó.
    sendEmail.mockRejectedValue(new Error("socket hang up"));
    await expect(POST(makeReq(), { params })).rejects.toThrow("socket hang up");
    expect(calls).toEqual(["claim", "send"]);
    expect(fila.reminderSentAt).not.toBeNull();
  });

  it("sin secreto de admin no llega a mirar el carrito", async () => {
    requireAdminSecret.mockReturnValue({ ok: false, reason: "unauthorized", status: 401 });
    const res = await POST(makeReq(), { params });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
