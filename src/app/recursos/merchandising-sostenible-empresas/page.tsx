import type { Metadata } from "next";
import { PillarShell, FaqJsonLd } from "@/components/pillar/PillarShell";

export const metadata: Metadata = {
  title: "Merchandising sostenible para empresas: guía 2026 · TodoMerchandising",
  description:
    "Cómo elegir merchandising corporativo verdaderamente sostenible: materiales certificados (RPET, algodón orgánico, FSC), producción ética en CEE, métricas para tu memoria GRI/EFRAG. Sin greenwashing.",
  openGraph: {
    url: "/recursos/merchandising-sostenible-empresas",
    title: "Merchandising sostenible para empresas · guía 2026",
    description:
      "Qué es merchandising sostenible de verdad, qué certificaciones exigir, cómo medir el impacto para tu memoria de sostenibilidad.",
  },
  alternates: { canonical: "/recursos/merchandising-sostenible-empresas" },
};

const FAQS = [
  {
    q: "¿Qué hace que un merchandising sea realmente sostenible?",
    a: "Tres cosas reportables: (1) materiales con certificación reconocida (GRS para reciclados, GOTS para algodón orgánico, FSC para papel/madera, RPET para plástico reciclado); (2) producción auditable — quién lo hace, dónde y en qué condiciones laborales; (3) trazabilidad documental que puedas incluir en tu memoria. Todo lo demás es marketing.",
  },
  {
    q: "¿Realmente compensa pagar más por merchandising sostenible?",
    a: "Para empresas obligadas a reportar (memoria GRI, EFRAG, VSME) compensa de forma directa: cada euro reasignado a producción local + CEE se convierte en métricas reportables (kg CO₂ ahorrados, horas trabajo digno, % producción ética). Además, los productos con materiales certificados tienen vida útil más larga, lo que reduce coste por uso.",
  },
  {
    q: "¿Greenwashing? ¿Cómo evitar caer en mensajes huecos?",
    a: "Exige siempre dos cosas al proveedor: (1) ficha del producto con certificaciones específicas (número de certificado, no solo logos), y (2) certificado por pedido firmado por el proveedor con las cantidades reales producidas y el origen verificable. Si no te lo entregan, no es sostenible — es marketing.",
  },
  {
    q: "¿Hay productos sostenibles con buen precio o todo es caro?",
    a: "Hay opciones desde 1-2€/ud (bolígrafos RPET, libretas papel reciclado, bolsas algodón orgánico). El sobreprecio frente a la alternativa convencional suele estar entre 10% y 30% — y se compensa al integrarlo en la memoria RSC. El truco es no caer en el otro extremo (premium artificial).",
  },
  {
    q: "¿Cuánto tarda un pedido sostenible vs un pedido estándar?",
    a: "Producción local con marcaje sencillo: 7-12 días laborables. Producción estándar importada: 15-25 días. Y con sostenible tienes la ventaja de hacer pedidos pequeños (50-100 ud) sin sobrecoste prohibitivo, cosa imposible con contenedor desde Asia.",
  },
  {
    q: "¿Puedo medir el impacto real para mi memoria de sostenibilidad?",
    a: "Sí — y deberías exigirlo. Nosotros te emitimos certificado auditado por pedido con: kg CO₂ ahorrados (vs línea base producción asiática), horas de trabajo digno generadas, % producción CEE, materiales certificados. Datos listos para GRI 304/305/308 y EFRAG E1/S1.",
  },
];

