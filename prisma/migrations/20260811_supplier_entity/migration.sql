-- Módulo Proveedores, Fase A: entidad Supplier (contacto + condiciones
-- comerciales), separada del catálogo (Product) y de la tarifa de marcaje
-- (SupplierMarkingRule). docs/spec-proveedores-admin.md.
CREATE TABLE "Supplier" (
    "code" "SupplierCode" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hasAutoSync" BOOLEAN NOT NULL DEFAULT false,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "paymentTerms" TEXT,
    "minOrderNotes" TEXT,
    "leadTimeDays" INTEGER,
    "defaultShippingCents" INTEGER,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("code")
);
