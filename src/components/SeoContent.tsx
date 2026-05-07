/**
 * Bloque de contenido SEO denso (>1.800 palabras) para home.
 *
 * Estrategia (auditoría 2026-05-07 vs garrampa.es):
 *   - Garrampa rankea con 2.188 palabras en home cubriendo técnicas de
 *     estampación, casos de uso, FAQ, "por qué confiar".
 *   - TodoMerch tenía ~300 palabras → invisible en SERP orgánico.
 *
 * Este bloque cubre intenciones de búsqueda B2B reales:
 *   - "merchandising corporativo personalizado"
 *   - "regalos empresa baratos"
 *   - "técnicas de marcaje serigrafía DTF láser bordado"
 *   - "qué cantidades mínimas pedir"
 *   - "cuánto tarda en llegar"
 *   - "merchandising sostenible / eco / ESG"
 *
 * Server component (no JS, no motion) — máxima velocidad y crawl bot-friendly.
 */
export function SeoContent() {
  return (
    <section
      aria-labelledby="seo-content-title"
      className="border-t border-line bg-bone py-20 lg:py-28"
    >
      <div className="mx-auto max-w-4xl px-6 lg:px-10">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Guía completa</p>
        <h2
          id="seo-content-title"
          className="mt-3 font-display text-section font-semibold text-ink"
        >
          Todo lo que necesitas saber sobre merchandising corporativo personalizado
        </h2>

        <div className="prose prose-lg mt-10 max-w-none text-ink/80">
          <h3 className="font-display text-2xl font-semibold text-ink">
            Qué es el merchandising corporativo y por qué importa
          </h3>
          <p>
            El merchandising corporativo personalizado es cualquier producto físico —desde un
            bolígrafo hasta una sudadera o un termo— en el que se imprime el logotipo, lema o
            identidad visual de una empresa. Se utiliza como obsequio para empleados, en eventos
            de captación, en ferias sectoriales, como welcome pack para nuevos clientes o como
            regalo de fidelización. Más allá del coste por unidad, el merchandising bien diseñado
            es <strong>publicidad portátil</strong>: cada vez que alguien usa un termo con tu
            marca en una reunión o lleva una mochila tuya por la calle, tu logo recibe impresiones
            sin que pagues por cada visualización.
          </p>
          <p>
            Para que esto funcione, tres cosas tienen que estar bien: el producto debe ser{" "}
            <strong>útil</strong> (que el destinatario quiera usarlo), la{" "}
            <strong>técnica de marcaje adecuada</strong> al material y la cantidad pedida, y la{" "}
            <strong>logística predecible</strong> (que llegue cuando dices que va a llegar). En
            TodoMerchandising integramos catálogos B2B europeos con producción local en Centros
            Especiales de Empleo y talleres artesanos para cubrir las tres dimensiones.
          </p>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Categorías más pedidas en empresas españolas
          </h3>
          <p>
            La estructura típica de un pedido B2B en España suele combinar 2-4 categorías para
            cubrir distintos públicos del mismo evento o campaña:
          </p>
          <ul className="my-6 space-y-3 list-disc pl-6">
            <li>
              <strong>Textil personalizado</strong> (camisetas, polos, sudaderas, gorras): lo más
              versátil para uniformidad de equipos, eventos de empresa, runs corporativas o
              welcome packs. Disponible en algodón orgánico, poliéster reciclado y mezclas
              técnicas.
            </li>
            <li>
              <strong>Drinkware</strong> (botellas reutilizables, termos, tazas, vasos): aliado
              perfecto del discurso ESG. Reduce plásticos de un solo uso y se usa a diario, lo
              que multiplica las impresiones de marca.
            </li>
            <li>
              <strong>Bolsas y mochilas</strong>: tote bags de algodón o PET reciclado, mochilas
              técnicas, bolsas isotérmicas. Útiles tanto en ferias como en regalo a empleados.
            </li>
            <li>
              <strong>Escritura y oficina</strong> (bolígrafos, libretas, organizadores):
              presupuesto bajo por unidad, alta cantidad. Ideal para give-aways masivos en
              ferias o conferencias.
            </li>
            <li>
              <strong>Tecnología</strong> (cargadores inalámbricos, USB, auriculares,
              powerbanks): tickets más altos pero mayor wow effect — adecuado para clientes top
              o como premio interno.
            </li>
            <li>
              <strong>Eventos y experiencia</strong> (lanyards, badges, pulseras, kits de
              bienvenida): específico para conferencias, congresos y onboarding.
            </li>
          </ul>
          <p>
            Cada categoría tiene su técnica de marcaje óptima, su cantidad mínima realista y su
            margen de personalización. Cuando configures tu cotización con nosotros te
            asesoramos en el cruce exacto producto × técnica × cantidad, en lugar de venderte
            siempre la opción más cara.
          </p>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Técnicas de personalización: cuál elegir
          </h3>
          <p>
            La técnica correcta depende del material del producto, los colores del logo, la
            cantidad y el presupuesto. Un resumen práctico:
          </p>
          <ul className="my-6 space-y-3 list-disc pl-6">
            <li>
              <strong>Serigrafía</strong>: la opción tradicional para textil en cantidades
              medias-altas (a partir de 50-100 uds). Coste por unidad bajo, durabilidad excelente,
              hasta 6 colores planos. Coste fijo de pantallas que se amortiza con cantidad.
            </li>
            <li>
              <strong>DTF (Direct to Film)</strong>: tecnología más reciente, ideal para tiradas
              cortas (10-50 uds) o diseños con muchos colores y degradados. Sin coste de pantallas
              y permite fotos. Perfecto para ediciones especiales o equipos pequeños.
            </li>
            <li>
              <strong>Bordado</strong>: aporta percepción premium y durabilidad infinita.
              Recomendado en polos corporativos, gorras, mochilas. Cobra por nº de puntadas
              (más lleno = más caro). El logotipo debe digitalizarse profesionalmente la primera
              vez.
            </li>
            <li>
              <strong>Tampografía</strong>: estampación pequeña en superficies curvas o pequeñas
              (bolígrafos, tazas, llaveros). Hasta 4 colores. Estándar de la industria
              promocional.
            </li>
            <li>
              <strong>Grabado láser</strong>: marcado permanente en metal, madera o cuero. Sin
              tinta, color del propio material. Ideal para termos, productos de oficina premium,
              regalos top.
            </li>
            <li>
              <strong>Sublimación</strong>: imprime fotografías y diseños complejos en textil
              poliéster o cerámica (tazas). Resultado fotográfico pero limitado a ciertos
              materiales.
            </li>
            <li>
              <strong>Doming</strong>: pegatina con resina transparente sobre el logo, efecto
              3D brillante. Llaveros, USB, badges.
            </li>
          </ul>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Cantidades mínimas y descuentos por volumen
          </h3>
          <p>
            En merchandising corporativo, el precio por unidad cae rápido con la cantidad porque
            los costes fijos (montaje, pantallas, set-up de máquina) se amortizan entre todas las
            unidades. Como referencia general:
          </p>
          <ul className="my-6 space-y-2 list-disc pl-6">
            <li>
              Bolígrafos personalizados: mínimo razonable 100-250 uds. A partir de 1.000 uds el
              precio por unidad puede bajar a céntimos.
            </li>
            <li>
              Camisetas serigrafiadas: mínimo 25-50 uds para que la pantalla se amortice. A
              partir de 100 uds el ratio precio/calidad es óptimo.
            </li>
            <li>
              Termos grabados con láser: desde 25 uds. El láser no tiene coste fijo de pantalla,
              así que escala bien incluso en tiradas cortas.
            </li>
            <li>
              Bolsas tote: desde 50 uds en serigrafía, 10-25 uds en DTF.
            </li>
          </ul>
          <p>
            En cualquier caso, antes de comprometerte con una cantidad, pídenos cotización con 2-3
            tramos diferentes (ej: 100, 250 y 500 uds) y compara. En muchos casos pasar de 100 a
            250 uds reduce el coste total en un 20-30 % aunque el pedido sea mayor — lo que sobre
            puede usarse para una segunda campaña sin volver a pagar set-up.
          </p>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Plazos de entrega realistas
          </h3>
          <p>
            Un proyecto de merchandising bien gestionado pasa por estas fases: cotización (24h
            desde que envías brief), aprobación de mockup (1-2 días para idas y venidas), pago
            del depósito, producción (5-15 días según técnica y cantidad) y envío (1-3 días en
            Península). En total, <strong>de 7 a 21 días naturales</strong> desde la confirmación
            del mockup hasta tener los productos en tu oficina.
          </p>
          <p>
            Para campañas estacionales (Black Friday, Navidad, Fitur, evento corporativo de fin
            de año), recomendamos arrancar 6-8 semanas antes para evitar los cuellos de botella
            de proveedor en periodos de alta demanda. Si necesitas urgencia (menos de 7 días),
            avísanos en el formulario de cotización y filtramos catálogo por productos con stock
            inmediato y técnicas de marcaje rápido.
          </p>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Sostenibilidad e impacto social
          </h3>
          <p>
            En 2026 el comprador B2B exige cada vez más transparencia. Tu departamento de
            sostenibilidad, RSC o compras va a preguntarte por la trazabilidad del proveedor,
            las certificaciones del producto (Oeko-Tex, GOTS, Fair Wear, FSC) y el origen de
            la mano de obra que lo personaliza. En TodoMerchandising producimos en{" "}
            <strong>Centros Especiales de Empleo</strong> (CEE) — empresas con &gt;70 % de
            plantilla con discapacidad— y en talleres locales españoles. Cada pedido genera
            métrica auditable de horas de trabajo creadas, que reportamos en el portal del
            cliente.
          </p>
          <p>
            En el catálogo encontrarás filtros para productos con materiales reciclados, algodón
            orgánico, plástico recuperado del océano (Polylana, RPET) y producción europea.
            También trabajamos productos de proveedores con certificación CO₂ neutral. Si tu
            empresa tiene política de compras verdes, podemos ayudarte a alinear el pedido con
            tus criterios y firmar la documentación necesaria.
          </p>

          <h3 className="mt-12 font-display text-2xl font-semibold text-ink">
            Cómo solicitar tu cotización en TodoMerchandising
          </h3>
          <p>
            El proceso es directo y sin compromiso: explora el catálogo (más de 2.000 productos
            con precio "desde" visible en cada tarjeta), añade los que te interesan al
            configurador, indica cantidad y técnica de marcaje. Te devolvemos cotización
            cerrada en menos de 24 horas laborables con depósito flexible (50 % al confirmar,
            50 % antes del envío) y condiciones de pago adaptadas a tu departamento contable
            (transferencia, tarjeta vía Stripe Checkout, Apple Pay, Google Pay). Una vez
            confirmas, gestionamos mockup, producción y entrega y te avisamos en cada hito
            por email y opcionalmente por WhatsApp.
          </p>
          <p>
            Si prefieres hablar antes con una persona —porque tienes un brief complejo, varias
            categorías o un evento con deadline duro— pulsa el botón "Pedir cotización" en la
            cabecera y descríbenos brevemente el proyecto. Un asesor humano te marca en 1 hora
            laborable y resolvemos todo de viva voz.
          </p>
        </div>
      </div>
    </section>
  );
}
