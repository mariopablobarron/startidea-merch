import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title:
    "Kit de imagen corporativa: lo mínimo para pedir tu primer merch sin pérdidas",
  description:
    "Qué necesitas tener listo antes de pedir tu primer pedido de merchandising: logo en variantes, paleta, tipografía y tagline. Checklist de auditoría y plantilla de brand book editable.",
  alternates: {
    canonical:
      "https://merchandising.startidea.es/recursos/kit-imagen-corporativa",
  },
  openGraph: {
    url: "https://merchandising.startidea.es/recursos/kit-imagen-corporativa",
    title: "Kit de imagen corporativa para PYMEs",
    description:
      "Los 5 elementos mínimos que separan un merch profesional de uno improvisado. Plantilla descargable.",
    type: "article",
  },
};

type KitElement = {
  num: string;
  title: string;
  why: string;
  formats: string[];
  example?: string;
};

const KIT_ELEMENTS: KitElement[] = [
  {
    num: "1",
    title: "Logo en variantes técnicas",
    why: "Tu logo de Instagram no sirve para serigrafiar. Para producir merch sin sorpresas necesitas el archivo vectorial limpio en al menos 4 versiones: color principal, monocromo negro, monocromo blanco (para fondos oscuros) y outline (línea). Cada técnica de marcaje pide su versión.",
    formats: [
      "Vectorial editable: .ai, .eps o .svg",
      "Bitmap alta resolución: .png con transparencia ≥1500px",
      "Versión monocromática negra y blanca",
      "Versión simplificada para áreas <2cm (ej. solapas, bolsillos)",
    ],
    example:
      "Si tu logo tiene degradados, sombras o tipografías ultra-finas: pide a tu diseñador una versión «flat» para serigrafía/bordado. No se imprimen bien degradados a 1 color y los grosores <0.5mm se pierden bordados.",
  },
  {
    num: "2",
    title: "Paleta de color con códigos exactos",
    why: "Define 3-5 colores como máximo: 1-2 primarios (identidad), 1-2 secundarios (apoyo) y 1-2 neutros (fondos, textos). De cada color: Pantone (serigrafía/bordado), CMYK (digital), HEX (web). Sin estos códigos, cada proveedor interpreta tu marca distinto.",
    formats: [
      "Pantone Solid Coated (C) para textil brillante o papel",
      "Pantone Solid Uncoated (U) para algodón rugoso o papel mate",
      "Pantone Textile (TPX) para tinte de tejidos",
      "CMYK para impresión digital, DTF, sublimación",
      "HEX y RGB para diseño web y firmas email",
    ],
    example:
      "Si solo recuerdas «un azul corporativo»: empieza por capturar el HEX desde tu web, luego pide al impresor el Pantone más cercano. Mira la Guía Pantone para más contexto.",
  },
  {
    num: "3",
    title: "Tipografía corporativa",
    why: "Define al menos 1 fuente principal (titulares) y 1 secundaria (cuerpo). Si no tienes presupuesto para licencias premium, usa Google Fonts — son gratuitas para uso comercial y se cargan rápido. Especifica también pesos (light/regular/bold) y tamaños mínimos legibles.",
    formats: [
      "Familia principal con licencia comercial vigente",
      "Pesos definidos (típicamente 3-4: light, regular, semibold, bold)",
      "Equivalente gratuito Google Fonts si tu primaria es de pago",
      "Tamaño mínimo legible en merch (ej. ≥10pt en textil)",
    ],
    example:
      "Combos que funcionan bien: Inter + Inter Display · Manrope + Lora · Work Sans + Source Serif · Roboto + Playfair Display. Evita Comic Sans, Papyrus y tipografías «de moda» que envejecen mal.",
  },
  {
    num: "4",
    title: "Iconografía y estilo visual",
    why: "Define qué tipo de imágenes representan tu marca. ¿Fotografía real o ilustración? ¿Estilo minimalista o orgánico? ¿Iconos line, fill, duotone? Esto determina qué encaja en tu merch: una marca minimalista no debería estampar ilustraciones recargadas.",
    formats: [
      "Estilo de iconos elegido (Lucide, Phosphor, Heroicons, custom)",
      "Estilo fotográfico (realismo, color cálido/frío, luz natural/artificial)",
      "Si usas ilustraciones: paleta, trazo, perspectiva",
      "Lista de NO-haceres: qué NO encaja con la marca",
    ],
  },
  {
    num: "5",
    title: "Tagline o frase de marca",
    why: "Una frase corta (4-8 palabras) que sintetiza tu propuesta y se puede estampar bajo el logo. No es obligatoria, pero ayuda enormemente en merch: una tote o sudadera con solo el logo cuesta más de explicar que con un tagline claro.",
    formats: [
      "Versión corta para áreas pequeñas (tagline ≤6 palabras)",
      "Versión larga para áreas grandes (descripción ≤20 palabras)",
      "Idioma claro: si vendes en España, escríbela en español o EN+ES",
    ],
    example:
      "Ejemplos potentes: «Solo natural» (Vichy Catalan) · «Just do it» (Nike) · «Think different» (Apple) · «Connecting people» (Nokia). Lo común: simple, evocativo, memorable.",
  },
];

