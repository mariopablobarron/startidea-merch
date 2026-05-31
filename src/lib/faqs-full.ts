/**
 * FAQ ampliadas para la página /faq.
 * Organizadas por categoría para que la página tenga estructura.
 *
 * Las 6 esenciales (las del home) siguen en jsonld.ts como FAQ_JSONLD_ITEMS.
 * Aquí se incluyen además las largas/específicas.
 */

export type FaqCategory = {
  slug: string;
  title: string;
  intro?: string;
  items: { q: string; a: string }[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    slug: "cotizacion-y-precio",
    title: "Cotización y precio",
    intro: "Cómo funciona el precio en tiempo real, los rangos típicos por categoría y por qué a veces necesitas cotización formal.",
    items: [
      {
        q: "¿Cómo veo el precio de un producto?",
        a: "Es instantáneo. Entra a la ficha del producto en el catálogo, indica cantidad y opciones de marcaje (técnica, posición, colores). El total se calcula en pantalla sin esperar. Para productos con marcaje muy custom (mockup técnico, plazo cerrado, condiciones especiales), pides cotización formal y la cerramos en menos de 24 h laborables.",
      },
      {
        q: "¿Cobráis algo por la cotización formal?",
        a: "No. La cotización es siempre gratuita, sin compromiso y sin letra pequeña. Si te encaja avanzamos, si no archivamos sin más.",
      },
      {
        q: "¿Qué rango de precio manejo por unidad?",
        a: "Depende mucho de producto y técnica. Como referencia 2026: bolígrafos personalizados desde 0,40 €/ud, camisetas de algodón orgánico desde 4 €/ud, botellas tritan personalizadas desde 5 €/ud, mochilas premium desde 12 €/ud. Marcaje a partir de 0,30 €/ud según técnica.",
      },
      {
        q: "¿Hay descuentos por volumen?",
        a: "Sí, automáticos. Cada producto tiene escalado por cantidad: 50/100/250/500/1000 unidades con descuento creciente. Para tiradas superiores (5.000+ ud) revisamos con el supplier por si hay precio especial.",
      },
      {
        q: "¿Aceptáis facturación pro-forma o pago aplazado?",
        a: "Sí. Para administración pública, grandes empresas con proceso de compras o pedidos sobre 5.000 €, emitimos pro-forma. El pago puede ser 100% al confirmar o 50% / 50% (al confirmar / antes del envío). Pago aplazado a 30 días tras valoración de scoring.",
      },
    ],
  },
  {
    slug: "minimos-y-plazos",
    title: "Mínimos y plazos",
    intro: "Cantidades mínimas reales por categoría, plazos estándar y opciones de urgencia.",
    items: [
      {
        q: "¿Cuál es la cantidad mínima por pedido?",
        a: "Depende del producto. Referencia: textil desde 25 ud (sin mínimo si es bordado), drinkware desde 50 ud, escritura desde 100 ud, regalos eco desde 25-50 ud, electrónica desde 100 ud. Cantidades menores son posibles pero el coste por unidad se eleva considerablemente porque el setup del marcaje se reparte entre menos piezas.",
      },
      {
        q: "¿Cuánto tarda un pedido estándar?",
        a: "Entre 7 y 15 días laborables desde la confirmación del depósito y la aprobación del mockup. El reparto típico es: 1-2 días aprobaciones, 3-7 días producción y marcaje, 2-4 días envío.",
      },
      {
        q: "¿Tenéis pedidos urgentes?",
        a: "Sí, plazos express de 3-5 días laborables sin coste adicional siempre que el stock acompañe y la técnica de marcaje lo permita (serigrafía simple, DTF, tampografía). Bordado y láser en stock europeo pueden alcanzar 5-7 días. Por debajo de 3 días normalmente requiere recargo del 15-20 % por priorización.",
      },
      {
        q: "¿Y si necesito 1.000+ unidades con plazo cerrado para un evento concreto?",
        a: "Para tiradas grandes con plazo crítico (feria, conferencia, evento corporativo), reservamos slot de producción específico tras confirmar pedido. Te damos garantía de fecha cerrada o reembolso del recargo de urgencia.",
      },
    ],
  },
  {
    slug: "tecnicas-de-marcaje",
    title: "Técnicas de marcaje",
    intro: "Serigrafía, bordado, DTF, láser, doming, tampografía: cuándo usar cada una y rangos de coste.",
    items: [
      {
        q: "¿Qué técnica de marcaje conviene para mi caso?",
        a: "Resumen rápido: serigrafía para textil con colores planos y tiradas medias-grandes; bordado para textil premium o logos con buena densidad; DTF para policromía y tiradas pequeñas; láser para metal, madera, drinkware (acabado premium); tampografía para superficies pequeñas y curvas; doming para llaveros y pegatinas. En la ficha de cada producto se ven las técnicas disponibles con el precio calculado al instante.",
      },
      {
        q: "¿Cuál es más duradera?",
        a: "El bordado es la más duradera (resiste lavados industriales, no se decolora). Le siguen láser (permanente en metal/madera), serigrafía (5+ años bien hecha), DTF (3-5 años según uso) y tampografía (similar a DTF).",
      },
      {
        q: "¿Cómo gestionáis logos vectoriales vs PNG?",
        a: "Aceptamos SVG, AI, EPS y PDF vectorial sin coste. Si solo tienes PNG/JPG y la calidad es decente, lo vectorizamos sin coste. Si el logo es muy complejo (degradados, fotografía), evaluamos el mejor acabado por técnica.",
      },
      {
        q: "¿Cuántos colores se pueden imprimir en serigrafía?",
        a: "Hasta 8 colores en serigrafía estándar. Cada color adicional añade un coste de setup. Para logos con 4+ colores muchas veces el DTF o la sublimación salen más eficientes.",
      },
      {
        q: "¿Hacéis muestras antes del pedido grande?",
        a: "Sí. En pedidos a partir de 100 ud enviamos una muestra física previa sin coste. Para tiradas más pequeñas hacemos prueba digital con simulación 3D del marcaje (no es muestra física pero permite validar tamaño y posición).",
      },
    ],
  },
  {
    slug: "produccion-e-impacto",
    title: "Producción e impacto social",
    intro: "Por qué nuestro merchandising se produce en Centros Especiales de Empleo y cómo lo certificamos.",
    items: [
      {
        q: "¿En qué se nota que la producción es con impacto social?",
        a: "Trabajamos con Centros Especiales de Empleo (CEE) y talleres locales con identidad real. Cada cotización lleva un informe de impacto: horas de trabajo digno generadas, % producido en CEE y kg de CO₂ evitados vs proveedor estándar cuando aplica.",
      },
      {
        q: "¿Qué es un Centro Especial de Empleo (CEE)?",
        a: "Empresas con ≥70 % de su plantilla con discapacidad reconocida (>=33 %). Son figuras jurídicas reguladas por la Ley General de derechos de las personas con discapacidad y certificadas por la administración. Nuestra producción puede tributar bajo la Ley 31/1995 y Real Decreto 364/2005 sobre integración laboral.",
      },
      {
        q: "¿Cómo se incorpora a mi reporting ESG/RSC?",
        a: "Tras la entrega te enviamos un certificado oficial con: nº de CEE colaboradores, horas de trabajo digno generadas, % producción CEE vs total y materiales reciclados/orgánicos. Es exportable a tu memoria RSC y reportes ESG (GRI, SASB).",
      },
      {
        q: "¿Aplican deducciones fiscales por trabajar con CEE?",
        a: "Sí, la Ley de Contratos del Sector Público y la Ley 9/2017 reconocen como mérito el origen CEE de los proveedores. Empresas con +50 trabajadores en España tienen cuota de reserva del 2% para personas con discapacidad — incluido subcontratación a CEE como medida alternativa según RD 364/2005.",
      },
    ],
  },
  {
    slug: "materiales-y-sostenibilidad",
    title: "Materiales y sostenibilidad",
    intro: "Algodón orgánico, RPET, materiales reciclados, certificaciones GOTS / OEKO-TEX.",
    items: [
      {
        q: "¿Tenéis catálogo eco / sostenible?",
        a: "Sí. Filtra por etiqueta 'Eco' en el catálogo. Verás textiles con algodón orgánico GOTS, drinkware en RPET reciclado, escritura en bambú o material reciclado, y mochilas con tejido reciclado certificado.",
      },
      {
        q: "¿Qué certificaciones manejáis?",
        a: "GOTS (algodón orgánico), OEKO-TEX Standard 100 (sin químicos nocivos), FSC (madera/papel sostenible), GRS (Global Recycled Standard para textiles reciclados), BSCI (auditoría social en cadena de suministro).",
      },
      {
        q: "¿El RPET es igual de duradero que el material virgen?",
        a: "Sí. El RPET de calidad mantiene las mismas propiedades mecánicas (resistencia, transparencia, hermeticidad) que el PET virgen. Es la opción correcta para drinkware corporativo: misma durabilidad con -40% emisiones CO₂.",
      },
      {
        q: "¿Vuestras tintas de serigrafía son seguras?",
        a: "Sí, todas nuestras tintas son al agua (water-based) certificadas OEKO-TEX. Evitamos PVC/ftalatos y tintas a solvente. Para textil corporativo no tiene sentido lo contrario en 2026.",
      },
    ],
  },
  {
    slug: "logistica-y-envio",
    title: "Logística y envío",
    intro: "Reparto en domicilio, multi-destino, recogidas, almacenaje.",
    items: [
      {
        q: "¿Hacéis envío a varios destinos diferentes?",
        a: "Sí. Para welcome packs de empleados en remoto (España, UE), enviamos pieza a pieza al domicilio que indique cada persona vía formulario corporativo. Coste de envío individual incluido en cotización.",
      },
      {
        q: "¿Cobráis el envío?",
        a: "Depende del volumen y destino. Pedidos +500 € a 1 destino: envío gratis en península. Multi-destino o envío internacional UE: se calcula en cotización y va separado del producto.",
      },
      {
        q: "¿Almacenáis stock para entregas escalonadas?",
        a: "Sí. Para campañas con entregas mensuales/trimestrales (renovación de stock, eventos recurrentes), guardamos en nuestro almacén y dispatchamos según calendario que acuerdes. Hasta 6 meses sin coste de almacenaje.",
      },
      {
        q: "¿Reciclo el embalaje? ¿Hay opción sin plástico?",
        a: "Sí. Por defecto enviamos en cartón reciclado y papel kraft. Sin plástico es opción a coste similar. Para corporativos con políticas zero-waste hacemos embalaje a granel + reparto en cajas reutilizables.",
      },
    ],
  },
  {
    slug: "marketing-y-eventos",
    title: "Marketing y eventos",
    intro: "Ferias, conferencias, lanzamiento de producto, hackathons, welcome kits.",
    items: [
      {
        q: "¿Recomendáis productos para una feria sectorial?",
        a: "Sí, tenemos un recomendador interno que tras un brief corto (público, presupuesto, sector) sugiere 3-5 productos con racional de por qué encajan. También tenemos landings por sector: /sectores/tech, /sectores/eventos, /sectores/aapp, etc.",
      },
      {
        q: "¿Welcome kit estándar para empresas tech remote-first?",
        a: "Pack típico para nueva incorporación tech: camiseta de marca, libreta moleskine corporativa, botella térmica, taza, sticker pack. Coste objetivo 35-50 € por kit incluyendo embalaje cuidado y envío individual. Margen para personalizar 100% según cultura de empresa.",
      },
      {
        q: "¿Material POP para tienda física?",
        a: "Sí. Para retail trabajamos displays, banderolas, totems, expositores con tu identidad de campaña. Cantidades mínimas más bajas que en textil (5-25 ud según pieza) porque suelen ir a pocos puntos de venta.",
      },
    ],
  },
  {
    slug: "garantia-y-devoluciones",
    title: "Garantía y devoluciones",
    intro: "Qué cubrimos si llega defectuoso, plazos de reclamación.",
    items: [
      {
        q: "¿Qué pasa si llega un lote con defectos de fabricación?",
        a: "Si hay defectos por fabricación o marcaje, reponemos el lote completo a cargo nuestro. Plazo de reclamación: 30 días desde la recepción. Te pedimos solo fotos del defecto y muestreo de la cantidad afectada.",
      },
      {
        q: "¿Y si me equivoqué con el logo/colores?",
        a: "Antes de fabricar siempre te pasamos mockup digital o muestra física para aprobación expresa. Si aprobaste y luego cambias de opinión sobre logo, color o tamaño, podemos rehacer el lote pero el coste es del cliente (lo confirmamos siempre antes).",
      },
    ],
  },
];

/** Aplana todas las FAQ en un solo array para Schema.org FAQPage. */
export function getAllFaqItems(): { q: string; a: string }[] {
  return FAQ_CATEGORIES.flatMap((c) => c.items);
}
