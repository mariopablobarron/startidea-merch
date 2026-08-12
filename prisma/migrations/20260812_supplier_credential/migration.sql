-- Módulo Proveedores, Fase C: credenciales de proveedor cifradas en BD
-- (AES-256-GCM, lib/secret-box), con fallback a process.env mientras no se
-- rellene el formulario del admin. docs/spec-proveedores-admin.md.
CREATE TABLE "SupplierCredential" (
    "code" "SupplierCode" NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "configKeys" TEXT[],
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCredential_pkey" PRIMARY KEY ("code")
);