type Mistake = { title: string; body: string };
const MISTAKES: Mistake[] = [
  {
    title: "Solo tener el logo en JPG con fondo blanco",
    body: "El JPG no tiene transparencia ni vectores: sale pixelado al ampliarlo y arrastra un cuadrado blanco si lo pones sobre otro color. Pide siempre versiones .ai/.eps/.svg + .png transparente.",
  },
  {
    title: "Definir solo «el azul corporativo» sin Pantone",
    body: "Cada pantalla muestra el azul distinto. Sin Pantone, tu logo serigrafiado puede salir 10-15% más oscuro o violeta de lo que esperabas. Define mínimo el HEX, idealmente el Pantone.",
  },
  {
    title: "Usar tipografías premium sin licencia",
    body: "Si tu kit incluye Gotham o Avenir y no has comprado licencia comercial, técnicamente cada vez que las usas en una publicación corporativa estás cometiendo infracción. Riesgo: factura del licenciador, retirada de campañas. Soluciones gratuitas Google Fonts equivalentes existen siempre.",
  },
  {
    title: "Logo con efectos no reproducibles físicamente",
    body: "Sombras suaves, degradados de 50 colores, transparencias parciales — todo bonito en pantalla, todo imposible en serigrafía a 1 color y muy caro en bordado. Pide una versión «flat» que sobreviva a cualquier técnica.",
  },
  {
    title: "Cambiar el kit cada 6 meses",
    body: "Si redefines logo/colores constantemente, tu merch del año pasado queda obsoleto. La identidad corporativa se construye con repetición: aguanta al menos 2-3 años antes de un rediseño mayor.",
  },
];

type ChecklistItem = { text: string };
const CHECKLIST: ChecklistItem[] = [
  { text: "Tengo el logo en formato vectorial (.ai/.eps/.svg)" },
  { text: "Tengo versiones del logo en color, blanco y negro" },
  { text: "Sé el código Pantone (o al menos HEX) de mis colores corporativos" },
  { text: "Mi tipografía corporativa tiene licencia comercial vigente" },
  { text: "He simplificado mi logo para usos pequeños (área < 2 cm)" },
  { text: "Mi tagline o claim cabe en una sola línea" },
  { text: "He probado el logo en al menos 1 fondo claro y 1 oscuro" },
  { text: "Tengo claro qué estilo de fotografía/icono representa la marca" },
];

