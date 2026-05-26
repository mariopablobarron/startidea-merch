/**
 * Enriquece las MarkingPositions de productos Makito con datos REALES del
 * API (no genéricas DEFAULT).
 *
 * Por cada producto Makito con marking, consulta:
 *   - /markings/{ref}            → print_area_id + medidas + area_img + technique_ref
 *   - /markingTechniques/1/{ref} → nombre legible de cada técnica (idioma 1=esp)
 *   - /imgResources/{ref}        → URLs absolutas imágenes
 * Y consume traducciones globales:
 *   - /markingsTranslations/1    → 5 620 entradas print_area_id → texto legible
 *
 * Output: MarkingPosition reales (positionId con texto legible + area_img
 * proxy), vinculadas a MarkingTechnique MK_<technique_ref>.
 *
 * Reemplaza las DEFAULT virtuales creadas anteriormente.
 *
 * Coste: ~4 500 productos × 3 calls = 13 500 requests. Con paralelismo 10
 * → ~5-10 min total.
 */

import { prisma } from "@/lib/prisma";
import { ensureMediaAsset } from "@/lib/proxy-image";

const API_BASE = process.env.MAKITO_API_BASE || "https://data.makito.es/api";
const EMAIL = process.env.MAKITO_API_EMAIL || "";
const PASSWORD = process.env.MAKITO_API_PASSWORD || "";

const IMG_BASE = "https://imgresources.makito.es/media/img_web";

export type MakitoEnrichResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  productsScanned: number;
  productsEnriched: number;
  positionsCreated: number;
  techniquesLinked: number;
  durationMs: number;
  errors: Array<{ ref: string; message: string }>;
};

// ─── Auth ─────────────────────────────────────────────────────────────────
let cachedToken: string | null = null;

