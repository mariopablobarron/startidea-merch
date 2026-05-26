-- ==========================================================================
-- A) Cifra: 20 MarkingTechnique globales (prefijo CIF_) + posición DEFAULT
--    por producto con hint + vínculos según tokens del hint.
-- ==========================================================================

-- A1. Crear 20 MarkingTechnique para Cifra (idempotente)
INSERT INTO "MarkingTechnique" (id, code, name, description, "pricingType", "setupCents", "setupRepeatCents", "hasNextColour")
VALUES
  ('mtech_cif_A',         'CIF_A',         'Tampografía',                       'Cifra · A',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_B',         'CIF_B',         'Tampografía',                       'Cifra · B',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_C',         'CIF_C',         'Tampografía',                       'Cifra · C',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_D',         'CIF_D',         'Tampografía',                       'Cifra · D',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_E',         'CIF_E',         'Tampografía / Serigrafía',          'Cifra · E',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_F',         'CIF_F',         'Serigrafía',                        'Cifra · F',          'NumberOfPositions', 3500, NULL, true),
  ('mtech_cif_G',         'CIF_G',         'Serigrafía',                        'Cifra · G',          'NumberOfPositions', 3500, NULL, true),
  ('mtech_cif_DIGITAL',   'CIF_DIGITAL',   'Impresión digital (CMYK)',          'Cifra · DIGITAL',    'NumberOfPositions', 2500, NULL, false),
  ('mtech_cif_DTF',       'CIF_DTF',       'Transferencia DTF (textil)',        'Cifra · DTF',        'NumberOfPositions', 0,    NULL, false),
  ('mtech_cif_BORDADO',   'CIF_BORDADO',   'Bordado',                           'Cifra · BORDADO',    'NumberOfPositions', 5000, NULL, true),
  ('mtech_cif_L',         'CIF_L',         'Láser metal/lacado',                'Cifra · L',          'NumberOfPositions', 4000, NULL, false),
  ('mtech_cif_LL',        'CIF_LL',        'Láser metal/lacado',                'Cifra · LL',         'NumberOfPositions', 4000, NULL, false),
  ('mtech_cif_LCO1',      'CIF_LCO1',      'Láser CO2 (cristal/madera)',        'Cifra · LCO1',       'NumberOfPositions', 4000, NULL, false),
  ('mtech_cif_LCO2',      'CIF_LCO2',      'Láser CO2 (cristal/madera)',        'Cifra · LCO2',       'NumberOfPositions', 4000, NULL, false),
  ('mtech_cif_T',         'CIF_T',         'Termograbado (piel/PU)',            'Cifra · T',          'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_TC',        'CIF_TC',        'Termograbado (piel/PU)',            'Cifra · TC',         'NumberOfPositions', 3000, NULL, true),
  ('mtech_cif_ADHESIVO',  'CIF_ADHESIVO',  'Adhesivo',                          'Cifra · ADHESIVO',   'NumberOfPositions', 0,    NULL, false),
  ('mtech_cif_SUB1',      'CIF_SUB1',      'Sublimación',                       'Cifra · SUB1',       'NumberOfPositions', 0,    NULL, false),
  ('mtech_cif_SUB2',      'CIF_SUB2',      'Sublimación',                       'Cifra · SUB2',       'NumberOfPositions', 0,    NULL, false),
  ('mtech_cif_SUBT',      'CIF_SUBT',      'Sublimación',                       'Cifra · SUBT',       'NumberOfPositions', 0,    NULL, false)
ON CONFLICT (code) DO NOTHING;

-- A2. Una escala dummy por técnica (la cotización real viene del helper que consulta ProductMarkingPrice o SupplierMarkingRule)
INSERT INTO "MarkingPriceScale" (id, "techniqueCode", "rangeId", "areaFromCm2", "areaToCm2", "minQty", "unitCostCents", "nextColourCostCents", "updatedAt")
SELECT 'mps_' || code, code, NULL, NULL, NULL, 1, 100, 50, NOW()
FROM "MarkingTechnique"
WHERE code LIKE 'CIF_%'
  AND NOT EXISTS (SELECT 1 FROM "MarkingPriceScale" mps WHERE mps."techniqueCode" = "MarkingTechnique".code AND mps."rangeId" IS NULL AND mps."minQty" = 1);

-- A3. MarkingPosition DEFAULT por producto Cifra con hint (idempotente)
INSERT INTO "MarkingPosition" (id, "productId", "positionId", "maxWidthMm", "maxHeightMm")
SELECT 'mpos_cif_' || p.id, p.id, 'DEFAULT', NULL, NULL
FROM "Product" p
WHERE p.supplier = 'cifra'
  AND p."markingTechniqueHint" IS NOT NULL
  AND p."markingTechniqueHint" != ''
  AND NOT EXISTS (SELECT 1 FROM "MarkingPosition" mp WHERE mp."productId" = p.id);

-- A4. MarkingTechniqueOnPosition: vincular cada position Cifra con las técnicas que matchean su hint
WITH cif_pairs AS (
  SELECT
    mp.id AS position_id,
    mt.id AS technique_id
  FROM "MarkingPosition" mp
  JOIN "Product" p ON p.id = mp."productId" AND p.supplier = 'cifra'
  JOIN "MarkingTechnique" mt ON mt.code LIKE 'CIF_%'
  WHERE p."markingTechniqueHint" IS NOT NULL
    AND mt.code = 'CIF_' || ANY(
      SELECT regexp_split_to_array(UPPER(regexp_replace(p."markingTechniqueHint", '[\(\)\s]', '', 'g')), ',')
    )
)
INSERT INTO "MarkingTechniqueOnPosition" ("positionId", "techniqueId", "isDefault", "maxColors")
SELECT position_id, technique_id, false, 4
FROM cif_pairs
ON CONFLICT ("positionId", "techniqueId") DO NOTHING;

-- ==========================================================================
-- B) Makito: 1 MarkingPosition DEFAULT por producto con printcode + vínculos
--    a MarkingTechnique MK_X según los códigos del printcode.
--    Formato Makito printcode: "F(1),N(8)" → códigos F, N
-- ==========================================================================