export default function KitImagenCorporativaPage() {
  return (
    <>
      <JsonLd
        data={
          breadcrumbJsonLd([
            { name: "Inicio", url: "/" },
            { name: "Recursos", url: "/recursos" },
            {
              name: "Kit de imagen corporativa",
              url: "/recursos/kit-imagen-corporativa",
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
              Identidad de marca · 10 min de lectura
            </p>
            <h1 className="mt-3 font-display text-section font-semibold leading-tight text-ink">
              Kit de imagen corporativa:
              <br />
              <span className="text-accent">lo mínimo que necesitas antes de pedir tu primer merch.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/75">
              Las PYMEs que aciertan con su primer pedido de merchandising
              tienen una cosa en común — llegan con un kit de marca claro. Las
              que improvisan, gastan 2-3 veces más en rondas de mockups,
              correcciones y reimpresiones. Aquí está lo mínimo que necesitas
              definir <strong>antes</strong> de pedir presupuesto.
            </p>
          </div>
        </section>

        {/* 5 elementos */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Los 5 elementos imprescindibles
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Si tienes estos cinco, cualquier proveedor de merch te puede
              producir un pedido coherente con tu marca. Si te falta alguno, los
              huecos los rellena el proveedor — y rara vez como tú quieres.
            </p>
            <div className="mt-10 space-y-8">
              {KIT_ELEMENTS.map((el) => (
                <article
                  key={el.num}
                  className="rounded-3xl border border-line bg-bone p-6 lg:p-8"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-display text-xl font-semibold text-bone">
                      {el.num}
                    </span>
                    <div className="flex-1">
                      <h3 className="font-display text-2xl font-semibold text-ink">
                        {el.title}
                      </h3>
                      <p className="mt-3 text-base text-ink/75">{el.why}</p>
                      <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-ink/60">
                        Formatos / variantes mínimas
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {el.formats.map((f, i) => (
                          <li
                            key={i}
                            className="flex gap-2 text-sm text-ink/75"
                          >
                            <span className="text-accent">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                      {el.example && (
                        <p className="mt-5 rounded-2xl bg-accent-wash p-4 text-sm italic text-ink/80">
                          💡 {el.example}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Checklist */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-3xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Audita tu kit en 2 minutos
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
              Checklist: ¿está tu marca lista para merch?
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Si marcas 6 o más, estás en muy buen punto. Si marcas 5 o menos,
              merece la pena dedicar 1-2 días a cerrar huecos antes de invertir
              en producción.
            </p>
            <ul className="mt-8 space-y-3">
              {CHECKLIST.map((item, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-2xl border border-line bg-bone-soft p-4"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-bone font-mono text-[10px] text-ink/40">
                    {i + 1}
                  </span>
                  <span className="text-sm text-ink/85">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Errores comunes */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cinco errores que pagamos caro
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Patrones que vemos en kits «hechos rápido» y que después salen muy
              caro en producción.
            </p>
            <ul className="mt-8 space-y-5">
              {MISTAKES.map((m, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-3xl border border-line bg-bone p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-base font-semibold text-accent-deep">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">
                      {m.title}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">{m.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Plantilla descargable */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-3xl px-6 lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
              Atajos profesionales
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
              Plantillas que aceleran tu kit
            </h2>
            <p className="mt-3 text-base text-ink/70">
              No reinventes la rueda. Estos templates gratuitos cubren el 80% de
              lo que necesitas. Solo tienes que rellenar los huecos.
            </p>

            <ul className="mt-8 space-y-4">
              <li className="rounded-3xl border border-line bg-bone-soft p-5">
                <p className="text-[10px] uppercase tracking-wider text-accent">
                  Figma · Brand Guidelines Template
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-ink">
                  Plantilla profesional de manual de marca
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  Estructura completa: portada, logo + variantes, paleta,
                  tipografías, iconografía, fotografía, do/don&apos;t. Hay
                  decenas en Figma Community — busca «brand guidelines
                  template» y filtra por «editable». Duplicas, rellenas y exportas
                  a PDF.
                </p>
                <a
                  href="https://www.figma.com/community/search?model_type=hub_files&q=brand%20guidelines%20template"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Buscar plantillas en Figma Community →
                </a>
              </li>

              <li className="rounded-3xl border border-line bg-bone-soft p-5">
                <p className="text-[10px] uppercase tracking-wider text-accent">
                  Notion · Brand Hub
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-ink">
                  Sistema de marca vivo (en lugar de PDF estático)
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  Si tu equipo crece rápido, el PDF queda anticuado. Una página
                  Notion compartida con logo, paleta, fuentes y reglas de uso es
                  mucho más fácil de mantener actualizada. Comparte por link.
                </p>
              </li>

              <li className="rounded-3xl border border-line bg-bone-soft p-5">
                <p className="text-[10px] uppercase tracking-wider text-accent">
                  Google Slides · Onboarding visual
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-ink">
                  Versión ligera para PYME pequeña (≤10 personas)
                </p>
                <p className="mt-2 text-sm text-ink/70">
                  Si Figma se queda grande, un Google Slides de 10 diapositivas
                  ya cubre lo esencial: 1 logo, 2 paleta, 3 tipografía, 4-5
                  ejemplos, 6-7 usos correctos, 8-10 do/don&apos;t. Gratis,
                  exportable a PDF.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-ink py-16 text-bone">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">
              ¿Tu kit pasa el checklist?
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold lg:text-4xl">
              Entonces estás listo para hacer merch sin sorpresas.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75">
              Mandanos tu logo en vectorial + Pantone + cantidades aproximadas,
              y te devolvemos propuesta en 24h. Si te falta algo del kit, te
              decimos qué pedir a tu diseñador para no perder tiempo.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/#cotizar"
                className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-bone transition hover:bg-accent-deep"
              >
                Pedir cotización con mi kit
              </Link>
              <Link
                href="/recursos/guia-pantone-serigrafia-corporativa"
                className="inline-flex items-center justify-center rounded-full border border-bone/30 px-7 py-3 text-sm font-medium text-bone transition hover:bg-bone/10"
              >
                Leer la Guía Pantone →
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
