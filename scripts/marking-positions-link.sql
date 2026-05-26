-- CIFRA: vincular positions con MarkingTechnique según tokens del hint
WITH cif_tokens AS (
  SELECT
    mp.id AS position_id,
    UNNEST(
      regexp_split_to_array(
        UPPER(regexp_replace(p."markingTechniqueHint", '[()\s]', '', 'g')),
        ','
      )
    ) AS token
  FROM "MarkingPosition" mp
  JOIN "Product" p ON p.id = mp."productId"
  WHERE p.supplier = 'cifra'
)
INSERT INTO "MarkingTechniqueOnPosition" ("positionId", "techniqueId", "isDefault", "maxColors")
SELECT DISTINCT ct.position_id, mt.id, false, 4
FROM cif_tokens ct
JOIN "MarkingTechnique" mt ON mt.code = 'CIF_' || ct.token
WHERE ct.token != ''
ON CONFLICT ("positionId", "techniqueId") DO NOTHING;

-- MAKITO: vincular positions con MarkingTechnique MK_ según códigos del printcode "F(1),N(8)"
WITH mk_tokens AS (
  SELECT
    mp.id AS position_id,
    UNNEST(
      regexp_split_to_array(
        UPPER(regexp_replace(p."markingTechniqueHint", '\([^)]*\)|\s', '', 'g')),
        ','
      )
    ) AS token
  FROM "MarkingPosition" mp
  JOIN "Product" p ON p.id = mp."productId"
  WHERE p.supplier = 'makito'
)
INSERT INTO "MarkingTechniqueOnPosition" ("positionId", "techniqueId", "isDefault", "maxColors")
SELECT DISTINCT mkt.position_id, mt.id, false, 4
FROM mk_tokens mkt
JOIN "MarkingTechnique" mt ON mt.code = 'MK_' || mkt.token
WHERE mkt.token != ''
ON CONFLICT ("positionId", "techniqueId") DO NOTHING;

-- Limpieza: eliminar MarkingPosition vacías (sin ningún technique vinculado)
DELETE FROM "MarkingPosition" mp
WHERE mp."positionId" = 'DEFAULT'
  AND NOT EXISTS (SELECT 1 FROM "MarkingTechniqueOnPosition" WHERE "positionId" = mp.id);

-- Reporte final
SELECT
  p.supplier,
  COUNT(DISTINCT p.id) AS productos_total,
  COUNT(DISTINCT mp.id) AS positions,
  COUNT(DISTINCT mtp."techniqueId") AS techniques_unicas_usadas,
  COUNT(mtp.*) AS total_vinculos
FROM "Product" p
LEFT JOIN "MarkingPosition" mp ON mp."productId" = p.id
LEFT JOIN "MarkingTechniqueOnPosition" mtp ON mtp."positionId" = mp.id
WHERE p.supplier IN ('cifra', 'makito', 'midocean')
GROUP BY p.supplier
ORDER BY p.supplier;
