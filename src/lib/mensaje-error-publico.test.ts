import { describe, it, expect } from "vitest";
import { mensajeErrorPublico } from "./mensaje-error-publico";

describe("mensajeErrorPublico", () => {
  it("deja pasar el mensaje que no delata a nadie", () => {
    expect(mensajeErrorPublico(new Error("fetch failed"))).toBe("fetch failed");
  });

  it("tapa el mensaje de fetch que lleva la URL del CDN del proveedor dentro", () => {
    // El mensaje literal de Node 22 con una URL sin esquema. Es el caso que
    // motiva el fichero: el único mensaje de `fetch` que incluye la URL.
    const e = new TypeError("Failed to parse URL from cdn1.midocean.com/x.jpg");
    expect(mensajeErrorPublico(e)).toBe("error de red");
  });

  it("tapa también los otros CDN de proveedor, no solo el de la fuga de julio", () => {
    for (const host of ["imgresources.makito.es", "publicatalogue.com", "adivin.com"]) {
      const e = new TypeError(`Failed to parse URL from ${host}/a.jpg`);
      expect(mensajeErrorPublico(e), host).toBe("error de red");
    }
  });

  it("tapa el nombre del proveedor aunque no venga en una URL", () => {
    expect(mensajeErrorPublico(new Error("timeout hablando con MidOcean"))).toBe("error de red");
  });

  it("usa el genérico que se le pase, para poder describir la operación", () => {
    const e = new TypeError("Failed to parse URL from cdn1.midocean.com/x.jpg");
    expect(mensajeErrorPublico(e, "no se pudo descargar la imagen")).toBe(
      "no se pudo descargar la imagen",
    );
  });

  it("no revienta con lo que no es un Error", () => {
    expect(mensajeErrorPublico("cdn1.midocean.com")).toBe("error de red");
    expect(mensajeErrorPublico(null)).toBe("error de red");
    expect(mensajeErrorPublico(new Error(""))).toBe("error de red");
  });
});
