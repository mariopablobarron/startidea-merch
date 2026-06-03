/**
 * POST /api/admin/suppliers/makito/discover-catalog
 *
 * Fase 2 discovery — descubre qué formato devuelven los endpoints
 * "feed" de la API B2B sin tocar la BD ni el catálogo local.
 *
 * Llama a los 4 endpoints listing en paralelo y devuelve el shape
 * crudo + content-type + tamaño. Con esa info se diseña el parser
 * en Fase 3 (UPSERT real).
 *
 * Soporta query ?download=true para que (si los listings devuelven
 * URLs) también descargue los primeros 500 bytes del primer archivo
 * de cada listing para confirmar formato (JSON|XML).
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-session";
import {
  getCatalogFiles,
  getStockFiles,
  getPriceListFiles,
  getPrintConfigFiles,
  downloadFile,
  getMakitoB2BMode,
} from "@/lib/suppliers/makito-b2b";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingResult = {
  endpoint: string;
  ok: boolean;
  elapsedMs: number;
  shape?: string; // "array(N)" | "object" | "string" | "other"
  topLevelKeys?: string[];
  firstItemKeys?: string[];
  rawPreview?: unknown;
  firstFileDownload?: {
    url: string;
    status: number;
    contentType: string | null;
    contentLength: number | null;
    bodyPreview: string;
  };
  error?: string;
};

async function probe(
  endpoint: string,
  fn: () => Promise<unknown>,
  attemptDownload: boolean,
): Promise<ListingResult> {
  const t0 = Date.now();
  try {
    const data = await fn();
    const elapsedMs = Date.now() - t0;
    let shape: string;
    let topLevelKeys: string[] | undefined;
    let firstItemKeys: string[] | undefined;
    let firstFileUrl: string | undefined;

    if (Array.isArray(data)) {
      shape = `array(${data.length})`;
      if (data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
        firstItemKeys = Object.keys(data[0]);
        // Heurística: buscar campo URL en el primer item
        for (const k of firstItemKeys) {
          const v = (data[0] as Record<string, unknown>)[k];
          if (
            typeof v === "string" &&
            (v.startsWith("http") || v.startsWith("/"))
          ) {
            firstFileUrl = v.startsWith("http")
              ? v
              : `https://apis.makito.es${v}`;
            break;
          }
        }
      }
    } else if (data && typeof data === "object") {
      shape = "object";
      topLevelKeys = Object.keys(data as Record<string, unknown>);
      // Si tiene un campo array dentro, miramos su primer elemento
      for (const k of topLevelKeys) {
        const v = (data as Record<string, unknown>)[k];
        if (Array.isArray(v) && v.length > 0) {
          if (typeof v[0] === "object" && v[0] !== null) {
            firstItemKeys = Object.keys(v[0]);
            for (const kk of firstItemKeys) {
              const vv = (v[0] as Record<string, unknown>)[kk];
              if (
                typeof vv === "string" &&
                (vv.startsWith("http") || vv.startsWith("/"))
              ) {
                firstFileUrl = vv.startsWith("http")
                  ? vv
                  : `https://apis.makito.es${vv}`;
                break;
              }
            }
          }
          break;
        }
      }
    } else if (typeof data === "string") {
      shape = "string";
    } else {
      shape = "other";
    }

    const result: ListingResult = {
      endpoint,
      ok: true,
      elapsedMs,
      shape,
      topLevelKeys,
      firstItemKeys,
      // Sólo dejamos vista previa de los primeros 3 elementos para evitar
      // payload masivo en la respuesta (podrían ser MBs).
      rawPreview: Array.isArray(data)
        ? data.slice(0, 3)
        : data && typeof data === "object"
          ? sliceObject(data as Record<string, unknown>, 5)
          : data,
    };

    if (attemptDownload && firstFileUrl) {
      try {
        const dl = await downloadFile(firstFileUrl);
        result.firstFileDownload = { url: firstFileUrl, ...dl };
      } catch (e) {
        result.firstFileDownload = {
          url: firstFileUrl,
          status: 0,
          contentType: null,
          contentLength: null,
          bodyPreview: `(download failed: ${e instanceof Error ? e.message : "error"})`,
        };
      }
    }

    return result;
  } catch (e) {
    return {
      endpoint,
      ok: false,
      elapsedMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function sliceObject(o: Record<string, unknown>, maxKeys: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Object.keys(o).slice(0, maxKeys);
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      out[k] = `[array of ${v.length}]`;
    } else if (v && typeof v === "object") {
      out[k] = `[object: ${Object.keys(v as Record<string, unknown>).join(",")}]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const url = new URL(req.url);
  const attemptDownload = url.searchParams.get("download") === "true";

  const mode = await getMakitoB2BMode();
  const results = await Promise.all([
    probe("/catalog/files", getCatalogFiles, attemptDownload),
    probe("/stock/files", getStockFiles, attemptDownload),
    probe("/price-list/files", getPriceListFiles, attemptDownload),
    probe("/print-config/files", getPrintConfigFiles, attemptDownload),
  ]);

  return NextResponse.json({
    ok: true,
    mode,
    attemptedDownload: attemptDownload,
    results,
    note:
      "Fase 2 discovery — sin tocar BD. Para implementar UPSERT real " +
      "necesito ver firstItemKeys + firstFileDownload.contentType para " +
      "diseñar el parser.",
  });
}
