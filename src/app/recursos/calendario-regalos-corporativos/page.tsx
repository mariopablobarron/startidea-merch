import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title:
    "Calendario corporativo de regalos 2026: qué dar, a quién y cuándo",
  description:
    "Las 12 ventanas del año donde un regalo corporativo bien pensado genera más impacto que en otras. Planifica tu merch de la mano del calendario laboral, fiscal y cultural.",
  alternates: {
    canonical:
      "https://merchandising.startidea.es/recursos/calendario-regalos-corporativos",
  },
  openGraph: {
    title: "Calendario corporativo de regalos 2026",
    description:
      "Qué regalar y cuándo: empleados, clientes, partners y candidatos. 12 ventanas + plantillas.",
    type: "article",
  },
};

type CalendarEvent = {
  month: string;
  date?: string;
  title: string;
  audience: string[];
  ideas: string[];
  lead: string;
};

const CALENDAR: CalendarEvent[] = [
  {
    month: "Enero",
    date: "1ª semana",
    title: "Welcome pack del nuevo año",
    audience: ["Empleados", "Clientes top-tier"],
    ideas: [
      "Agenda corporativa 2026 con calendario branded",
      "Termo o taza nueva (renueva la cocina de la oficina)",
      "Calcetines de marca para «pisar con buen pie» 2026",
    ],
    lead: "Producir en noviembre · entrega 2-9 enero",
  },
  {
    month: "Febrero",
    date: "14 feb",
    title: "San Valentín B2B (clientes que te quieren bien)",
    audience: ["Clientes principales", "Partners estratégicos"],
    ideas: [
      "Caja de bombones con tarjeta personalizada (no kitsch)",
      "Pack «we appreciate you»: libreta + boli premium + termo",
    ],
    lead: "Producir 2ª-3ª semana enero",
  },
  {
    month: "Marzo",
    date: "8 mar",
    title: "Día Internacional de la Mujer",
    audience: ["Empleadas", "Clientas", "Comunidad"],
    ideas: [
      "Material de campaña interno (camiseta + tote con claim corporativo en igualdad)",
      "Pack libros mujeres referentes de tu sector",
    ],
    lead: "Producir 1ª-2ª semana febrero · Cuidado con el tone: no lo conviertas en oportunismo",
  },
  {
    month: "Abril",
    date: "Semana Santa",
    title: "Detalle pre-vacaciones",
    audience: ["Empleados con peques", "Clientes con familia"],
    ideas: [
      "Set huevos chocolate branded para los hijos",
      "Caja de cervezas/vinos con tarjeta «buenas vacaciones»",
    ],
    lead: "Producir 1ª quincena marzo",
  },
  {
    month: "Mayo",
    date: "1 may",
    title: "Día del Trabajador · Apreciación interna",
    audience: ["Empleados (toda la plantilla)"],
    ideas: [
      "Camiseta o sudadera de marca interna (no de venta)",
      "Almuerzo + detalle físico el viernes anterior",
      "Mochila o termo de alta calidad",
    ],
    lead: "Producir abril",
  },
  {
    month: "Junio",
    date: "Pre-verano",
    title: "Kit verano corporativo",
    audience: ["Empleados", "Clientes"],
    ideas: [
      "Toalla microfibra branded + bote crema solar + gorra",
      "Botella de agua de aluminio (sustituye plástico de oficina)",
    ],
    lead: "Producir mayo · entrega 1ª quincena junio",
  },
  {
    month: "Julio",
    date: "Fin trimestre",
    title: "Apreciación al equipo + felicitación clientes",
    audience: ["Empleados Q2 destacados", "Clientes top trimestre"],
    ideas: [
      "Reconocimiento físico (placa, premio interno) en evento de Q2",
      "Tarjeta + detalle por revenue lograda",
    ],
    lead: "Producir junio",
  },
  {
    month: "Septiembre",
    date: "Vuelta al cole",
    title: "Welcome back + nuevos empleados",
    audience: ["Empleados retorno verano", "Nuevas incorporaciones Q3"],
    ideas: [
      "Pack vuelta: libreta + boli premium + sticker laptop",
      "Camiseta del nuevo lanzamiento de producto/servicio",
    ],
    lead: "Producir agosto · entrega 1ª semana septiembre",
  },
  {
    month: "Octubre",
    date: "Q3 close",
    title: "Día del Empleado (cuando lo celebres)",
    audience: ["Empleados (toda la plantilla)"],
    ideas: [
      "Sudadera de marca interna con año en la espalda",
      "Pack auriculares + funda laptop branded",
    ],
    lead: "Producir septiembre",
  },
  {
    month: "Noviembre",
    date: "Black Friday week",
    title: "Activación clientes + leads warm",
    audience: ["Clientes activos", "Leads en pipeline"],
    ideas: [
      "Pack envío con muestra producto + detalle (sticker + brochure)",
      "Tarjeta «no participamos en Black Friday porque…» con regalo coherente",
    ],
    lead: "Producir octubre · entrega antes 25 nov",
  },
  {
    month: "Diciembre",
    date: "Cesta navidad",
    title: "Lote de Navidad (el clásico que toca)",
    audience: ["Empleados", "Clientes", "Proveedores estratégicos"],
    ideas: [
      "Cesta gourmet + producto corporativo dentro",
      "Pack «end of year»: agenda 2027 + termo + libreta",
    ],
    lead: "PRODUCIR EN SEPTIEMBRE-OCTUBRE · si esperas a noviembre llegas tarde",
  },
  {
    month: "Diciembre",
    date: "Pre fin de año",
    title: "Reconocimiento equipo + premios anuales",
    audience: ["Empleados premiados", "Top performers"],
    ideas: [
      "Premio físico personalizado (placa, trofeo branded)",
      "Detalle premium individual (no producción masiva)",
    ],
    lead: "Producir noviembre",
  },
];

