import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";

export const metadata: Metadata = {
  title: "Centro de ayuda · Cómo funciona TodoMerchandising",
  description:
    "Resolvemos las dudas más frecuentes sobre cotizaciones, plazos, métodos de personalización, materiales, devoluciones y producción social. Atención humana en 24h.",
};

const SECTIONS = [
  {
    id: "cotizacion",
    title: "Cotización y pedidos",
    items: [
      {
        q: "¿Cómo pido una cotización?",
        a: "Tienes dos vías: (1) desde la home rellena el formulario \"Pedir cotización en 24 h\" con tu brief y producto orientativo; o (2) entra al producto concreto en /catalogo, selecciona la cantidad y pulsa \"Configurar y cotizar\" — el formulario se prefilla con la referencia. En ambos casos un humano lee tu brief y te responde con precio cerrado, mockup y plazo en menos de 24 horas laborables.",
      },
      {
        q: "¿Tengo que pagar algo por la cotización?",
        a: "No. La cotización siempre es gratuita, sin compromiso, sin letra pequeña y sin obligación de seguir adelante. Si te gusta, avanzamos. Si no, archivamos sin más.",
      },
      {
        q: "¿Cuál es la cantidad mínima de pedido?",
        a: "Depende del producto. Como referencia: textil desde 25 unidades, drinkware desde 50, escritura desde 100, regalos eco desde 25–50. Cantidades menores son posibles pero el coste por unidad se eleva considerablemente. Indícanos tu volumen y te confirmamos el mínimo aplicable.",
      },
      {
        q: "¿Los precios mostrados son finales?",
        a: "Los precios escalados que ves en cada ficha son orientativos calculados a partir de tarifas medias del sector y no incluyen marcaje, transporte ni IVA. La cotización oficial los ajusta a la tarifa real del proveedor según cantidad, técnica de marcaje, número de colores del logo, plazo y destino.",
      },
    ],
  },
  {
    id: "plazos",
    title: "Plazos de entrega",
    items: [
      {
        q: "¿En cuánto tiempo recibo el pedido?",
        a: "Plazo estándar entre 7 y 15 días laborables desde la aprobación de la prueba (mockup), válido para producto en stock europeo y técnicas de marcaje habituales (serigrafía, bordado, láser, transfer). Producciones especiales o personalizadas a medida pueden requerir 3–6 semanas. Te lo confirmamos por escrito en la cotización.",
      },
      {
        q: "¿Tenéis pedidos urgentes?",
        a: "Sí, con sobrecoste. Para producto en stock con marcaje sencillo podemos entregar en 3–5 días laborables. Indícanos la fecha límite real en la cotización y te decimos si es viable y a qué coste.",
      },
      {
        q: "¿Y si tengo un evento con fecha cerrada?",
        a: "Trabajamos al revés desde la fecha del evento. Cuéntanos día y ciudad y te decimos qué productos llegan a tiempo, qué técnicas son viables y qué presupuesto necesitas. No te haremos perder el evento por mala planificación nuestra.",
      },
    ],
  },
  {
    id: "personalizacion",
    title: "Personalización y marcaje",
    items: [
      {
        q: "¿Qué métodos de personalización ofrecéis?",
        a: "Los más habituales: serigrafía (textil y drinkware), bordado (textil técnico y prendas premium), láser (metal y madera), transfer digital y DTF (logos a todo color en pequeñas cantidades), tampografía (objetos pequeños) y grabado (acero, vidrio, bambú). Cada producto detalla en su ficha qué técnicas tiene disponibles, en qué zonas y con qué número máximo de colores.",
      },
      {
        q: "¿En qué formato necesitáis mi logo?",
        a: "Idealmente vectorial: SVG, PDF, AI o EPS con tipografía convertida a curvas. Si solo tienes JPG o PNG, lo vectorizamos sin coste para encargos a partir de 100 unidades. Los archivos los puedes adjuntar en el formulario o enviarlos por email a pedidos@startidea.es.",
      },
      {
        q: "¿Puedo ver el mockup antes de producir?",
        a: "Siempre. Antes de lanzar producción te enviamos un mockup digital del producto con tu logo aplicado en la zona elegida. Solo cuando lo aprobes por escrito empezamos la fabricación. Esto evita el 100% de las sorpresas en la entrega.",
      },
    ],
  },
  {
    id: "produccion-social",
    title: "Producción con impacto social",
    items: [
      {
        q: "¿Qué es un Centro Especial de Empleo (CEE)?",
        a: "Empresas certificadas oficialmente cuyo equipo está formado al menos por un 70% de personas con discapacidad reconocida, en condiciones laborales reales y con salario digno. No es voluntariado ni caridad: es producción profesional con impacto social demostrable. En España hay más de 2.500 CEE certificados.",
      },
      {
        q: "¿Qué porcentaje de mi pedido se produce en CEE?",
        a: "Trabajamos para que sea el 100%, pero hay productos con stock fabricados en otras regiones (sobre todo electrónica y textil técnico). En la cotización te indicamos qué parte del pedido va a CEE y, si quieres, te buscamos alternativas para subir ese porcentaje aunque suponga un ligero ajuste de precio.",
      },
      {
        q: "¿Puedo justificar este pedido en mi memoria de RSC?",
        a: "Sí. Te entregamos un certificado documental con el porcentaje producido en CEE, las personas implicadas (datos agregados, sin individualizar), el ahorro de huella de carbono frente a alternativas asiáticas y el detalle del marcaje. Es el documento que necesitas para tu informe de sostenibilidad o memoria anual.",
      },
    ],
  },
  {
    id: "envio-pago",
    title: "Envío y pago",
    items: [
      {
        q: "¿Dónde enviáis?",
        a: "Península e Islas Baleares con plazo estándar 7–15 días. Canarias, Ceuta y Melilla con plazo 10–20 días (incluye gestión aduanera). Resto de Europa bajo consulta. No enviamos fuera de la UE.",
      },
      {
        q: "¿Cómo se paga?",
        a: "Transferencia bancaria al confirmar el pedido (50% al lanzar producción, 50% antes del envío) o pago único contra entrega para clientes recurrentes. No usamos pasarela de tarjeta porque los importes B2B típicos generan comisiones excesivas. Para AAPP y empresas grandes aceptamos pago a 30/60 días con factura.",
      },
      {
        q: "¿Tenéis IVA al final?",
        a: "Todos los precios mostrados son sin IVA. La factura final incluye el 21% de IVA español aplicable. Si eres una empresa intracomunitaria con NIF VAT válido, aplicamos inversión del sujeto pasivo (factura sin IVA).",
      },
    ],
  },
  {
    id: "devoluciones",
    title: "Cambios y devoluciones",
    items: [
      {
        q: "¿Puedo devolver el pedido si no me gusta?",
        a: "El producto personalizado es un encargo a medida y, por ley, no admite devolución libre. Sí garantizamos calidad: si llega defectuoso, mal marcado o no coincide con el mockup aprobado, lo reponemos sin coste o reembolsamos el importe completo. Tienes 7 días desde la recepción para abrir incidencia.",
      },
      {
        q: "¿Y si llega menos cantidad de la pedida?",
        a: "En producciones grandes (>500 unidades) la industria admite ±5% de tolerancia. Para encargos menores entregamos exactamente la cantidad pedida o más. Si recibes menos, te abonamos la diferencia o reproducimos el faltante.",
      },
    ],
  },
  {
    id: "datos",
    title: "Datos y privacidad",
    items: [
      {
        q: "¿Qué hacéis con mis datos?",
        a: "Tu nombre, email, teléfono y empresa los usamos exclusivamente para responder a tu cotización y, en su caso, gestionar el pedido. No los compartimos con terceros con fines comerciales, no hacemos email marketing, no usamos cookies de tracking. Detalles completos en la Política de privacidad.",
      },
      {
        q: "¿Borráis los datos si os lo pido?",
        a: "Sí, en cualquier momento. Escríbenos a info@startidea.es indicando \"Solicitud de supresión RGPD\" y borramos todos tus datos en menos de 30 días. Conservamos los mínimos legales para facturas si llegamos a hacer pedido (Hacienda exige 4 años).",
      },
    ],
  },
];

