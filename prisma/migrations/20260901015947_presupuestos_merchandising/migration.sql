-- CreateEnum
CREATE TYPE "PresupuestoEstado" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'CADUCADO');

-- CreateEnum
CREATE TYPE "PresupuestoLineaTipo" AS ENUM ('PRODUCTO', 'MARCAJE', 'CLICHE', 'OTRO');

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "estado" "PresupuestoEstado" NOT NULL DEFAULT 'BORRADOR',
    "asunto" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteContacto" TEXT,
    "clienteReferencia" TEXT,
    "clienteCif" TEXT,
    "clienteDireccion" TEXT,
    "clienteEmail" TEXT,
    "validezDias" INTEGER NOT NULL DEFAULT 30,
    "plazoMinDias" INTEGER NOT NULL DEFAULT 8,
    "plazoMaxDias" INTEGER NOT NULL DEFAULT 15,
    "margenObjetivoPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "notaTecnicaTitulo" TEXT,
    "notaTecnica" TEXT,
    "cierreTexto" TEXT,
    "produccionCentroEspecialEmpleo" BOOLEAN NOT NULL DEFAULT false,
    "condiciones" JSONB,
    "createdBy" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresupuestoPartida" (
    "id" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "PresupuestoPartida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresupuestoOpcion" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "recomendada" BOOLEAN NOT NULL DEFAULT false,
    "fotoProductoUrl" TEXT,
    "fotoMarcajeUrl" TEXT,
    "medidas" TEXT,
    "materiales" TEXT,
    "incluye" TEXT,
    "usoRecomendado" TEXT,
    "marcajeTecnica" TEXT,
    "marcajeTintas" TEXT,
    "marcajePosicion" TEXT,
    "marcajeAreaMaxima" TEXT,
    "marcajeFormatoArte" TEXT,

    CONSTRAINT "PresupuestoOpcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresupuestoLinea" (
    "id" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" "PresupuestoLineaTipo" NOT NULL DEFAULT 'PRODUCTO',
    "concepto" TEXT NOT NULL,
    "descripcion" TEXT,
    "referencia" TEXT,
    "imagenUrl" TEXT,
    "cantidad" INTEGER NOT NULL,
    "costeUnitCents" INTEGER NOT NULL,
    "margenPct" DOUBLE PRECISION,
    "pvpUnitCents" INTEGER NOT NULL,

    CONSTRAINT "PresupuestoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_numero_key" ON "Presupuesto"("numero");

-- CreateIndex
CREATE INDEX "Presupuesto_estado_idx" ON "Presupuesto"("estado");

-- CreateIndex
CREATE INDEX "Presupuesto_createdAt_idx" ON "Presupuesto"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_anio_secuencia_key" ON "Presupuesto"("anio", "secuencia");

-- CreateIndex
CREATE INDEX "PresupuestoPartida_presupuestoId_idx" ON "PresupuestoPartida"("presupuestoId");

-- CreateIndex
CREATE INDEX "PresupuestoOpcion_partidaId_idx" ON "PresupuestoOpcion"("partidaId");

-- CreateIndex
CREATE INDEX "PresupuestoLinea_opcionId_idx" ON "PresupuestoLinea"("opcionId");

-- AddForeignKey
ALTER TABLE "PresupuestoPartida" ADD CONSTRAINT "PresupuestoPartida_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresupuestoOpcion" ADD CONSTRAINT "PresupuestoOpcion_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "PresupuestoPartida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresupuestoLinea" ADD CONSTRAINT "PresupuestoLinea_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "PresupuestoOpcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
