-- Integración con FacturaScripts: campos para sincronizar Payment con
-- la factura emitida en facturas.startidea.tech (módulo merch → FS).
--
-- fsInvoiceCode: el `codigo` visible de la factura en FacturaScripts
--   (p.ej. "1511"). NO confundir con invoiceNumber (numeración interna del
--   merch en formato YYYY-NNNN).
-- fsInvoiceId: el `idfactura` (PK numérica). Necesario para llamar a los
--   endpoints /pagarFacturaCliente/:id y /exportarFacturaCliente/:id.
-- fsSyncedAt: timestamp de cuándo se creó/actualizó la factura en FS.
-- fsError: último error de sincronización (si lo hubo). Vacío al reintentar OK.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fsInvoiceCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fsInvoiceId" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fsSyncedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "fsError" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_fsInvoiceCode_idx" ON "Payment"("fsInvoiceCode");
