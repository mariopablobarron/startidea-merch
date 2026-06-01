import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title:
    "Especificaciones técnicas para mockup de merch (qué enviar al proveedor)",
  description:
    "La lista mínima que un proveedor de merch necesita para devolverte el mockup en 24h sin pingpong. Formatos vectoriales, resoluciones, posiciones y técnicas.",
  alternates: {
    canonical:
      "https://merchandising.hubstartidea.es/recursos/especificaciones-mockup",
  },
  openGraph: {
    title: "Especificaciones técnicas para mockup",
    description:
      "Qué enviar a tu proveedor para que te devuelva mockup en 24h sin rondas.",
    type: "article",
  },
};

type SpecBlock = {
  title: string;
  intro: string;
  items: string[];
};

const SPECS: SpecBlock[] = [
  {
    title: "1. Logo o diseño en vectorial",
    intro:
      "Sin vectorial no hay mockup serio. JPG y PNG sirven para verlo, pero no para producirlo.",
    items: [
      "Formato editable: .ai, .eps o .svg",
      "Fuentes convertidas a curvas (Type → Create Outlines en Illustrator)",
      "Colores definidos como muestras Pantone, no como CMYK aproximado",
      "Versión monocromática (1 sola tinta) si vas a serigrafiar o tampografiar",
      "Versión simplificada para áreas pequeñas (<2 cm de alto)",
    ],
  },
  {
    title: "2. Producto a marcar (referencia exacta)",
    intro:
      "El proveedor necesita saber el SKU exacto para superponer tu logo sobre el modelo real, no sobre una camiseta genérica.",
    items: [
      "Marca + modelo + referencia (ej. B&C ID.001 BCTU01T)",
      "Color exacto del producto (no «azul» — «azul marino» o el código pantone del textil)",
      "Material y composición (algodón 100%, polialgodón 65/35, técnico 100% poliéster)",
      "Tallas si afectan al diseño (en sudaderas con capucha la posición «pecho» cambia)",
    ],
  },
  {
    title: "3. Técnica de marcaje por posición",
    intro:
      "Cada posición puede llevar técnica distinta. Especifica una a una.",
    items: [
      "Pecho izquierdo · serigrafía 1 tinta · 8 × 8 cm máx",
      "Espalda alta · DTF a color · 25 × 20 cm máx",
      "Manga derecha · tampografía 1 tinta · 5 × 5 cm máx",
      "Etiqueta interior · etiqueta tejida 4 × 2 cm",
      "Para textiles oscuros que reciben tinta clara: pedir base blanca abajo si vas a serigrafiar",
    ],
  },
  {
    title: "4. Número de tintas y Pantones",
    intro:
      "Cada tinta en serigrafía es una pasada de fotolito = más coste. Reducir tintas reduce coste.",
    items: [
      "Tintas: cuántas y qué Pantone cada una",
      "Si llevas blanco subreferencial: cuenta como tinta",
      "Si llevas degradado: en serigrafía suele requerir cuatricromía CMYK (más caro). Valora si DTF te conviene más.",
      "Especifica Pantone Solid Coated (C) por defecto — si tu textil es muy rugoso, Pantone Uncoated (U)",
    ],
  },
  {
    title: "5. Cantidades + plazo",
    intro:
      "El plazo de mockup depende del plazo del pedido. Si el pedido es de 5000 unidades te merece la pena un mockup físico físico además del digital.",
    items: [
      "Cantidad total por producto y por talla (si aplica)",
      "Fecha máxima de entrega del pedido al cliente final",
      "Si necesitas mockup físico antes de producir (recomendado para >500 ud)",
      "Si necesitas muestras de cada talla antes del lote completo",
    ],
  },
  {
    title: "6. Material de referencia adicional (opcional)",
    intro:
      "Lo que ayuda a evitar malentendidos.",
    items: [
      "Manual de marca corporativo si lo tienes (ver Kit imagen corporativa)",
      "Foto de otro pedido tuyo que salió bien (referencia de tono y acabado)",
      "Foto de un mockup que NO te gustó y por qué (ahorra rondas)",
      "Restricciones legales si tu sector las tiene (farma, seguridad alimentaria, juguete infantil)",
    ],
  },
];

