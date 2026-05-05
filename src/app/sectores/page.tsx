import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";

export const metadata: Metadata = {
  title: "Merchandising por sector · Tech, eventos, retail, AAPP, RSC",
  description:
    "Soluciones de merchandising corporativo adaptadas a cada sector: empresas tech, organizadores de eventos, retail, administración pública y proyectos de RSC con impacto social medible.",
};

const SECTORS = [
  {
    slug: "tech",
    icon: "💻",
    title: "Empresas tech",
    short: "Onboarding, hackathons, conferencias y kits para remoto",
    needs: [
      "Welcome packs para incorporaciones (sudaderas, libretas, drinkware con logo)",
      "Merchandising de producto y comunidad para eventos dev",
      "Kits para equipos en remoto: una caja, todo dentro",
      "Regalos de cierre de Q o aniversario con grabado láser premium",
    ],
    products: [
      { name: "Sudaderas y polos premium", q: "sudadera" },
      { name: "Libretas + bolígrafo set", q: "libreta" },
      { name: "Botellas tritan + tazas térmicas", q: "botella" },
      { name: "Power banks y cables USB-C", q: "power" },
    ],
    cta: "Cotizar pack onboarding",
  },
  {
    slug: "eventos",
    icon: "🎤",
    title: "Organizadores de eventos",
    short: "Lanyards, acreditaciones, totes y goodie bags al peso",
    needs: [
      "Lanyards + acreditaciones impresas a 4 colores con plazo cerrado",
      "Tote bags con marcaje DTF para repartir en feria",
      "Pulseras Tyvek y acreditaciones VIP diferenciadas",
      "Cuadernos y bolígrafos para asistentes de congreso",
    ],
    products: [
      { name: "Lanyards y acreditaciones", q: "lanyard" },
      { name: "Tote bags y mochilas plegables", q: "mochila" },
      { name: "Pulseras Tyvek e identificación", q: "pulsera" },
      { name: "Notebooks de congreso", q: "libreta" },
    ],
    cta: "Cotizar pack feria",
  },
  {
    slug: "retail",
    icon: "🛍",
    title: "Retail y consumo",
    short: "Regalos directos al cliente final, packaging y promociones",
    needs: [
      "Regalo con compra (gift with purchase) personalizado con marca",
      "Packaging diferenciado para campañas estacionales",
      "Material POP para tienda física y eventos pop-up",
      "Cajas de fidelización para clientes premium",
    ],
    products: [
      { name: "Drinkware premium", q: "drinkware" },
      { name: "Regalos eco bambú/RPET", q: "bambu" },
      { name: "Cuadernos y agendas", q: "agenda" },
      { name: "Llaveros y accesorios", q: "llavero" },
    ],
    cta: "Cotizar campaña",
  },
  {
    slug: "aapp",
    icon: "🏛",
    title: "Administraciones públicas",
    short: "Concursos, contratación menor y memoria social documentada",
    needs: [
      "Productos con porcentaje certificado de producción en CEE",
      "Documentación lista para concurso público (ficha técnica, ecodiseño)",
      "Pago a 30/60 días con factura aprobada por intervención",
      "Materiales reciclables y trazables con certificados",
    ],
    products: [
      { name: "Material institucional textil", q: "polo" },
      { name: "Bolsas algodón orgánico GOTS", q: "bolsa" },
      { name: "Botellas acero reutilizables", q: "botella acero" },
      { name: "Material escolar para escuelas", q: "boligrafo" },
    ],
    cta: "Solicitar dossier para AAPP",
  },
  {
    slug: "rsc",
    icon: "🌱",
    title: "Departamentos RSC",
    short: "Memoria de sostenibilidad, ODS y trazabilidad social",
    needs: [
      "Producción con porcentaje verificado en Centros Especiales de Empleo",
      "Certificado documental para memoria anual con datos agregados",
      "Cálculo de huella de carbono frente a alternativas asiáticas",
      "Productos eco con sellos GOTS, OEKO-Tex, FSC reales (no greenwashing)",
    ],
    products: [
      { name: "Eco · bambú, RPET, orgánico", q: "bambu" },
      { name: "Reciclado plástico de océano", q: "ocean" },
      { name: "Madera FSC certificada", q: "madera" },
      { name: "Algodón orgánico GOTS", q: "organico" },
    ],
    cta: "Pedir certificado RSC",
  },
  {
    slug: "rrhh",
    icon: "👥",
    title: "RRHH · People Ops",
    short: "Welcome packs, cumpleaños, cierre de año y team building",
    needs: [
      "Welcome packs para nuevas incorporaciones con marca + impacto",
      "Pequeños regalos de cumpleaños y aniversario laboral",
      "Pack de cierre de año o aniversario empresa",
      "Equipación para team-building y outdoors corporativos",
    ],
    products: [
      { name: "Welcome packs personalizados", q: "welcome" },
      { name: "Tazas + libretas", q: "taza" },
      { name: "Sudaderas equipo", q: "sudadera" },
      { name: "Mochilas técnicas", q: "mochila" },
    ],
    cta: "Cotizar welcome pack",
  },
];

export default function SectoresPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-accent">
              Por sector
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Cada sector tiene su propio lenguaje. Hablamos los seis.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Tu equipo de RRHH no necesita lo mismo que tu equipo de marketing en feria. Un
              ayuntamiento no compra como un retail. Estos son los enfoques que aplicamos
              para cada cliente, con los productos que mejor encajan.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-6 lg:grid-cols-2">
              {SECTORS.map((s) => (
                <article
                  key={s.slug}
                  id={s.slug}
                  className="overflow-hidden rounded-3xl border border-line bg-bone p-7 lg:p-8"
                >
                  <header className="flex items-start gap-4">
                    <span className="text-4xl">{s.icon}</span>
                    <div>
                      <h2 className="font-display text-2xl font-semibold text-ink">
                        {s.title}
                      </h2>
                      <p className="mt-1 text-sm text-ink/60">{s.short}</p>
                    </div>
                  </header>

                  <p className="mt-6 text-xs font-medium uppercase tracking-wider text-ink/50">
                    Necesidades típicas
                  </p>
                  <ul className="mt-3 space-y-2 text-sm">
                    {s.needs.map((n) => (
                      <li key={n} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span className="text-ink/80">{n}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 text-xs font-medium uppercase tracking-wider text-ink/50">
                    Productos recomendados
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.products.map((p) => (
                      <Link
                        key={p.q}
                        href={`/catalogo?q=${encodeURIComponent(p.q)}`}
                        className="rounded-full border border-line bg-bone-soft px-3 py-1 text-xs text-ink/70 transition hover:border-accent hover:text-accent"
                      >
                        {p.name}
                      </Link>
                    ))}
                  </div>

                  <Link
                    href={`/#cotizar?sector=${s.slug}`}
                    className="mt-7 inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-bone transition hover:bg-accent"
                  >
                    {s.cta} →
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-10">
            <h2 className="font-display text-section font-semibold text-ink">
              ¿No te ves en ningún sector?
            </h2>
            <p className="mt-4 text-lg text-ink/70">
              No hay problema. Cuéntanos tu caso en una frase y nuestro asistente IA te
              propone 3-5 productos del catálogo en menos de 30 segundos.
            </p>
            <Link
              href="/recomendador"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-medium text-bone transition hover:bg-accent-dark"
            >
              Probar el recomendador IA →
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
