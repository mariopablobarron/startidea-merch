import type { Metadata } from "next";
import { PillarShell, FaqJsonLd } from "@/components/pillar/PillarShell";

export const metadata: Metadata = {
  title: "Merchandising producido en España: ventajas reales 2026 · TodoMerchandising",
  description:
    "Comparativa producción local España vs importación Asia: plazos, sobreprecio real, control de calidad, trazabilidad, impacto ambiental. Datos para decidir con criterio en B2B.",
  openGraph: {
    url: "/recursos/merchandising-producido-espana",
    title: "Merchandising producido en España · comparativa 2026",
    description:
      "Plazos 7-12 días, MOQ 50 ud, control de calidad inmediato y huella ambiental verificable. Lo que pierdes y lo que ganas frente a importar.",
  },
  alternates: { canonical: "/recursos/merchandising-producido-espana" },
};

const FAQS = [
  {
    q: "¿Cuánto más caro es producir en España vs importar de Asia?",
    a: "Depende del producto. En producto técnico complejo (electrónica, textiles con tecnología) el sobreprecio puede ser 40-80%. En producto sencillo o intermedio (textiles básicos, papelería, kit corporativo) está entre 10% y 30%. Y el cálculo correcto NO es precio por unidad — es coste total incluyendo flete, aranceles, gestión de aduana, almacenaje, retrasos y pedidos mínimos.",
  },
  {
    q: "¿Y si quiero pedir solo 100 unidades?",
    a: "Producción local + CEE acepta MOQ desde 50-100 unidades en la mayoría de categorías. Producción Asia exige normalmente 500-1.000 unidades por referencia para que el cálculo cuadre. Si tu campaña es de 100 polos, no es opción real importar — o pagas margen ridículo o subes el pedido innecesariamente.",
  },
  {
    q: "¿Cuánto tarda en llegarme un pedido producido en España?",
    a: "Plazos típicos: 7-12 días laborables desde aprobación de mockup, dependiendo de técnica de marcaje. Bordado y serigrafía 7-10 días, transfer DTF 5-7, láser 10-12. Frente a 15-25 días por avión + aduana o 35-50 días por barco de Asia. Para eventos de fecha cerrada, la diferencia es decisiva.",
  },
  {
    q: "¿Qué control de calidad puedo hacer si produzco en España?",
    a: "Puedes visitar la fábrica, ver muestras físicas en 48h, exigir auditoría, corregir errores antes de cerrar el pedido. Si produces en Asia, te llega el contenedor → si algo va mal, recibes el problema entero. Para empresas que necesitan consistencia (kit anual, polos de equipo) la diferencia compensa de sobra.",
  },
  {
    q: "¿Producir en España es siempre la mejor opción?",
    a: "No. Hay casos donde Asia gana: volumen muy grande (5.000+ unidades del mismo producto), producto técnico que requiere herramental específico, plazo largo (4+ meses) sin presión de fecha. La regla práctica: bajo volumen o fecha apretada o requisito RSC = local. Volumen masivo + tiempo + producto técnico estándar = Asia.",
  },
  {
    q: "¿La huella de carbono justifica el sobreprecio?",
    a: "Para empresas que reportan en su memoria, sí — porque convierte el sobreprecio en métrica positiva (kg CO₂ ahorrados). Para empresas que no reportan, depende del marketing del cliente final: si tu pedido se entrega con certificado &quot;producido en España + Centro Especial de Empleo&quot;, la pieza tiene una historia que el merchandising importado no puede tener.",
  },
];

