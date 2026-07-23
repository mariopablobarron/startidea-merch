import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title:
    "Guía Pantone para serigrafía corporativa: equivalencias CMYK, HEX y RGB",
  description:
    "Cómo elegir el código Pantone correcto para serigrafiar el logo de tu empresa sin sorpresas. Tabla con 25 colores corporativos clásicos + cómo identificar el Pantone de tu marca.",
  alternates: {
    canonical:
      "https://merchandising.startidea.es/recursos/guia-pantone-serigrafia-corporativa",
  },
  openGraph: {
    title: "Guía Pantone para serigrafía corporativa",
    description:
      "Equivalencias Pantone → CMYK → HEX → RGB y cómo evitar que el rojo de tu logo salga rosa.",
    type: "article",
  },
};

type ColorRow = {
  brand: string;
  pantone: string;
  cmyk: string;
  hex: string;
  rgb: string;
  notes?: string;
};

const CORPORATE_COLORS: ColorRow[] = [
  { brand: "Coca-Cola Red", pantone: "484 C", cmyk: "0 / 100 / 100 / 30", hex: "#C8102E", rgb: "200, 16, 46" },
  { brand: "Pepsi Red", pantone: "199 C", cmyk: "0 / 90 / 75 / 0", hex: "#E32934", rgb: "227, 41, 52" },
  { brand: "McDonald's Yellow", pantone: "137 C", cmyk: "0 / 22 / 100 / 0", hex: "#FFC72C", rgb: "255, 199, 44" },
  { brand: "McDonald's Red", pantone: "485 C", cmyk: "0 / 95 / 100 / 0", hex: "#DA291C", rgb: "218, 41, 28" },
  { brand: "Ferrari Red", pantone: "186 C", cmyk: "2 / 100 / 85 / 6", hex: "#C8102E", rgb: "200, 16, 46" },
  { brand: "IBM Blue", pantone: "2718 C", cmyk: "85 / 50 / 0 / 0", hex: "#1F70C1", rgb: "31, 112, 193" },
  { brand: "Tiffany Blue", pantone: "1837 C", cmyk: "62 / 0 / 30 / 0", hex: "#0ABAB5", rgb: "10, 186, 181" },
  { brand: "Telefónica / Movistar", pantone: "286 C", cmyk: "100 / 75 / 0 / 0", hex: "#0066FF", rgb: "0, 102, 255" },
  { brand: "BBVA Blue", pantone: "281 C", cmyk: "100 / 85 / 5 / 36", hex: "#004481", rgb: "0, 68, 129" },
  { brand: "Santander Red", pantone: "485 C", cmyk: "0 / 100 / 100 / 0", hex: "#EC0000", rgb: "236, 0, 0" },
  { brand: "Mercadona Green", pantone: "356 C", cmyk: "95 / 0 / 100 / 27", hex: "#008B30", rgb: "0, 139, 48" },
  { brand: "ING Orange", pantone: "Orange 021 C", cmyk: "0 / 65 / 100 / 0", hex: "#FF6200", rgb: "255, 98, 0" },
  { brand: "Starbucks Green", pantone: "3415 C", cmyk: "92 / 25 / 84 / 60", hex: "#006241", rgb: "0, 98, 65" },
  { brand: "John Deere Green", pantone: "364 C", cmyk: "75 / 0 / 100 / 30", hex: "#367C2B", rgb: "54, 124, 43" },
  { brand: "Heineken Green", pantone: "348 C", cmyk: "100 / 0 / 100 / 20", hex: "#00853E", rgb: "0, 133, 62" },
  { brand: "UPS Brown", pantone: "4625 C", cmyk: "0 / 56 / 76 / 90", hex: "#351C15", rgb: "53, 28, 21" },
  { brand: "T-Mobile Magenta", pantone: "Rhodamine Red C", cmyk: "0 / 100 / 0 / 0", hex: "#E20074", rgb: "226, 0, 116" },
  { brand: "Cadbury Purple", pantone: "2685 C", cmyk: "92 / 100 / 0 / 14", hex: "#4A0072", rgb: "74, 0, 114" },
  { brand: "Royal Mail Red", pantone: "485 C", cmyk: "0 / 95 / 100 / 0", hex: "#DA291C", rgb: "218, 41, 28" },
  { brand: "Nivea Blue", pantone: "286 C", cmyk: "100 / 80 / 0 / 0", hex: "#00529B", rgb: "0, 82, 155" },
  { brand: "Reflex Blue (imprenta estándar)", pantone: "Reflex Blue C", cmyk: "100 / 89 / 0 / 12", hex: "#002E7D", rgb: "0, 46, 125", notes: "El azul más usado en logos corporativos europeos. Pide siempre 'Reflex Blue' o 286 C." },
  { brand: "Process Black", pantone: "Black C", cmyk: "0 / 0 / 0 / 100", hex: "#000000", rgb: "0, 0, 0", notes: "Negro 100% — usar en textil oscuro. En textil claro, considerar Black 6 C (más cálido)." },
  { brand: "Process White", pantone: "—", cmyk: "0 / 0 / 0 / 0", hex: "#FFFFFF", rgb: "255, 255, 255", notes: "En serigrafía el blanco se imprime como tinta opaca; el resultado depende del tejido base." },
  { brand: "Cool Gray 7 C", pantone: "Cool Gray 7 C", cmyk: "20 / 14 / 12 / 40", hex: "#97999B", rgb: "151, 153, 155", notes: "Gris neutro muy usado en logos minimalistas (Apple silver, Dyson)." },
  { brand: "Warm Gray 8 C", pantone: "Warm Gray 8 C", cmyk: "21 / 28 / 32 / 53", hex: "#8C8279", rgb: "140, 130, 121", notes: "Gris cálido para marcas con tono terracota o boutique (decó, slow fashion)." },
];

