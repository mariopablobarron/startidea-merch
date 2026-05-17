import type { Metadata } from "next";
import { PillarShell, FaqJsonLd } from "@/components/pillar/PillarShell";

export const metadata: Metadata = {
  title: "Merchandising en Centro Especial de Empleo (CEE): cómo funciona · TodoMerchandising",
  description:
    "Qué es un Centro Especial de Empleo, qué puedes producir ahí, cuánto cuesta vs alternativa convencional, qué métricas reportables genera para tu memoria RSC y cómo cumplir LGD (Ley General de Discapacidad) comprando merchandising.",
  openGraph: {
    title: "Merchandising en CEE · guía 2026",
    description:
      "Producción en Centros Especiales de Empleo: qué es, qué se puede hacer, qué métricas genera, cómo encaja con LGD y memorias GRI/EFRAG.",
  },
  alternates: { canonical: "/recursos/merchandising-centro-especial-empleo" },
};

const FAQS = [
  {
    q: "¿Qué es un Centro Especial de Empleo?",
    a: "Es una empresa con personalidad jurídica propia donde al menos el 70% de la plantilla son personas con discapacidad reconocida ≥33%. Producen bienes y servicios en igualdad de condiciones que cualquier otra empresa, pero su misión específica es la inserción laboral. Regulados por RD 1368/1985 y modificaciones posteriores. Están auditados por la Inspección de Trabajo.",
  },
  {
    q: "¿Comprarme a un CEE cuenta para cumplir la Ley General de Discapacidad?",
    a: "Sí. Las empresas con 50+ trabajadores están obligadas a tener al menos 2% de su plantilla con discapacidad reconocida (LGD art. 42). Si no llegan, deben aplicar Medidas Alternativas — y una de las principales es comprar bienes/servicios a un Centro Especial de Empleo. Esta compra computa para tu cumplimiento legal y se documenta con factura + certificado del CEE.",
  },
  {
    q: "¿Qué productos puedo producir en un CEE?",
    a: "En España hay CEEs especializados en prácticamente todas las categorías de merchandising: textil (polos, sudaderas, bolsas), papelería (libretas, blocs), packaging, montaje de kits, personalización por bordado/láser/transfer, ensamblaje electrónico básico, lavandería industrial textil, etc. Para producto técnico complejo (electrónica avanzada) puede que necesite combinarse con fabricante convencional.",
  },
  {
    q: "¿Es más caro o no?",
    a: "El sobreprecio frente a la alternativa importada está en el 10-30%. Frente a la alternativa local convencional, la diferencia es menor (5-15%) — porque el coste de mano de obra en CEE no es muy distinto al de otra industria local; el sobreprecio viene principalmente del ritmo de producción más cuidado y de auditorías. Para una empresa que reporta, ese sobreprecio se compensa con métrica reportable.",
  },
  {
    q: "¿Qué métricas para mi memoria genera un pedido en CEE?",
    a: "Cifras reportables bajo GRI 204 (proveedores locales), GRI 401 (empleo), GRI 405 (diversidad e inclusión), EFRAG S1 (workforce). Específicas del pedido: horas de trabajo digno generadas, número de personas con discapacidad involucradas, % producción CEE sobre tu gasto total. Se reportan con certificado firmado por el CEE.",
  },
  {
    q: "¿Y la calidad? ¿Es comparable a producción convencional?",
    a: "Es comparable y, en muchos casos, superior. La rotación en CEE es baja, la formación específica, y la motivación alta. La diferencia operativa principal es el ritmo de producción ligeramente más pausado en algunos procesos (lo que se traduce en plazos +20% vs convencional local, pero menor tasa de defectos). Para producto corporativo serio, esto compensa.",
  },
];