const REASONS: { title: string; body: string }[] = [
  {
    title: "Mockup en 24h vs 4-5 días",
    body: "Cada dato que falta es una ronda de email. Con todo en un brief sólido, el proveedor puede hacer el mockup digital en una sesión de 1h en vez de en varios días.",
  },
  {
    title: "Cotización exacta, no «desde X €»",
    body: "Sin saber técnica de marcaje, número de tintas y Pantones, cualquier precio que te dan es orientativo. Si quieres precio cerrado, los datos son no negociables.",
  },
  {
    title: "Cero sorpresas en producción",
    body: "Lo que define en el mockup es lo que sale. Si el brief queda flojo, las decisiones técnicas las toma el impresor — y a veces no son las que tú harías.",
  },
];

export default function EspecificacionesMockupPage() {
  return (
    <>
      <JsonLd
        data={
          breadcrumbJsonLd([
            { name: "Inicio", url: "/" },
            { name: "Recursos", url: "/recursos" },
            {
              name: "Especificaciones para mockup",
              url: "/recursos/especificaciones-mockup",
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
              Producción · Brief
            </p>
            <h1 className="mt-3 font-display text-section font-semibold leading-tight text-ink">
              Especificaciones para mockup:
              <br />
              <span className="text-accent">qué enviar al proveedor para tener tu propuesta en 24h.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/75">
              Cada email de «¿me confirmas el Pantone?» o «¿qué técnica
              aplicaste a la espalda?» son 24h perdidas. Con un brief técnico
              completo desde la primera vez, el proveedor te devuelve mockup
              presentable en una sesión — y la cotización es exacta, no
              orientativa.
            </p>
          </div>
        </section>

        {/* Specs */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Lo que necesita tu proveedor — punto por punto
            </h2>
            <div className="mt-10 space-y-7">
              {SPECS.map((s, i) => (
                <article
                  key={i}
                  className="rounded-3xl border border-line bg-bone p-6 lg:p-7"
                >
                  <h3 className="font-display text-xl font-semibold text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-ink/70">{s.intro}</p>
                  <ul className="mt-4 space-y-2">
                    {s.items.map((it, k) => (
                      <li key={k} className="flex gap-2 text-sm text-ink/80">
                        <span className="mt-0.5 text-accent">✓</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Por qué importa */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Lo que ganas con un brief sólido
            </h2>
            <ul className="mt-8 space-y-5">
              {REASONS.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-3xl border border-line bg-bone-soft p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-base font-semibold text-accent-deep">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">
                      {r.title}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">{r.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Plantilla brief */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Plantilla copy-paste para tu email
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Adapta los huecos a tu proyecto. Manda esto a tu proveedor y vas a
              tener mockup en menos de 48h.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-3xl border border-line bg-ink p-6 text-sm text-bone">
              <code>{`Hola [proveedor],

Necesito mockup + cotización para:

PRODUCTO
  Marca/modelo:    [ej. B&C ID.001]
  Color textil:    [ej. azul marino — Pantone 296 C]
  Composición:     [ej. 100% algodón orgánico 180g/m²]

CANTIDADES (desglose por talla)
  S × [10]   M × [30]   L × [40]   XL × [15]   XXL × [5]
  Total:    100 unidades

MARCAJE
  Posición 1: [pecho izquierdo]
    Técnica:    [serigrafía a 1 tinta]
    Medidas:    [8 × 8 cm máx]
    Diseño:     [adjunto LOGO_FLAT.eps]
    Tintas:     [Pantone 286 C (azul corporativo)]
    Base:       [no aplica — textil claro]

  Posición 2: [espalda alta]
    Técnica:    [DTF a color]
    Medidas:    [25 × 20 cm máx]
    Diseño:     [adjunto BACK_FULL.png 300dpi]

PLAZOS
  Mockup necesario:    [12 jun]
  Producción aprobada: [13 jun]
  Entrega al cliente:  [25 jun]

EXTRAS
  Marca de marca / etiqueta interior: [sí, etiqueta tejida 4×2 cm]
  Empaquetado individual:             [no]
  Muestra física antes de producir:   [sí, 1 ud por color/talla]

Adjunto:
  - Logo vectorial editable
  - Logo monocromo blanco (por si lo necesitas para textil oscuro)
  - Foto de un mockup anterior que salió bien (referencia)

Quedo atento al mockup. Gracias.`}</code>
            </pre>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-ink py-16 text-bone">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">
              ¿Tienes tu brief listo?
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold lg:text-4xl">
              Mándanoslo y te devolvemos mockup + precio en 24h.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75">
              Si nos falta algún dato, te decimos exactamente qué pedir a tu
              diseñador para no perder rondas.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/#cotizar"
                className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-bone transition hover:bg-accent-deep"
              >
                Pedir cotización con mi brief
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