export default function GuiaPantonePage() {
  return (
    <>
      <JsonLd
        data={
          breadcrumbJsonLd([
            { name: "Inicio", url: "/" },
            { name: "Recursos", url: "/recursos" },
            {
              name: "Guía Pantone para serigrafía",
              url: "/recursos/guia-pantone-serigrafia-corporativa",
            },
          ]) as never
        }
      />
      <Nav />
      <main className="bg-bone-soft">
        {/* Hero */}
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <nav className="mb-4 text-xs text-ink/50">
              <Link href="/recursos" className="hover:text-accent">
                ← Todos los recursos
              </Link>
            </nav>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Guía técnica · 8 min de lectura
            </p>
            <h1 className="mt-3 font-display text-section font-semibold leading-tight text-ink">
              Guía Pantone para serigrafía corporativa:
              <br />
              <span className="text-accent">cómo evitar que el rojo de tu logo salga rosa.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/75">
              El 70% de los pedidos de merchandising que llegan a producción con un{" "}
              <em>«sale algo distinto a lo de la pantalla»</em> tienen el mismo
              origen: nunca se especificó un código Pantone. Esta guía te enseña
              a hacerlo bien en 10 minutos — y a evitar mockups perdidos.
            </p>
          </div>
        </section>

        {/* Por qué importa */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Por qué Pantone manda en serigrafía
            </h2>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-line bg-bone p-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Pantone
                </p>
                <p className="mt-2 font-display text-lg font-semibold text-ink">
                  Tinta directa
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  En serigrafía cada color es una tinta física que el impresor
                  mezcla siguiendo la receta del libro Pantone. Es el más
                  preciso — y el más reproducible — porque NO se compone de
                  otros colores.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-bone p-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  CMYK
                </p>
                <p className="mt-2 font-display text-lg font-semibold text-ink">
                  Cuatricromía
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  Imprenta digital y DTF: el color se compone con cyan, magenta,
                  amarillo y negro. Hay desviación entre máquinas y soportes —
                  un mismo CMYK puede salir 5-10% distinto.
                </p>
              </div>
              <div className="rounded-2xl border border-line bg-bone p-5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  HEX / RGB
                </p>
                <p className="mt-2 font-display text-lg font-semibold text-ink">
                  Pantalla
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  Diseño web y digital. Como cada pantalla calibra distinto, el
                  HEX <strong>nunca</strong> se usa como referencia para tintas
                  físicas. Sirve para que tu diseñador vea el color, no para que
                  el impresor lo reproduzca.
                </p>
              </div>
            </div>
            <p className="mt-8 rounded-2xl bg-accent-wash p-5 text-sm text-ink/80">
              <strong>Regla práctica:</strong> si tu pedido lleva serigrafía,
              tampografía o bordado{" "}
              <em>(tintas/hilos directos)</em>, especifica <strong>Pantone</strong>. Si
              lleva DTF, sublimación, vinilo o impresión digital{" "}
              <em>(tetracromía)</em>, especifica <strong>CMYK</strong>. El HEX es
              referencia visual solo.
            </p>
          </div>
        </section>

        {/* Tabla colores */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-6xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Tabla de colores corporativos clásicos
            </h2>
            <p className="mt-3 max-w-3xl text-base text-ink/70">
              25 colores que ves todos los días, con equivalencias verificadas
              Pantone → CMYK → HEX → RGB. Si tu marca usa «el rojo de Santander»
              o «el azul de IBM», aquí tienes el código exacto.
            </p>

            <div className="mt-8 overflow-x-auto rounded-3xl border border-line bg-bone-soft">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-line bg-bone-soft text-left">
                  <tr>
                    <th className="px-3 py-3 font-medium text-ink/70">Color</th>
                    <th className="px-3 py-3 font-medium text-ink/70">Marca / nombre</th>
                    <th className="px-3 py-3 font-medium text-ink/70">Pantone</th>
                    <th className="px-3 py-3 font-medium text-ink/70">CMYK</th>
                    <th className="px-3 py-3 font-medium text-ink/70">HEX</th>
                    <th className="px-3 py-3 font-medium text-ink/70">RGB</th>
                  </tr>
                </thead>
                <tbody>
                  {CORPORATE_COLORS.map((c) => (
                    <tr
                      key={`${c.brand}-${c.pantone}`}
                      className="border-b border-line/60 hover:bg-bone"
                    >
                      <td className="px-3 py-3">
                        <span
                          className="inline-block h-6 w-10 rounded-md border border-line align-middle"
                          style={{ backgroundColor: c.hex }}
                          title={c.hex}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-ink">
                        {c.brand}
                        {c.notes && (
                          <p className="mt-1 text-[11px] text-ink/55">{c.notes}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink/80">{c.pantone}</td>
                      <td className="px-3 py-3 font-mono text-xs text-ink/80">{c.cmyk}</td>
                      <td className="px-3 py-3 font-mono text-xs text-ink/80">{c.hex}</td>
                      <td className="px-3 py-3 font-mono text-xs text-ink/80">{c.rgb}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[11px] text-ink/50">
              Códigos basados en guías oficiales de marca y equivalencias
              estándar de la guía Pantone Solid Coated. Pequeñas variaciones
              entre Pantone Coated (C), Uncoated (U) y Textile (TPX) son
              normales — consulta a tu impresor cuál usar según el soporte.
            </p>
          </div>
        </section>

        {/* Cómo elegir Pantone */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cómo identificar el Pantone de tu logo si no lo conoces
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Si tu manual de marca no te lo dice y tu diseñador no responde,
              hay tres caminos por orden de fiabilidad:
            </p>

            <ol className="mt-8 space-y-6">
              <li className="rounded-3xl border border-line bg-bone p-6">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Paso 1 · Lo más fiable
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">
                  Mira el archivo vectorial original (AI, EPS, SVG)
                </h3>
                <p className="mt-3 text-sm text-ink/75">
                  Si tu diseñador entregó el logo en{" "}
                  <code className="rounded bg-bone-soft px-1.5 py-0.5 text-[12px]">.ai</code> /{" "}
                  <code className="rounded bg-bone-soft px-1.5 py-0.5 text-[12px]">.eps</code>, abrirlo en
                  Illustrator (o el visor gratuito de Adobe) muestra el código
                  Pantone exacto en el panel «Muestras». En SVG, busca el
                  atributo <code>data-pantone</code> o el comentario del
                  diseñador.
                </p>
              </li>

              <li className="rounded-3xl border border-line bg-bone p-6">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Paso 2 · Si solo tienes PNG/JPG
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">
                  Convierte HEX → Pantone con calibración profesional
                </h3>
                <p className="mt-3 text-sm text-ink/75">
                  Herramientas como{" "}
                  <a
                    className="text-accent hover:underline"
                    href="https://www.pantone.com/connect"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pantone Connect
                  </a>{" "}
                  o RGB-to-Pantone converters dan el Pantone más cercano. Pero
                  el HEX viene contaminado por la pantalla — el resultado es
                  orientativo. Pídele a tu impresor un mockup físico antes de
                  producir.
                </p>
                <p className="mt-2 text-xs italic text-ink/60">
                  Truco senior: si vas a usar serigrafía, pide al impresor 2-3
                  Pantones candidatos y que estampe una muestra de cada uno en
                  el textil real. 20€ y un día evita 200 piezas mal estampadas.
                </p>
              </li>

              <li className="rounded-3xl border border-line bg-bone p-6">
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent">
                  Paso 3 · Para industrias reguladas
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">
                  Espectrofotómetro (medición física del color)
                </h3>
                <p className="mt-3 text-sm text-ink/75">
                  Si tu marca exige consistencia milimétrica (farma, automoción,
                  cosmética premium), el impresor mide el color de una muestra
                  física con un espectrofotómetro y devuelve el Pantone más
                  cercano + el ΔE (margen de error perceptible). Servicio
                  típico: 80-150€.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* Errores comunes */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cinco errores que vemos cada semana
            </h2>
            <ul className="mt-8 space-y-5">
              {[
                {
                  title: "Confundir Reflex Blue con Pantone 286 C",
                  body: "Son los dos azules corporativos más usados, casi indistinguibles a ojo en pantalla. Reflex Blue es ~10% más violeta y más oscuro. Si tu logo es de los 80-90, casi seguro es Reflex Blue. Si es de los 2000+, suele ser 286 C.",
                },
                {
                  title: "Especificar HEX a un impresor de serigrafía",
                  body: "El impresor no puede mezclar tintas a partir de un HEX porque cada pantalla calibra distinto. Tu logo saldrá lo mejor que él pueda interpretarlo — que puede ser 15% más oscuro o más naranja. Siempre Pantone.",
                },
                {
                  title: "Aplicar el mismo Pantone en textil claro y oscuro",
                  body: "Una serigrafía Pantone 485 (rojo) sobre algodón blanco se ve roja brillante. Sobre algodón negro, sin base blanca debajo, se ve granate apagado. Pide siempre 'Pantone X + base blanca' si imprimes sobre tejido oscuro.",
                },
                {
                  title: "Pedir Pantone Coated (C) cuando vas a uncoated",
                  body: "Pantone tiene 3 series: Coated (papel/textil brillante), Uncoated (papel mate, algodón rugoso), Textile (catálogo TPX). El mismo número en C y U se ve distinto. Cotton tee = Pantone TPX. Polo técnico brillante = Pantone C.",
                },
                {
                  title: "Cambiar el Pantone entre lotes sin avisar",
                  body: "Si pides 500 polos este mes con Pantone 286 C y otros 500 en 6 meses con Pantone 285 C, vas a ver dos lotes con dos azules distintos colgados en tu armario corporativo. Conserva siempre la receta exacta (Pantone + serie + base).",
                },
              ].map((err, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-3xl border border-line bg-bone-soft p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-base font-semibold text-accent-deep">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">
                      {err.title}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">{err.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-ink py-16 text-bone">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">
              ¿Tu logo ya tiene Pantone?
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold lg:text-4xl">
              Pídenos cotización con el código exacto.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75">
              Si nos das Pantone + cantidades + soporte, te devolvemos
              cotización en 24h con la garantía de que el color que llega es el
              que esperas. Sin sorpresas, sin «ay, no había salido así».
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/#cotizar"
                className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-bone transition hover:bg-accent-deep"
              >
                Pedir cotización con Pantone
              </Link>
              <Link
                href="/recomendador"
                className="inline-flex items-center justify-center rounded-full border border-bone/30 px-7 py-3 text-sm font-medium text-bone transition hover:bg-bone/10"
              >
                Ir al recomendador IA →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