export default function MerchandisingProducidoEspanaPage() {
  return (
    <>
      <FaqJsonLd faqs={FAQS} />
      <PillarShell
        eyebrow="— Comparativa honesta 2026"
        title="Merchandising producido en España."
        titleAccent="Lo que ganas y lo que pierdes frente a importar."
        lead="No vamos a venderte que producir en España es siempre mejor. Vamos a contarte cuándo lo es y cuándo no, con cifras concretas: plazos, MOQ, sobreprecio real, ventajas operativas. Para que decidas con criterio sin guiarte por slogans."
        tldr={[
          "Plazos típicos 7-12 días laborables vs 15-50 días desde Asia. MOQ desde 50-100 ud vs 500-1.000.",
          "Sobreprecio real: 10-30% en producto estándar (textil, papelería), 40-80% en producto técnico complejo.",
          "Ganas: control de calidad, capacidad de iterar, trazabilidad, métricas RSC reportables. Pierdes: economía de escala extrema (5.000+ ud del mismo producto).",
        ]}
        faqs={FAQS}
        ctaTitle="Precio al instante en el catálogo."
        ctaSubtitle="Entra, elige cantidad y marcaje, y verás el total exacto. Si necesitas mockup técnico, plazo cerrado o certificado de origen, los emitimos en 24h laborables."
      >
        <h2 id="cuando-local">Cuándo producción local es la decisión correcta</h2>
        <p>
          La pregunta no es ideológica — es operativa. Producir en España es la mejor
          opción cuando se cumple <strong>al menos una</strong> de estas condiciones:
        </p>
        <ol>
          <li>
            <strong>Bajo volumen</strong>: pedidos de 50-500 unidades por referencia.
            En este rango, la economía de escala asiática no aplica y los gastos
            fijos de importación (flete, aduana, gestión) absorben la diferencia de
            precio unitario.
          </li>
          <li>
            <strong>Fecha apretada</strong>: evento o entrega en menos de 3 semanas.
            Importar de Asia con margen seguro requiere 5-6 semanas mínimo. Por aire
            es posible pero el sobrecoste se come la diferencia.
          </li>
          <li>
            <strong>Requisito RSC o cliente que pide trazabilidad</strong>: si la
            empresa o su cliente final exige datos de proveedor, origen, condiciones
            laborales, certificaciones — local es la única opción documentable de
            verdad.
          </li>
          <li>
            <strong>Producto que necesita iteración</strong>: kits de bienvenida que
            cambian cada trimestre, campañas piloto, productos con prueba A/B. La
            agilidad local permite probar y corregir; la importación no.
          </li>
        </ol>

        <h2 id="cuando-asia">Cuándo importar de Asia sigue ganando</h2>
        <p>
          Para no ser deshonesto: hay tres casos donde importar es objetivamente
          mejor:
        </p>
        <ul>
          <li>
            <strong>Volumen muy alto del mismo SKU</strong> (5.000+ unidades).
            Contenedor a 12-15 céntimos por unidad imposible de igualar localmente.
          </li>
          <li>
            <strong>Producto técnico estándar</strong> (powerbanks, auriculares,
            cargadores) con herramental específico ya amortizado en fábricas
            asiáticas.
          </li>
          <li>
            <strong>Plazo largo sin presión</strong> (4+ meses) y diseño congelado
            sin cambios.
          </li>
        </ul>
        <p>
          Si tu caso no cumple ninguna de estas 3 → local es la decisión racional, no
          la decisión &quot;cara&quot;.
        </p>

        <h2 id="coste-total">El cálculo correcto: coste total, no precio unitario</h2>
        <p>
          Cuando comparas un proveedor local con uno asiático, el precio por unidad
          es solo una variable. El cálculo realista incluye:
        </p>
        <ul>
          <li>Flete internacional (avión o barco)</li>
          <li>Aranceles (variable por producto, 0-12%)</li>
          <li>Gestión de aduana y agente</li>
          <li>Almacenaje hasta entrega final</li>
          <li>Coste de stock muerto si pides de más para llegar al MOQ</li>
          <li>Riesgo de retraso (¿cuánto te cuesta un evento sin merchandising?)</li>
          <li>Coste de gestión de incidencias post-entrega (revisión, devoluciones)</li>
        </ul>
        <p>
          En pedidos por debajo de 1.000 unidades, este cálculo suele invertir la
          ecuación: producción local sale igual o más barata <em>en coste total</em>,
          aunque el precio unitario sea superior.
        </p>

        <h2 id="comparativa">Comparativa concreta · pedido 250 polos bordados</h2>
        <table>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Local Andalucía + CEE</th>
              <th>Importado Asia (avión)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Precio unitario</td><td>9,50 €</td><td>5,80 €</td></tr>
            <tr><td>Flete + aduana</td><td>0 €</td><td>1,90 € / ud</td></tr>
            <tr><td>MOQ</td><td>50 ud</td><td>500 ud (mín)</td></tr>
            <tr><td>Coste stock muerto (250 vs 500)</td><td>0 €</td><td>~1.450 € (250 ud sobrantes)</td></tr>
            <tr><td>Plazo</td><td>10 días lab.</td><td>20-25 días</td></tr>
            <tr><td>Total para 250 ud</td><td><strong>2.375 €</strong></td><td><strong>3.375 € + sobrante</strong></td></tr>
            <tr><td>Métrica RSC reportable</td><td>Sí (15 h trabajo CEE + 12 kg CO₂)</td><td>No</td></tr>
          </tbody>
        </table>
        <p>
          Ese ejemplo es real — y la situación se repite en la mayoría de pedidos
          corporativos de tamaño medio.
        </p>

        <h2 id="que-pedir">Qué pedir siempre a tu proveedor local</h2>
        <ul>
          <li>Cotización cerrada por escrito (producto + marcaje + plazo + precio final)</li>
          <li>Mockup técnico antes de producir (no solo previsualización)</li>
          <li>Certificado de origen del pedido firmado al entregar</li>
          <li>Datos de impacto si los necesitas para tu memoria</li>
          <li>Política clara de devoluciones y revisiones</li>
        </ul>
      </PillarShell>
    </>
  );
}
