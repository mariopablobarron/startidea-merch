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

async function apiGet<T>(path: string, retries = 4): Promise<T | null> {
  let lastErr: string = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await login();
    const r = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) return (await r.json()) as T;
    // Algunos productos sin marcaje devuelven 404 → null silencioso
    if (r.status === 404) return null;
    // Server errors transitorios para algunos refs (HTTP 500 antes era endpoint
    // wrong-lang, pero también puede ser producto sin datos) → silencioso
    if (r.status === 500) return null;
    // 429 Too Many Requests → backoff exponencial 1s, 2s, 4s, 8s, 16s
    if (r.status === 429) {
      const waitMs = Math.min(16_000, 1000 * Math.pow(2, attempt));
      await new Promise((res) => setTimeout(res, waitMs));
      lastErr = `429 (intento ${attempt + 1}/${retries + 1})`;
      continue;
    }
    throw new Error(`Makito ${path} → ${r.status}`);
  }
  // Si tras todos los retries seguimos en 429, throw para que el caller decida
  throw new Error(`Makito ${path} → ${lastErr || "rate limit"}`);
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

/**
 * Resuelve el id de MarkingTechnique para un `technique_ref` de Makito.
 *
 * Prioriza el mapa ref→MK_code construido desde la API de tarifa
 * (markingTechniquesPrices trae technique_ref + code para TODAS las variantes,
 * ej. F → 100116/100216/100316…), de modo que el producto se enlaza SIEMPRE a
 * la técnica limpia que tiene tarifa. Cae al mapa legacy ref→id (por
 * description "...ref NNNNNN") si no hay code resoluble.
 *
 * Motivo: incidente 2026-06-15 — el mapeo sólo por description capturaba 1 ref
 * por código, dejando miles de productos enlazados a técnicas sin tarifa.
 */
export function resolveTechniqueId(
  techRef: string,
  refToCode: Map<string, string>,
  idByCode: Map<string, string>,
  fallbackByRef: Map<string, string>,
): string | undefined {
  const code = refToCode.get(techRef);
  if (code) {
    const id = idByCode.get(code);
    if (id) return id;
  }
  return fallbackByRef.get(techRef);
}

// ─── Enrich main ──────────────────────────────────────────────────────────

export async function runMakitoMarkingEnrich(opts: {
  limit?: number;     // procesar solo N productos (para tests)
  concurrency?: number;
} = {}): Promise<MakitoEnrichResult> {
  const startedAt = new Date();
  const errors: MakitoEnrichResult["errors"] = [];
  // Concurrencia baja por defecto: Makito rate-limita a ~5-10 req/s aprox.
  // 4 paralelo con retry exponencial en 429 funciona en pruebas sin atascos.
  const concurrency = opts.concurrency || 4;

  // Lock anti-solapamiento: dos ejecuciones simultáneas duplicarían
  // MarkingPositions (la tabla no tiene @@unique; el create no es idempotente
  // entre runs concurrentes). Adquirimos un lock atómico vía AdminSetting —
  // create con clave única: solo un proceso gana. TTL 20 min para auto-curar
  // si un run muere sin liberar. (bug-bounty 2026-06-17)
  const LOCK_KEY = "makito_enrich_lock";
  const LOCK_TTL_MS = 20 * 60 * 1000;
  const lockNow = startedAt.getTime();
  let lockAcquired = false;
  try {
    await prisma.adminSetting.create({ data: { key: LOCK_KEY, value: lockNow } });
    lockAcquired = true;
  } catch {
    const existing = await prisma.adminSetting.findUnique({
      where: { key: LOCK_KEY },
      select: { value: true },
    });
    const at = typeof existing?.value === "number" ? existing.value : 0;
    if (lockNow - at > LOCK_TTL_MS) {
      await prisma.adminSetting
        .update({ where: { key: LOCK_KEY }, data: { value: lockNow } })
        .catch(() => {});
      lockAcquired = true;
    }
  }
  if (!lockAcquired) {
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      ok: false,
      productsScanned: 0,
      productsEnriched: 0,
      positionsCreated: 0,
      techniquesLinked: 0,
      durationMs: 0,
      errors: [{ ref: "_lock", message: "Enrich ya en curso (lock activo); abortado para evitar posiciones duplicadas." }],
    };
  }

  // 1. Cargar traducciones globales (1 call, 5 620 entries)
  const translationsResp = await apiGet<{ markings: MkTranslation[] }>(
    "/markingsTranslations/1",
  );
  const translations = new Map<number, string>();
  for (const t of translationsResp?.markings || []) {
    if (t.print_area_id && t.txt) translations.set(t.print_area_id, t.txt);
  }

  // 2. Productos Makito con marking — SOLO los que aún tienen DEFAULT virtual
  //    o NO tienen positions reales. Idempotente: re-disparar el endpoint NO
  //    re-procesa productos ya enriquecidos (evita duplicados).
  const products = await prisma.product.findMany({
    where: {
      supplier: "makito",
      markingTechniqueHint: { not: null },
      // NO procesar productos que YA tienen positions reales (non-DEFAULT)
      NOT: {
        positions: {
          some: { positionId: { not: "DEFAULT" } },
        },
      },
    },
    select: { id: true, supplierRef: true },
    take: opts.limit,
  });

  let productsEnriched = 0;
  let positionsCreated = 0;
  let techniquesLinked = 0;

  // Mapas de resolución técnica (consultados antes del loop para evitar N queries).
  //  - idByCode:       MK_<code> → techniqueId (técnica limpia con tarifa)
  //  - refToCode:      technique_ref → MK_<code> (desde la API de tarifa; cubre
  //                    TODAS las variantes de ref por código)
  //  - techniqueByRef: technique_ref → techniqueId (fallback legacy por description)
  const techniques = await prisma.markingTechnique.findMany({
    where: { code: { startsWith: "MK_" } },
    select: { id: true, code: true, description: true },
  });
  const idByCode = new Map<string, string>();
  const techniqueByRef = new Map<string, string>();
  for (const t of techniques) {
    idByCode.set(t.code, t.id);
    // El description tiene "Makito X · ref 100111" — extraemos el ref
    const m = t.description?.match(/ref (\d+)/);
    if (m) techniqueByRef.set(m[1], t.id);
  }
  const refToCode = new Map<string, string>();
  try {
    const priceResp = await apiGet<{
      techniques: Array<{ technique_ref: string; code: string }>;
    }>("/markingTechniquesPrices");
    for (const t of priceResp?.techniques || []) {
      const raw = (t.code ?? "").toString().trim();
      if (t.technique_ref && raw && raw.toLowerCase() !== "null") {
        refToCode.set(String(t.technique_ref), `MK_${raw}`);
      }
    }
  } catch {
    // Si falla la API de tarifa, seguimos con el fallback por description
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
              const techId = resolveTechniqueId(techRef, refToCode, idByCode, techniqueByRef);
              if (!techId) continue; // técnica no resoluble (ni por code ni por ref)
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

  // Liberar el lock. Si el run muriera antes de aquí, el TTL (20 min) deja que
  // la siguiente ejecución lo robe.
  await prisma.adminSetting.delete({ where: { key: LOCK_KEY } }).catch(() => {});

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
