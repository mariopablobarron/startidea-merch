import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseViolations } from "@/lib/csp-report";

const CONFIG = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

/**
 * Los dos formatos que mandan los navegadores. Aceptar solo uno deja fuera
 * media base de clientes **sin que se note**: no hay error en ninguna parte,
 * simplemente no llegan informes de esos navegadores y la política parece
 * limpia por silencio.
 */
describe("parseViolations", () => {
  it("lee el formato `application/csp-report` (Safari/Firefox, kebab-case)", () => {
    const v = parseViolations({
      "csp-report": {
        "document-uri": "https://merchandising.startidea.es/pay/abc",
        "blocked-uri": "https://m.stripe.network",
        "effective-directive": "frame-src",
      },
    });
    expect(v).toEqual([
      {
        documentUri: "https://merchandising.startidea.es/pay/abc",
        blockedUri: "https://m.stripe.network",
        directive: "frame-src",
      },
    ]);
  });

  it("lee el formato `application/reports+json` (Chrome, array + camelCase)", () => {
    const v = parseViolations([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://merchandising.startidea.es/pay/abc",
          blockedURL: "https://m.stripe.network",
          effectiveDirective: "frame-src",
        },
      },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]?.blockedUri).toBe("https://m.stripe.network");
    expect(v[0]?.directive).toBe("frame-src");
  });

  it("ignora los informes de la Reporting API que no son de CSP", () => {
    expect(
      parseViolations([{ type: "deprecation", body: { id: "x" } }]),
    ).toHaveLength(0);
  });

  it("no revienta con basura y acota los campos largos", () => {
    expect(parseViolations(null)).toEqual([]);
    expect(parseViolations("hola")).toEqual([]);
    expect(parseViolations({})).toEqual([]);
    const largo = parseViolations({
      "csp-report": { "blocked-uri": "x".repeat(5000) },
    });
    expect(largo[0]?.blockedUri.length).toBe(300);
  });

  it("no se traga un array de informes sin fin", () => {
    const muchos = Array.from({ length: 100 }, () => ({
      type: "csp-violation",
      body: { blockedURL: "https://a.example" },
    }));
    expect(parseViolations(muchos)).toHaveLength(20);
  });
});

/**
 * GUARD: una CSP en Report-Only que no informa a ninguna parte no mide nada.
 *
 * Es el defecto que originó esta ruta: la política llevaba semanas en
 * Report-Only **sin `report-uri` ni `report-to`**, así que los informes solo
 * existían si alguien abría una consola a mano. El tramo del checkout —el que
 * hay que medir antes de bloquear, y el único que no se puede recorrer sin un
 * pago real— nunca se midió por eso.
 */
describe("guard: Report-Only tiene que informar a alguna parte", () => {
  const enReportOnly = CONFIG.includes("Content-Security-Policy-Report-Only");

  it("declara `report-uri` y `report-to` mientras esté en Report-Only", () => {
    if (!enReportOnly) return;
    expect(CONFIG).toMatch(/"report-uri \/api\/csp-report"/);
    expect(CONFIG).toMatch(/"report-to csp"/);
  });

  it("declara el grupo `csp` en `Reporting-Endpoints`, o `report-to` no va a ningún sitio", () => {
    if (!enReportOnly) return;
    expect(CONFIG).toMatch(/Reporting-Endpoints/);
    expect(CONFIG).toMatch(/csp="\/api\/csp-report"/);
  });

  it("la ruta a la que apunta existe de verdad", () => {
    const destino = CONFIG.match(/"report-uri (\/[^"]+)"/)?.[1];
    if (!destino) return;
    expect(
      existsSync(join(process.cwd(), "src", "app", destino, "route.ts")),
    ).toBe(true);
  });
});