export default function MerchandisingSostenibleEmpresasPage() {
  return (
    <>
      <FaqJsonLd faqs={FAQS} />
      <PillarShell
        eyebrow="— Guía 2026"
        title="Merchandising sostenible para empresas."
        titleAccent="Sin greenwashing, con datos verificables."
        lead="Las empresas obligadas a reportar (GRI, EFRAG, VSME) no necesitan promesas: necesitan cifras auditables. Esta guía es para los equipos de marketing y RSC que tienen que justificar cada euro de presupuesto y, encima, convertirlo en métrica de impacto."
        tldr={[
          "Sostenible ≠ etiqueta verde. Sostenible = materiales certificados + producción auditable + certificado por pedido.",
          "Para tu memoria importan 4 datos: kg CO₂ ahorrados, horas trabajo digno generadas, % producción local/CEE, materiales certificados.",
          "El sobreprecio frente a la alternativa convencional ronda el 10-30%, pero se convierte directamente en métrica reportable.",
        ]}
        faqs={FAQS}
        ctaTitle="Calcula tu impacto en 30 segundos."
        ctaSubtitle="Te decimos cuánto CO₂ ahorrarías y cuántas horas de trabajo digno generarías reasignando tu presupuesto actual. Certificado PDF firmado para tu memoria."
      >
        <h2 id="que-es">¿Qué hace que un merchandising sea realmente sostenible?</h2>
        <p>
          La palabra <em>sostenible</em> está tan saturada que ya no significa nada.
          Para una empresa obligada a reportar en su memoria anual, sostenible
          significa exactamente tres cosas <strong>verificables</strong>:
        </p>
        <ol>
          <li>
            <strong>Materiales con certificación reconocida</strong>: GRS (Global
            Recycled Standard) para reciclados, GOTS para algodón orgánico, FSC para
            papel/madera, RPET para plástico reciclado, Oeko-Tex 100 para textiles
            sin sustancias nocivas.
          </li>
          <li>
            <strong>Producción auditable</strong>: saber quién lo fabrica, dónde, y
            en qué condiciones laborales. Producción local Andalucía + Centros
            Especiales de Empleo entrega esto de forma directa.
          </li>
          <li>
            <strong>Certificado documental por pedido</strong> con cantidades reales,
            origen, materiales y, opcionalmente, métricas de impacto. Si tu
            proveedor no te lo entrega, no estás comprando sostenible — estás
            comprando marketing.
          </li>
        </ol>

        <h2 id="por-que-importa">Por qué importa ahora (CSRD, EFRAG, VSME)</h2>
        <p>
          Desde 2024, la directiva CSRD obliga a empresas grandes y, progresivamente,
          a medianas (a partir de 2026 las que cotizan en bolsa, en 2027 PYMES con
          determinados umbrales) a reportar su impacto ambiental, social y de
          gobernanza con el marco EFRAG. Las PYMES no obligadas pueden usar el marco
          voluntario <strong>VSME</strong> y, en cualquier caso, sus clientes corporativos
          se lo piden cada vez más (es habitual que un cliente grande te exija
          datos de proveedor para su propio reporte).
        </p>
        <p>
          Esto convierte cada compra corporativa en un dato potencialmente reportable.
          Y el merchandising, por ser una partida visible y con producción asociada
          medible, es un caso fácil de auditar. <strong>Por eso es de las primeras
          áreas que el departamento de sostenibilidad mira al apretar.</strong>
        </p>

        <h2 id="metricas-clave">Las 4 métricas que sí valen para tu memoria</h2>
        <p>
          De toda la lista de buzzwords sostenibles, solo 4 cifras aparecen en
          memorias serias. El resto sobra:
        </p>
        <ul>
          <li>
            <strong>kg de CO₂ ahorrados</strong> vs línea base producción asiática
            convencional. Reportable bajo GRI 305 / EFRAG E1.
          </li>
          <li>
            <strong>Horas de trabajo digno generadas</strong> (con desglose de
            personas con discapacidad si aplica). GRI 401 / EFRAG S1.
          </li>
          <li>
            <strong>% de producción en CEE / talleres locales</strong>. GRI 204 /
            EFRAG S2.
          </li>
          <li>
            <strong>% de materiales certificados</strong> en el pedido (GRS, GOTS,
            FSC, RPET). GRI 301 / EFRAG E5.
          </li>
        </ul>
        <p>
          Si tu proveedor no puede darte estas 4 cifras por pedido,
          <strong> no es un proveedor sostenible</strong> para una empresa que reporta. Es un
          proveedor genérico con etiqueta verde.
        </p>

        <h2 id="comparativa">Sostenible serio vs marketing verde</h2>
        <table>
          <thead>
            <tr>
              <th>Aspecto</th>
              <th>Sostenible auditable</th>
              <th>Marketing verde</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Material</td>
              <td>Certificado (GRS, GOTS, FSC...) con número</td>
              <td>&quot;Hecho con materiales reciclados&quot; sin documento</td>
            </tr>
            <tr>
              <td>Origen</td>
              <td>Documentado (fábrica, país, CEE)</td>
              <td>&quot;Producción europea&quot; sin detalle</td>
            </tr>
            <tr>
              <td>Certificado por pedido</td>
              <td>Sí, firmado por proveedor</td>
              <td>No, o genérico de marketing</td>
            </tr>
            <tr>
              <td>Datos para tu memoria</td>
              <td>kg CO₂, h trabajo, % CEE, materiales</td>
              <td>Frase &quot;cuidamos el planeta&quot;</td>
            </tr>
            <tr>
              <td>Trazabilidad</td>
              <td>Auditable (te abren la fábrica)</td>
              <td>Opacidad</td>
            </tr>
          </tbody>
        </table>

        <h2 id="por-sector">Por qué encaja en tu sector</h2>
        <ul>
          <li>
            <strong>Tech</strong>: tus inversores ya te miran ESG. Convierte el kit
            onboarding en métrica positiva del informe trimestral.
          </li>
          <li>
            <strong>Eventos corporativos</strong>: la sostenibilidad del evento entra
            en tu rating de proveedor preferente (varias empresas grandes ya lo
            exigen en RFPs).
          </li>
          <li>
            <strong>Retail</strong>: producto de campaña que cuenta una historia
            asociada a marca. Mejora la conversión emocional.
          </li>
          <li>
            <strong>RRHH</strong>: kit nuevo empleado con propósito. Reduce churn
            cultural medible.
          </li>
        </ul>

        <h2 id="errores">3 errores comunes al elegir sostenible</h2>
        <ol>
          <li>
            <strong>Pagar premium por bambú o algodón &quot;eco&quot; sin verificar
            certificado</strong>. El bambú importado de Asia con química convencional
            no es mejor que el plástico local. Pide número de certificado siempre.
          </li>
          <li>
            <strong>Comprar &quot;recyclable&quot; en vez de &quot;recycled&quot;</strong>.
            <em> Recyclable</em> = teóricamente reciclable algún día. <em>Recycled</em>
            = hecho con material ya reciclado. Es la diferencia entre un PET virgen
            que igual se recicla y un RPET certificado que ya redujo el impacto.
          </li>
          <li>
            <strong>Comprar &quot;a granel sin marca&quot; pensando que es más sostenible</strong>.
            La marca personalizada genera engagement emocional y vida útil más larga.
            Sin marca, la pieza acaba en cajón → tirada. Personalización ≠ contradicción
            con sostenibilidad.
          </li>
        </ol>
      </PillarShell>
    </>
  );
}
