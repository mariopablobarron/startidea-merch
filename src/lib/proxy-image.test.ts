/**
 * Red de seguridad para el proxy de imágenes de proveedor.
 *
 * Este módulo es lo único que impide que las URLs crudas del CDN del proveedor
 * (cdn1.midocean.com, imgresources.makito.es, publicatalogue.com…) salgan a un
 * cliente público. Ya hubo una fuga por aquí (2026-07-20, /api/recommend), así
 * que fijamos el contrato con tests: host de proveedor → siempre `/api/m/<hash>`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsert = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      upsert: (...a: unknown[]) => upsert(...a),
    },
  },
}));

import { mediaHash, proxyImageUrl, ensureMediaAsset, ensureMediaAssets } from "./proxy-image";

const MIDOCEAN = "https://cdn1.midocean.com/foo/bar.jpg";
const MAKITO = "https://imgresources.makito.es/x/y.png";
const CIFRA = "https://www.publicatalogue.com/img/z.jpg";
const OWN_CDN = "https://cdn.tresmilmillones.es/logo.png"; // no es proveedor

describe("mediaHash", () => {
  it("es determinístico: la misma URL da el mismo hash", () => {
    expect(mediaHash(MIDOCEAN)).toBe(mediaHash(MIDOCEAN));
  });

  it("produce 16 chars del alfabeto sin ambiguos (no 0/O/1/I/L)", () => {
    const h = mediaHash(MIDOCEAN);
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[2-9A-HJ-NP-Z]{16}$/);
    expect(h).not.toMatch(/[01OIL]/);
  });

  it("URLs distintas dan hashes distintos", () => {
    expect(mediaHash(MIDOCEAN)).not.toBe(mediaHash(MAKITO));
  });
});

describe("proxyImageUrl (síncrono, sin BD)", () => {
  it("host de proveedor → /api/m/<hash>", () => {
    expect(proxyImageUrl(MIDOCEAN)).toBe(`/api/m/${mediaHash(MIDOCEAN)}`);
    expect(proxyImageUrl(MAKITO)).toBe(`/api/m/${mediaHash(MAKITO)}`);
    expect(proxyImageUrl(CIFRA)).toBe(`/api/m/${mediaHash(CIFRA)}`);
  });

  it("NUNCA deja pasar el host del proveedor en la salida", () => {
    for (const raw of [MIDOCEAN, MAKITO, CIFRA]) {
      const out = proxyImageUrl(raw)!;
      expect(out).toMatch(/^\/api\/m\//);
      expect(out).not.toMatch(/midocean|makito|publicatalogue|xindao|adivin/i);
    }
  });

  it("URL propia (no proveedor) se devuelve tal cual", () => {
    expect(proxyImageUrl(OWN_CDN)).toBe(OWN_CDN);
  });

  it("ruta relativa (ya proxy) se devuelve intacta", () => {
    expect(proxyImageUrl("/api/m/ABCDEFGH23456789")).toBe("/api/m/ABCDEFGH23456789");
  });

  it("null / vacío / no-string → null", () => {
    expect(proxyImageUrl(null)).toBeNull();
    expect(proxyImageUrl(undefined)).toBeNull();
    expect(proxyImageUrl("")).toBeNull();
    expect(proxyImageUrl("   ")).toBeNull();
  });
});

describe("ensureMediaAsset (async, upsert en MediaAsset)", () => {
  beforeEach(() => upsert.mockClear());

  it("host de proveedor → registra el asset y devuelve el proxy", async () => {
    const out = await ensureMediaAsset(MIDOCEAN, "product-variant");
    expect(out).toBe(`/api/m/${mediaHash(MIDOCEAN)}`);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as {
      where: { hash: string };
      create: { hash: string; originalUrl: string; kind?: string };
    };
    expect(arg.where.hash).toBe(mediaHash(MIDOCEAN));
    expect(arg.create.originalUrl).toBe(MIDOCEAN);
    expect(arg.create.kind).toBe("product-variant");
  });

  it("URL propia (no proveedor) → NO toca BD y la devuelve tal cual", async () => {
    const out = await ensureMediaAsset(OWN_CDN);
    expect(out).toBe(OWN_CDN);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("valor ya proxy (/api/m/...) → idempotente, sin upsert", async () => {
    const already = "/api/m/ABCDEFGH23456789";
    const out = await ensureMediaAsset(already);
    expect(out).toBe(already);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("null → null sin tocar BD", async () => {
    expect(await ensureMediaAsset(null)).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("ensureMediaAssets (array — migración de ProductVariant.images[])", () => {
  beforeEach(() => upsert.mockClear());

  it("proxifica cada URL de proveedor y descarta nulos", async () => {
    const out = await ensureMediaAssets([MIDOCEAN, null, MAKITO, undefined], "product-variant");
    expect(out).toEqual([`/api/m/${mediaHash(MIDOCEAN)}`, `/api/m/${mediaHash(MAKITO)}`]);
    // ninguna salida delata al proveedor
    for (const url of out) expect(url).not.toMatch(/midocean|makito/i);
  });

  it("un array ya proxificado se devuelve intacto (idempotente)", async () => {
    const proxied = [`/api/m/${mediaHash(MIDOCEAN)}`, `/api/m/${mediaHash(MAKITO)}`];
    const out = await ensureMediaAssets(proxied);
    expect(out).toEqual(proxied);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("array vacío → array vacío", async () => {
    expect(await ensureMediaAssets([])).toEqual([]);
  });
});
