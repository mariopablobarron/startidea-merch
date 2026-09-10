-- ============================================================================
-- Acceso de SOLO LECTURA para cotizar — Startidea Málaga, S.L.
--
-- Lo ejecuta Mario contra la base de datos de producción. Da lo justo para
-- montar un presupuesto (coste al tramo, marcaje, cliché, medidas y márgenes)
-- y NADA más. En concreto NO da:
--   · CartQuote / CustomerUser / Payment  → datos personales de clientes (RGPD)
--   · AdminUser                            → hashes de contraseña
--   · AdminSetting entera                  → guarda 'incoming_webhook_secret'
--
-- Es el fichero que nombra `comprobarRolDeLectura` en src/lib/cotizar-desde-bd.ts
-- cuando el rol resulta ser más ancho de la cuenta.
--
-- PROBADO el 2026-09-09 contra un PostgreSQL 16 con el esquema real de Prisma
-- (`prisma migrate deploy`) y datos de ensayo: los nombres de tabla existen
-- todos, `scripts/cotizar-desde-bd.ts` cotiza de punta a punta con este rol
-- —tanto la vía de escalas (midocean/Makito) como la de SupplierMarkingRule
-- (Cifra)—, las cuatro tablas prohibidas dan «permission denied» y la vista
-- devuelve solo la fila de márgenes.
--
-- Ejecutar como un rol que ya tenga acceso a esas tablas (el dueño de la BD).
-- ============================================================================

-- 1) El rol, sin nada por defecto. Pon una contraseña NUEVA y larga.
--    NO la escribas en el chat ni la comitees: va en la configuración del
--    entorno, dentro de DATABASE_URL.
CREATE ROLE claude_lectura LOGIN PASSWORD 'CAMBIA-ESTO-POR-ALGO-LARGO';

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM claude_lectura;
GRANT CONNECT ON DATABASE startidea_merch TO claude_lectura;  -- ajusta el nombre
GRANT USAGE   ON SCHEMA   public          TO claude_lectura;

-- 2) Solo las tablas del catálogo que se leen para cotizar.
--    (Prisma no usa @@map, así que los nombres van en PascalCase entrecomillado.)
GRANT SELECT ON
  "Product",
  "Category",
  "ProductOverride",
  "ProductVariant",
  "PriceTier",
  "MarkingPosition",
  "MarkingTechnique",
  "MarkingTechniqueOnPosition",
  "MarkingPriceScale",
  "ProductMarkingPrice",
  "PrintManipulation",
  -- Reglas de marcaje de Cifra: las lee quoteMarkingNet para las técnicas
  -- CIF_*. Faltaba en la primera versión; sin ella, cotizar un producto de
  -- Cifra fallaba con «permission denied» a mitad de camino. El ensayo del
  -- 09-sep confirmó que esta vía se usa de verdad: con la regla puesta,
  -- CIF_* cotiza; sin ella, cae a «sin tarifa fiable».
  "SupplierMarkingRule"
TO claude_lectura;

-- 3) Los márgenes, SOLO esa clave. La vista corre con los permisos de quien la
--    crea, así que el rol lee la fila sin tener acceso a la tabla: el secreto
--    del webhook que vive al lado NO sale. Comprobado en el ensayo.
CREATE OR REPLACE VIEW margenes_presupuestos AS
  SELECT key, value
    FROM "AdminSetting"
   WHERE key = 'presupuestos.margenes';

GRANT SELECT ON margenes_presupuestos TO claude_lectura;

-- 4) Comprobación: esto debe FALLAR con «permission denied».
--    Si devuelve filas, el grant se ha ido de la mano.
--      SET ROLE claude_lectura;
--      SELECT count(*) FROM "CartQuote";
--      SELECT count(*) FROM "AdminSetting";
--      RESET ROLE;
--
--    El script la hace sola al arrancar (`comprobarRolDeLectura`) y se para si
--    alguna de las cuatro responde. Los «permission denied» que Prisma pinta en
--    rojo durante esa comprobación son el resultado BUENO.

-- 5) Para revocarlo el día de mañana:
--      DROP OWNED BY claude_lectura;
--      DROP ROLE claude_lectura;
