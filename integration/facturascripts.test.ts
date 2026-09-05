import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readPaymentItemsFingerprint } from "../src/lib/payment-quote-fingerprint";
import { prisma } from "../src/lib/prisma";
import { syncPaymentToFacturaScripts } from "../src/lib/facturascripts-sync";
const api = vi.hoisted(() => ({ upsertCliente: vi.fn(), upsertProducto: vi.fn(), crearFactura: vi.fn(), marcarPagada: vi.fn() }));
vi.mock("../src/lib/facturascripts", () => ({ facturaScripts: api, FSError: class extends Error {}, FS_IDEMPRESA: 2, FS_CODSERIE: "A", FS_CODALMACEN: "LOCAL" }));
async function fixture() {
  const cart = await prisma.cartQuote.create({ data: {
    name: "Local", email: "local@example.invalid", vatNumber: "B12345678", items: { create: {
      productSlug: "local-product", productRef: "LOCAL", productName: "Producto local", quantity: 1, unitPriceClientCents: 100,
    } },
  } });
  return prisma.payment.create({ data: { cartId: cart.id, amountCents: 121, currency: "EUR", kind: "FULL", status: "PAID" } });
}
const claim = (id: string) => prisma.adminSetting.findUniqueOrThrow({ where: { key: `facturascripts_invoice:${id}` } });
beforeEach(async () => {
  vi.clearAllMocks();
  expect((await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`)[0].name).toBe("merch_cto_payments_test");
  await prisma.adminSetting.deleteMany(); await prisma.cartQuote.deleteMany();
  api.upsertCliente.mockResolvedValue(undefined); api.upsertProducto.mockResolvedValue(undefined);
  api.crearFactura.mockResolvedValue({ doc: { idfactura: 7, codigo: "LOCAL-7", total: 1.21 } });
  api.marcarPagada.mockResolvedValue(undefined);
});
afterAll(async () => { await prisma.$disconnect(); });
describe("FacturaScripts: claim común en PostgreSQL, transporte simulado", () => {
  it("dos callers simultáneos solo crean una factura y conservan alreadySynced", async () => {
    const p = await fixture();
    const results = await Promise.all([syncPaymentToFacturaScripts(p.id), syncPaymentToFacturaScripts(p.id)]);
    expect(results.some(r => r.ok)).toBe(true);
    expect(api.crearFactura).toHaveBeenCalledTimes(1);
    expect((await claim(p.id)).value).toMatchObject({ status: "DONE" });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: true, alreadySynced: true });
  });
  it("timeout tras iniciar no permite recreación desde otro caller", async () => {
    const p = await fixture(); api.crearFactura.mockRejectedValueOnce(new Error("transport timeout"));
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    expect(api.crearFactura).toHaveBeenCalledTimes(1);
    expect((await claim(p.id)).value).toMatchObject({ status: "REVIEW_REQUIRED" });
  });
  it("fallo al marcar pagada conserva identidad remota y no emite otra", async () => {
    const p = await fixture(); api.marcarPagada.mockRejectedValueOnce(new Error("unknown result"));
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    expect((await claim(p.id)).value).toMatchObject({ status: "REVIEW_REQUIRED", issued: { id: 7, code: "LOCAL-7" } });
    await syncPaymentToFacturaScripts(p.id); expect(api.crearFactura).toHaveBeenCalledTimes(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).fsInvoiceId).toBeNull();
  });
  it("fallo SQL al cerrar no permite otra emisión", async () => {
    const p = await fixture();
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION cto_reject_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."fsInvoiceId" IS NOT NULL THEN RAISE EXCEPTION 'injected local failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER cto_invoice_failure BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION cto_reject_invoice()`);
    try { expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false }); }
    finally { await prisma.$executeRawUnsafe(`DROP TRIGGER cto_invoice_failure ON "Payment"`); }
    await syncPaymentToFacturaScripts(p.id); expect(api.crearFactura).toHaveBeenCalledTimes(1);
    expect((await claim(p.id)).value).toMatchObject({ status: "REVIEW_REQUIRED", issued: { id: 7 } });
  });
  it("valida la misma composición que se envía y rechaza versiones incompatibles", async () => {
    const p = await fixture();
    expect(await syncPaymentToFacturaScripts(p.id, "0".repeat(64))).toMatchObject({ ok: false });
    expect(api.crearFactura).not.toHaveBeenCalled(); expect(await prisma.adminSetting.count()).toBe(0);
    const hash = await readPaymentItemsFingerprint(prisma, p.cartId);
    api.upsertCliente.mockImplementationOnce(async () => {
      await prisma.cartQuoteItem.updateMany({ where: { cartId: p.cartId }, data: { quantity: 1000 } });
    });
    expect(await syncPaymentToFacturaScripts(p.id, hash)).toMatchObject({ ok: true });
    expect(api.crearFactura.mock.calls[0][0].lineas[0].cantidad).toBe(1);
  });

  it("validación previa corregida puede reintentarse sin claim previo", async () => {
    const p = await fixture();
    await prisma.cartQuote.update({ where: { id: p.cartId }, data: { vatNumber: null } });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    expect(await prisma.adminSetting.count()).toBe(0); expect(api.crearFactura).not.toHaveBeenCalled();
    await prisma.cartQuote.update({ where: { id: p.cartId }, data: { vatNumber: "B12345678" } });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: true });
  });
  it("referencias históricas completas no emiten; parciales y errores inciertos requieren conciliación", async () => {
    const p = await fixture();
    await prisma.payment.update({ where: { id: p.id }, data: { fsInvoiceId: 8, fsInvoiceCode: "HIST-8" } });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ alreadySynced: true });
    await prisma.payment.update({ where: { id: p.id }, data: { fsInvoiceCode: null } });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    await prisma.payment.update({ where: { id: p.id }, data: { fsInvoiceId: null, fsError: "historical timeout" } });
    expect(await syncPaymentToFacturaScripts(p.id)).toMatchObject({ ok: false });
    expect(api.crearFactura).not.toHaveBeenCalled();
  });
});