-- B1. MarkingPosition DEFAULT por producto Makito con hint
INSERT INTO "MarkingPosition" (id, "productId", "positionId", "maxWidthMm", "maxHeightMm")
SELECT 'mpos_mak_' || p.id, p.id, 'DEFAULT', NULL, NULL
FROM "Product" p
WHERE p.supplier = 'makito'
  AND p."markingTechniqueHint" IS NOT NULL
  AND p."markingTechniqueHint" != ''
  AND NOT EXISTS (SELECT 1 FROM "MarkingPosition" mp WHERE mp."productId" = p.id);

-- B2. Vincular position Makito con técnicas MK_X usando regex sobre printcode
WITH mk_pairs AS (
  SELECT
    mp.id AS position_id,
    mt.id AS technique_id
  FROM "MarkingPosition" mp
  JOIN "Product" p ON p.id = mp."productId" AND p.supplier = 'makito'
  JOIN "MarkingTechnique" mt ON mt.code LIKE 'MK\_%' ESCAPE '\'
  WHERE p."markingTechniqueHint" IS NOT NULL
    -- printcode format "F(1),N(8)" — extraemos códigos antes de "("
    AND mt.code = 'MK_' || ANY(
      SELECT regexp_split_to_array(
        UPPER(regexp_replace(p."markingTechniqueHint", '\([^)]*\)|\s', '', 'g')),
        ','
      )
    )
)
INSERT INTO "MarkingTechniqueOnPosition" ("positionId", "techniqueId", "isDefault", "maxColors")
SELECT position_id, technique_id, false, 4
FROM mk_pairs
ON CONFLICT ("positionId", "techniqueId") DO NOTHING;

-- ==========================================================================
-- Reporte
-- ==========================================================================

SELECT
  p.supplier,
  COUNT(DISTINCT p.id) AS productos,
  COUNT(DISTINCT mp.id) AS positions_creadas,
  COUNT(DISTINCT mtp."techniqueId") AS techniques_vinculadas
FROM "Product" p
LEFT JOIN "MarkingPosition" mp ON mp."productId" = p.id
LEFT JOIN "MarkingTechniqueOnPosition" mtp ON mtp."positionId" = mp.id
WHERE p.supplier IN ('cifra', 'makito')
GROUP BY p.supplier
ORDER BY p.supplier;