type Audience = {
  name: string;
  guideline: string;
  budgetEUR: string;
};

const AUDIENCE_GUIDELINES: Audience[] = [
  {
    name: "Empleados (base)",
    guideline:
      "Útil + cuidado + coherente con la marca interna. Evita lo que parezca «promo barata» — eso desmotiva.",
    budgetEUR: "15-40€ por persona y ocasión",
  },
  {
    name: "Empleados (reconocimiento)",
    guideline:
      "Pieza única o serie limitada. El valor está en la exclusividad y el simbolismo, no en el precio.",
    budgetEUR: "60-150€ por persona y ocasión",
  },
  {
    name: "Clientes top-tier",
    guideline:
      "Pack curado con producto premium + tarjeta personalizada. NO catálogo masivo.",
    budgetEUR: "50-120€ por cuenta",
  },
  {
    name: "Clientes activos (medio)",
    guideline:
      "Útil de calidad + branding sutil. Que lo usen en su oficina y vean tu logo cada día.",
    budgetEUR: "10-30€ por cuenta",
  },
  {
    name: "Partners estratégicos",
    guideline:
      "Tono profesional, sin embarrar la relación con «esto es promo». Tarjeta escrita a mano cuando se pueda.",
    budgetEUR: "30-80€ por partner",
  },
  {
    name: "Candidatos (offer letter)",
    guideline:
      "Welcome pack pre-incorporación. Genera apego antes del día 1. Suele bajar el ghosting al primer día.",
    budgetEUR: "20-50€ por candidato firmado",
  },
];