async function login(): Promise<string> {
  if (cachedToken) return cachedToken;
  const r = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Makito login ${r.status}`);
  const d = (await r.json()) as { msg?: string; token?: string };
  const tok = d.token || d.msg;
  if (!tok) throw new Error("Makito sin token");
  cachedToken = tok;
  return tok;
}

async function apiGet<T>(path: string): Promise<T | null> {
  const token = await login();
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    // Algunos productos sin marcaje devuelven 404 — silencioso
    if (r.status === 404 || r.status === 500) return null;
    throw new Error(`Makito ${path} → ${r.status}`);
  }
  return (await r.json()) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────

type MkMarking = {
  ref: string;
  technique_ref: string;
  print_area_id: number;
  max_colors: string | number;
  position?: string;
  width?: number;
  height?: number;
  area_img?: string;
};

type MkTechnique = {
  ref: string;
  technique_ref: string;
  name: string;
};

type MkImgResource = {
  ref: string;
  url: string;
  main?: number;
};

type MkTranslation = {
  print_area_id: number;
  lang: number;
  txt: string;
};

// ─── Enrich main ──────────────────────────────────────────────────────────

export async function runMakitoMarkingEnrich(opts: {
  limit?: number;     // procesar solo N productos (para tests)
  concurrency?: number;
} = {}): Promise<MakitoEnrichResult> {
  const startedAt = new Date();
  const errors: MakitoEnrichResult["errors"] = [];
  const concurrency = opts.concurrency || 8;

  // 1. Cargar traducciones globales (1 call, 5 620 entries)
  const translationsResp = await apiGet<{ markings: MkTranslation[] }>(
    "/markingsTranslations/1",
  );
  const translations = new Map<number, string>();
  for (const t of translationsResp?.markings || []) {
    if (t.print_area_id && t.txt) translations.set(t.print_area_id, t.txt);
  }

  // 2. Productos Makito con marking
  const products = await prisma.product.findMany({
    where: {
      supplier: "makito",
      markingTechniqueHint: { not: null },
    },
    select: { id: true, supplierRef: true },
    take: opts.limit,
  });

  let productsEnriched = 0;
  let positionsCreated = 0;
  let techniquesLinked = 0;

  // Cache global de MarkingTechnique by technique_ref (consultamos antes
  // del loop para evitar N queries)
  const techniques = await prisma.markingTechnique.findMany({
    where: { code: { startsWith: "MK_" } },
    select: { id: true, code: true, description: true },
  });
  const techniqueByRef = new Map<string, string>();
  for (const t of techniques) {
    // El description tiene "Makito X · ref 100111" — extraemos el ref
    const m = t.description?.match(/ref (\d+)/);
    if (m) techniqueByRef.set(m[1], t.id);
  }

  // 3. Procesar productos en chunks paralelos
  for (let i = 0; i < products.length; i += concurrency) {
    const chunk = products.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (p) => {
        try {
          // Fetch 2 endpoints (imgResources opcional, se usa solo para área urls)
          const [markings, ] = await Promise.all([
            apiGet<{ markings: MkMarking[] }>(`/markings/${p.supplierRef}`),
            // tech names ya están en MarkingTechnique global, no necesitamos /markingTechniques/1/{ref}
          ]);
          if (!markings?.markings?.length) return;

          // Borrar MarkingPosition DEFAULT existentes para regenerar limpio
          await prisma.markingPosition.deleteMany({
            where: { productId: p.id, positionId: "DEFAULT" },
          });

          // Agrupar por print_area_id
          const byArea = new Map<number, MkMarking[]>();
          for (const m of markings.markings) {
            if (!byArea.has(m.print_area_id)) byArea.set(m.print_area_id, []);
            byArea.get(m.print_area_id)!.push(m);
          }

          // Para cada print_area_id único → 1 MarkingPosition
          let prodPositions = 0;
          for (const [areaId, areaMarkings] of byArea.entries()) {
            const first = areaMarkings[0];
            const positionTxt =
              translations.get(areaId) || first.position || `Área ${areaId}`;

            // Imagen del área (proxy para no exponer makito CDN)
            // area_img viene como "1011-A1.jpg" → URL absoluta
            let areaImgProxy: string | null = null;
            if (first.area_img) {
              const padded = String(p.supplierRef).padStart(4, "0");
              const refDir = padded.slice(0, -3) + "000";
              const absUrl = `${IMG_BASE}/${refDir}/${p.supplierRef}/areas/${first.area_img}`;
              areaImgProxy = await ensureMediaAsset(absUrl, "marking-position");
            }

            const position = await prisma.markingPosition.create({
              data: {
                productId: p.id,
                positionId: positionTxt.slice(0, 100),
                maxWidthMm: first.width || null,
                maxHeightMm: first.height || null,
                imageUrl: areaImgProxy,
              },
            });
            prodPositions++;

            // Vincular técnicas de esta área (cada (areaId, technique_ref) único)
            const techniqueRefs = Array.from(new Set(areaMarkings.map((m) => m.technique_ref)));
            for (const techRef of techniqueRefs) {
              const techId = techniqueByRef.get(techRef);
              if (!techId) continue; // técnica no cargada en BD (debug)
              const maxColors = Math.max(
                ...areaMarkings
                  .filter((m) => m.technique_ref === techRef)
                  .map((m) => Number(m.max_colors) || 1),
              );
              await prisma.markingTechniqueOnPosition
                .create({
                  data: {
                    positionId: position.id,
                    techniqueId: techId,
                    isDefault: false,
                    maxColors: maxColors > 0 ? maxColors : 1,
                  },
                })
                .catch(() => {}); // race silent
              techniquesLinked++;
            }
          }
          positionsCreated += prodPositions;
          if (prodPositions > 0) productsEnriched++;
        } catch (e) {
          errors.push({
            ref: p.supplierRef,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }),
    );
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    ok: errors.length === 0,
    productsScanned: products.length,
    productsEnriched,
    positionsCreated,
    techniquesLinked,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    errors: errors.slice(0, 50),
  };
}
