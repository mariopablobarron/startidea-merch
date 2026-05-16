-- CreateTable: ProductSlugRedirect — slugs antiguos (con supplier SKU) que ahora
-- redirigen 301 hacia el slug actual del producto.
CREATE TABLE IF NOT EXISTS "ProductSlugRedirect" (
    "id" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSlugRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductSlugRedirect_oldSlug_key" ON "ProductSlugRedirect"("oldSlug");
CREATE INDEX IF NOT EXISTS "ProductSlugRedirect_productId_idx" ON "ProductSlugRedirect"("productId");

-- AddForeignKey: SET NULL si el producto se borra (la entrada queda como tumba sin destino)
ALTER TABLE "ProductSlugRedirect"
  ADD CONSTRAINT "ProductSlugRedirect_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
