import { describe, it, expect } from "vitest";
import { elegirChromium, nombreArchivoPdf, RUTAS_CHROMIUM } from "./presupuesto-pdf";

describe("elegirChromium", () => {
  it("se queda con el primero que existe", () => {
    const existe = (r: string) => r === "/usr/bin/chromium";
    expect(elegirChromium(["/no/existe", "/usr/bin/chromium", "/otro"], existe)).toBe(
      "/usr/bin/chromium",
    );
  });

  it("devuelve null si no hay ninguno — y quien llama lo traduce en un 503", () => {
    expect(elegirChromium(["/a", "/b"], () => false)).toBeNull();
  });

  it("CHROMIUM_PATH manda sobre las rutas por defecto", () => {
    // Es lo que permite mover el binario sin tocar código.
    const conEnv = ["/ruta/del/compose", ...RUTAS_CHROMIUM];
    expect(elegirChromium(conEnv, () => true)).toBe("/ruta/del/compose");
  });

  it("la lista por defecto incluye la ruta de Alpine, que es la de la imagen", () => {
    expect(RUTAS_CHROMIUM).toContain("/usr/bin/chromium-browser");
  });
});

describe("nombreArchivoPdf", () => {
  it("arma el nombre con cliente y número", () => {
    expect(nombreArchivoPdf("Tus Territorios", "PRE-2026-0001")).toBe(
      "Presupuesto_Tus_Territorios_PRE-2026-0001_Startidea.pdf",
    );
  });

  it("quita tildes y eñes en vez de dejarlas viajar en una cabecera HTTP", () => {
    expect(nombreArchivoPdf("Diseño Gráfico Ñandú", "PRE-2026-0007")).toBe(
      "Presupuesto_Diseno_Grafico_Nandu_PRE-2026-0007_Startidea.pdf",
    );
  });

  it("no deja que el nombre del cliente rompa la cabecera ni salte de carpeta", () => {
    // El nombre lo escribe una persona en un formulario: comillas, barras y
    // saltos de línea acabarían dentro de Content-Disposition.
    const nombre = nombreArchivoPdf('../../etc/passwd" ; rm -rf /', "PRE-2026-0002");
    expect(nombre).not.toMatch(/["/\;\n]/);
    expect(nombre.startsWith("Presupuesto_")).toBe(true);
  });

  it("un cliente sin letras usables no deja el nombre a medias", () => {
    expect(nombreArchivoPdf("///", "PRE-2026-0003")).toBe(
      "Presupuesto_Cliente_PRE-2026-0003_Startidea.pdf",
    );
  });

  it("no se va de largo aunque el cliente tenga un nombre kilométrico", () => {
    const largo = "Asociación " + "muy ".repeat(60) + "larga";
    expect(nombreArchivoPdf(largo, "PRE-2026-0004").length).toBeLessThan(110);
  });
});