export default function CalendarioRegalosPage() {
  return (
    <>
      <JsonLd
        data={
          breadcrumbJsonLd([
            { name: "Inicio", url: "/" },
            { name: "Recursos", url: "/recursos" },
            {
              name: "Calendario corporativo de regalos",
              url: "/recursos/calendario-regalos-corporativos",
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
              Estrategia · Calendario
            </p>
            <h1 className="mt-3 font-display text-section font-semibold leading-tight text-ink">
              Calendario corporativo de regalos 2026:
              <br />
              <span className="text-accent">qué dar, a quién y cuándo.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/75">
              Las 12 ventanas del año donde un regalo corporativo bien pensado
              genera más impacto que en otras. Sin improvisar en noviembre
              corriendo detrás del lote de Navidad — planificación trimestral
              honesta y con plazos reales de producción.
            </p>
          </div>
        </section>

        {/* Calendario */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Las 12 ventanas del año
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Por cada ventana: a quién va dirigido, ideas concretas y cuándo
              empezar a producir para llegar a tiempo. Si tu cadena de
              suministro es internacional, suma 2-3 semanas.
            </p>

            <div className="mt-10 space-y-6">
              {CALENDAR.map((ev, i) => (
                <article
                  key={i}
                  className="rounded-3xl border border-line bg-bone p-6 lg:p-7"
                >
                  <div className="flex flex-wrap items-baseline gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      {ev.month}
                    </p>
                    {ev.date && (
                      <p className="text-[11px] text-ink/50">{ev.date}</p>
                    )}
                  </div>
                  <h3 className="mt-1 font-display text-xl font-semibold text-ink">
                    {ev.title}
                  </h3>
                  <p className="mt-3 text-[11px] uppercase tracking-wider text-ink/55">
                    Para
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {ev.audience.map((a) => (
                      <li
                        key={a}
                        className="rounded-full border border-line bg-bone-soft px-2.5 py-0.5 text-xs text-ink/75"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[11px] uppercase tracking-wider text-ink/55">
                    Ideas
                  </p>
                  <ul className="mt-1 space-y-1">
                    {ev.ideas.map((idea, k) => (
                      <li key={k} className="flex gap-2 text-sm text-ink/80">
                        <span className="text-accent">·</span>
                        <span>{idea}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-2xl bg-accent-wash p-3 text-xs italic text-ink/75">
                    📅 {ev.lead}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Audiencias */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-5xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Quién recibe qué (y con qué presupuesto)
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Guía honesta de cómo segmentar para que el detalle encaje con la
              relación. Regalar más caro a quien menos te importa devalúa toda
              la operación.
            </p>
            <div className="mt-8 overflow-x-auto rounded-3xl border border-line bg-bone-soft">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line bg-bone text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink/70">
                      Audiencia
                    </th>
                    <th className="px-4 py-3 font-medium text-ink/70">
                      Pauta
                    </th>
                    <th className="px-4 py-3 font-medium text-ink/70">
                      Presupuesto orientativo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIENCE_GUIDELINES.map((a) => (
                    <tr
                      key={a.name}
                      className="border-b border-line/60 hover:bg-bone"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                      <td className="px-4 py-3 text-sm text-ink/75">
                        {a.guideline}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-accent-deep">
                        {a.budgetEUR}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Reglas honestas */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-3xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cuatro reglas honestas
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                {
                  title: "Nadie quiere un regalo más",
                  body: "Si el detalle no es útil, no es bonito y no es coherente con tu marca, mejor no envíes nada. Un mal regalo daña la marca más que la ausencia.",
                },
                {
                  title: "Empieza por los empleados",
                  body: "Si tu detalle de cliente es mejor que el de tu plantilla, tu plantilla lo nota. Y se va. El primer círculo cuidado es el interno.",
                },
                {
                  title: "Sin tarjeta personalizada, mejor no envíes",
                  body: "Una caja con tu logo y sin nota escrita es publicidad disfrazada. Una nota a mano (o impresa firmada) convierte el envío en gesto.",
                },
                {
                  title: "Mide impacto, no solo unidades enviadas",
                  body: "Trackea quién responde, quién agradece, quién publica en redes con el detalle. Eso revela el ROI real — no las cajas que salieron del almacén.",
                },
              ].map((r, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-3xl border border-line bg-bone p-5"
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

        {/* CTA */}
        <section className="bg-ink py-16 text-bone">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">
              ¿Tienes claras tus ventanas?
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold lg:text-4xl">
              Planificamos contigo el calendario de regalos del año.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75">
              Sin presión: cuéntanos las ventanas que te importan, plantilla,
              clientes y presupuesto, y te devolvemos plan de producción
              ajustado a tus plazos. Sin sorpresas en noviembre.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/#cotizar"
                className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-bone transition hover:bg-accent-deep"
              >
                Pedir asesoría de calendario
              </Link>
              <Link
                href="/recursos/kit-imagen-corporativa"
                className="inline-flex items-center justify-center rounded-full border border-bone/30 px-7 py-3 text-sm font-medium text-bone transition hover:bg-bone/10"
              >
                Ver Kit imagen corporativa →
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