export default function AyudaPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Centro de ayuda
            </p>
            <h1 className="font-display text-section font-semibold text-ink">
              Resolvemos tus dudas en 5 minutos.
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Si no encuentras lo que buscas, escríbenos a{" "}
              <a href="mailto:pedidos@startidea.es" className="font-medium text-accent underline-offset-4 hover:underline">
                pedidos@startidea.es
              </a>{" "}
              o pide cotización con tu brief — lo leemos y te respondemos en 24 horas.
            </p>
          </div>
        </section>

        <section className="py-16 lg:py-20">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[260px,1fr]">
              {/* Tabla de contenido sticky */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-ink/50">
                  Secciones
                </p>
                <ul className="space-y-2 text-sm">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`#${s.id}`}
                        className="text-ink/70 transition hover:text-accent"
                      >
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="mt-10 rounded-2xl border border-line bg-bone p-5 text-sm">
                  <p className="font-display font-semibold text-ink">
                    ¿Algo que no aparece?
                  </p>
                  <p className="mt-2 text-ink/60">
                    Tu brief libre vale más que mil FAQs. Cuéntanoslo y respondemos en 24h.
                  </p>
                  <Link
                    href="/#cotizar"
                    className="mt-4 inline-flex rounded-full bg-ink px-5 py-2 text-xs font-medium text-bone transition hover:bg-accent"
                  >
                    Pedir cotización
                  </Link>
                </div>
              </aside>

              {/* Contenido */}
              <div className="space-y-16">
                {SECTIONS.map((s) => (
                  <section key={s.id} id={s.id}>
                    <h2 className="font-display text-3xl font-semibold text-ink">
                      {s.title}
                    </h2>
                    <ul className="mt-8 space-y-6">
                      {s.items.map((it, i) => (
                        <li
                          key={i}
                          className="rounded-2xl border border-line bg-bone p-6"
                        >
                          <p className="font-display text-lg font-semibold text-ink">
                            {it.q}
                          </p>
                          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink/75">
                            {it.a}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