export default function MerchandisingCentroEspecialEmpleoPage() {
  return (
    <>
      <FaqJsonLd faqs={FAQS} />
      <PillarShell
        eyebrow="— Guía 2026"
        title="Merchandising en Centro Especial de Empleo."
        titleAccent="Qué es, qué puedes producir, qué te aporta legalmente."
        lead="Producir tu merchandising corporativo en un CEE no es una decisión &quot;solidaria&quot; — es una decisión operativa que cumple LGD, genera métrica reportable para tu memoria RSC, y entrega producto con calidad equivalente o superior a la convencional local. Te lo cuento sin filtros."
        tldr={[
          "CEE = empresa donde ≥70% de plantilla tiene discapacidad reconocida ≥33%. Auditadas por Inspección de Trabajo.",
          "Comprar a CEE computa como Medida Alternativa LGD (obligatoria para empresas 50+). Factura + certificado oficial.",
          "Genera 3 métricas para tu memoria: horas trabajo digno · personas con discapacidad involucradas · % producción CEE.",
        ]}
        faqs={FAQS}
        ctaTitle="Cotización con datos CEE incluidos."
        ctaSubtitle="Te entregamos cotización + estimación de horas de trabajo digno generadas + certificado oficial al producir. Todo listo para tu memoria GRI/EFRAG y tu cumplimiento LGD."
      >
        <h2 id="que-es-cee">Qué es exactamente un CEE</h2>
        <p>
          Un Centro Especial de Empleo (CEE) es una empresa con personalidad
          jurídica propia, regulada por el RD 1368/1985, donde <strong>al menos el
          70% de la plantilla son personas con discapacidad reconocida igual o
          superior al 33%</strong>. Producen bienes y servicios en condiciones
          equivalentes a cualquier otra empresa del sector, pero su objetivo
          específico es la inserción laboral.
        </p>
        <p>
          Hay cerca de 2.700 CEEs activos en España, empleando a unas 110.000
          personas (datos Fundación ONCE, 2024). Están auditados periódicamente
          por la Inspección de Trabajo. Pueden ser de iniciativa social
          (fundaciones, entidades sin ánimo de lucro) o empresarial.
        </p>

        <h2 id="lgd">Por qué interesa legalmente: LGD y Medidas Alternativas</h2>
        <p>
          La Ley General de los Derechos de las Personas con Discapacidad (LGD,
          texto refundido RDL 1/2013) <strong>obliga a las empresas con 50 o más
          trabajadores a tener al menos un 2% de su plantilla con discapacidad
          reconocida</strong> (artículo 42).
        </p>
        <p>
          La realidad: muchas empresas no llegan a ese 2% (por imposibilidad real,
          tipo de puesto, dificultad de encontrar perfiles, etc.). La ley prevé
          esa situación con las <strong>Medidas Alternativas</strong> (RD 364/2005),
          que incluyen:
        </p>
        <ul>
          <li>Contratar bienes o servicios a un CEE</li>
          <li>Hacer donaciones a entidades de empleo de personas con discapacidad</li>
          <li>Crear un enclave laboral</li>
        </ul>
        <p>
          La compra a CEE es <strong>la más común y la más simple de documentar</strong>:
          basta con la factura del CEE + su certificado oficial. Se contabiliza en
          función del importe equivalente al coste anual de los puestos que faltarían.
        </p>

        <h2 id="que-puedo-producir">Qué tipo de merchandising puedo producir en CEE</h2>
        <p>
          La oferta española de CEEs cubre casi todo el merchandising habitual:
        </p>
        <ul>
          <li>
            <strong>Textil</strong>: polos, camisetas, sudaderas, bolsas algodón
            orgánico, mochilas, gorras. Bordado y serigrafía in-house.
          </li>
          <li>
            <strong>Papelería</strong>: libretas, blocs, agendas, calendarios,
            blocs adhesivos. Encuadernación manual y serigrafía.
          </li>
          <li>
            <strong>Packaging</strong>: cajas regalo personalizadas, kits, blísters,
            sobres troquelados.
          </li>
          <li>
            <strong>Personalización</strong>: bordado, serigrafía, transfer DTF,
            láser CO₂, sublimación, tampografía.
          </li>
          <li>
            <strong>Montaje de kits</strong>: bienvenida nuevos empleados,
            packaging de regalo corporativo, ensamblaje de welcome packs.
          </li>
          <li>
            <strong>Servicios complementarios</strong>: lavandería industrial,
            empaquetado, etiquetado, manipulación textil.
          </li>
        </ul>
        <p>
          Para producto técnico complejo (electrónica avanzada, productos con
          herramental específico), el CEE suele combinarse con fabricante
          convencional para el componente técnico, y el CEE asume el
          ensamblado, marcaje y packaging.
        </p>

        <h2 id="metricas">Métricas que genera para tu memoria</h2>
        <p>
          Cada pedido en CEE genera datos reportables bajo marcos estándar:
        </p>
        <table>
          <thead>
            <tr><th>Métrica</th><th>Marco</th><th>Aplicación</th></tr>
          </thead>
          <tbody>
            <tr><td>Horas trabajo digno generadas</td><td>GRI 401, EFRAG S1</td><td>Memoria anual sostenibilidad</td></tr>
            <tr><td>Personas con discapacidad involucradas</td><td>GRI 405, EFRAG S1</td><td>Diversidad e inclusión</td></tr>
            <tr><td>% producción CEE / proveedor local</td><td>GRI 204, EFRAG S2</td><td>Cadena de suministro responsable</td></tr>
            <tr><td>Importe destinado a CEE</td><td>LGD art. 42</td><td>Cumplimiento Medidas Alternativas</td></tr>
            <tr><td>kg CO₂ ahorrados vs producción importada</td><td>GRI 305, EFRAG E1</td><td>Huella ambiental</td></tr>
          </tbody>
        </table>

        <h2 id="precio">Qué precio diferencial pagar y por qué</h2>
        <p>
          Frente a producción importada: <strong>10-30% más caro</strong>.
          Frente a producción local convencional: <strong>5-15% más</strong>. La
          diferencia se explica por:
        </p>
        <ul>
          <li>
            <strong>Ritmo más pausado</strong> en algunos procesos: el plazo medio
            es +20% sobre convencional local, pero a cambio la tasa de defectos
            es menor.
          </li>
          <li>
            <strong>Auditoría periódica</strong> por la Inspección de Trabajo
            (coste indirecto que el CEE traslada).
          </li>
          <li>
            <strong>Sin descuentos extremos por volumen</strong>: el CEE no
            quiebra estructura productiva por una bajada agresiva de precio.
          </li>
        </ul>
        <p>
          Para empresas que reportan, este sobreprecio se convierte directamente
          en métrica positiva. Para empresas que no reportan, la pieza tiene una
          historia de origen verificable que el merch genérico no puede tener.
        </p>

        <h2 id="como-empezar">Cómo empezar sin riesgo</h2>
        <p>
          Si nunca has pedido a un CEE, la fórmula sin riesgo:
        </p>
        <ol>
          <li>
            Pedido pequeño de prueba (50-100 ud) en una categoría conocida (polos,
            bolsas, libretas).
          </li>
          <li>
            Exige mockup técnico real antes de producir. Si no te lo dan, no es
            proveedor profesional.
          </li>
          <li>
            Pide certificado al recibir el pedido con: lugar de producción,
            cantidad, horas de trabajo, número CEE oficial.
          </li>
          <li>
            Si la prueba va bien, escala a un pedido grande (kit anual,
            renovación textil equipo).
          </li>
        </ol>
      </PillarShell>
    </>
  );
}
