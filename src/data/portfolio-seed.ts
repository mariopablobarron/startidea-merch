/**
 * Semilla de trabajos realizados (2016-2026) extraídos del histórico Gmail
 * de mario@startidea.es. Se inserta vía POST /api/admin/portfolio/seed-30
 * (idempotente por título).
 *
 * Todos los items están ACTIVOS con nombre real del cliente. Mario es quien
 * decide si activar/destacar/editar/borrar desde el panel admin — la semilla
 * solo da el punto de partida.
 *
 * Regla anti-exposición proveedores: la descripción NUNCA menciona Cifra,
 * MidOcean, Makito, Eben-Ezer, Sumejorimagen, Giving Europe ni Stricker —
 * solo técnicas neutras (arenado, serigrafía, DTF, láser, tampografía…).
 *
 * imageUrl: placeholder placehold.co con paleta de marca (ink/bone). Mario
 * sustituye en /admin/marketing/portfolio con foto real subida desde el
 * propio editor cuando descargue los PDF/JPG de Gmail.
 *
 * Planilla con links Gmail por cliente:
 *   ~/Desktop/bocetos-clientes-2017-2026/INDICE-30-EJEMPLOS.md
 */

// Paleta marca (usada en globals.css): ink #0F0F0E, bone #F5F2EC, accent #E64571
const INK = "0F0F0E";
const BONE = "F5F2EC";

function placeholder(text: string): string {
  // placehold.co soporta saltos de línea con %5Cn. Cortar si supera 500 chars (límite del schema).
  const url = `https://placehold.co/800x800/${INK}/${BONE}/png?text=${encodeURIComponent(text)}&font=raleway`;
  return url.length > 500 ? url.slice(0, 500) : url;
}

export type PortfolioSeedItem = {
  title: string;
  description: string;
  clientName: string;
  sector: string;
  featured: boolean;
  active: boolean;
  order: number;
  imageUrl: string;
};

// Helpers para mantener todas las cards activas y reducir ruido en el seed
// SEGURO POR DEFECTO (2026-06-09): todos los ejemplos entran OCULTOS
// (active:false, featured:false). Aunque se pulse "Poblar", NADA sale
// público hasta que Mario active item por item desde /admin/marketing/portfolio,
// y SOLO los clientes de los que tenga permiso/consentimiento para mostrar
// su nombre. Evita exponer nombres reales de clientes (Lactalis, Koh Young,
// Cámara Comercio, despachos, etc.) sin autorización.
//
// FEAT/ITEM se mantienen como marca semántica del "candidato a destacado"
// vs "candidato normal", pero AMBOS entran inactivos. El admin decide.
const FEAT = (order: number, title: string, clientName: string, sector: string, description: string, placeholderText: string): PortfolioSeedItem => ({
  title,
  description,
  clientName,
  sector,
  featured: false,
  active: false,
  order,
  imageUrl: placeholder(placeholderText),
});

const ITEM = (order: number, title: string, clientName: string, sector: string, description: string, placeholderText: string): PortfolioSeedItem => ({
  title,
  description,
  clientName,
  sector,
  featured: false,
  active: false,
  order,
  imageUrl: placeholder(placeholderText),
});

export const PORTFOLIO_SEED: PortfolioSeedItem[] = [
  // ─── DESTACADOS HOME (featured: true) ────────────────────────────────
  FEAT(10, "Libretas corporativas Diputación Provincial de Granada — 1000 unidades",
    "Diputación Provincial de Granada", "Institucional",
    "Mil libretas en color rojo con marcaje a tinta plateada en portada. Pedido institucional para la Diputación de Granada con envío directo a su sede.",
    "Diputación\nGranada\n2017"),
  FEAT(20, "Pedido institucional Ayuntamiento de Málaga",
    "Ayuntamiento de Málaga", "Institucional",
    "Material personalizado para acto del Ayuntamiento de Málaga con plazo crítico de salida garantizado al día siguiente para llegar a la fecha del evento.",
    "Ayuntamiento\nMálaga\n2017"),
  FEAT(30, "Cristal conmemorativo 25 aniversario SED ONGD",
    "SED ONGD", "ONG",
    "Cristal arenado a medida con texto institucional para conmemorar los 25 años de la ONG SED. Cliente recurrente desde 2017.",
    "SED ONGD\n25 aniversario\n2017"),
  FEAT(40, "Cintas de sombrero corporativas Lactalis Puleva PANTONE 541 C",
    "Lactalis Puleva", "Empresa",
    "Cintas de sombrero personalizadas con marcaje a un color en PANTONE 541 C (azul corporativo). Pedido de gran volumen para feria sectorial.",
    "Lactalis Puleva\nCintas sombrero\n2022"),
  FEAT(50, "Abanicos personalizados Lactalis Puleva",
    "Lactalis Puleva", "Empresa",
    "Abanicos serigrafiados a un color para campaña de verano. Acabado con DTF opcional disponible para resolución más fina.",
    "Lactalis Puleva\nAbanicos\n2024"),
  FEAT(60, "Cristal corporativo Griffith Foods",
    "Griffith Foods", "Empresa",
    "Cristal arenado de alta precisión para regalo institucional de Griffith Foods. Pedido grande con marcaje en múltiples idiomas.",
    "Griffith Foods\nCristal\n2021"),
  FEAT(70, "Cristal evento Aliadas por la Ciudadanía",
    "Aliadas por la Ciudadanía", "ONG",
    "Cristal arenado para acto institucional de Aliadas por la Ciudadanía. Cliente recurrente con varias campañas anuales.",
    "Aliadas\nCiudadanía\n2023"),
  FEAT(80, "Cristal campaña 8M Startidea — Día Internacional de la Mujer",
    "Startidea — campaña 8M", "Evento",
    "Cristal arenado de la campaña 8M con reconocimiento a referentes feministas locales. Proyecto propio del grupo Startidea.",
    "Startidea\n8M\n2023"),
  FEAT(90, "Cristal institucional Granada Social — Startidea",
    "Granada Social", "Evento",
    "Cristal arenado para evento conjunto Granada Social + Startidea. Cliente recurrente del grupo con varios pedidos anuales.",
    "Granada Social\n2023"),
  FEAT(100, "Cartones identificadores Climathon Sevilla",
    "Climathon Sevilla", "Evento",
    "Cartones identificadores serigrafiados a dos colores con ajuste tipográfico al tamaño legible mínimo para evento de innovación climática.",
    "Climathon\nSevilla\n2023"),
  FEAT(110, "Cristal Día Nacional del Deporte",
    "Día Nacional del Deporte", "Evento",
    "Cristal arenado de regalo conmemorativo para evento institucional Día Nacional del Deporte.",
    "Día Nacional\nDeporte\n2022"),
  FEAT(120, "Cristal regalo cliente Koh Young Research Spain",
    "Koh Young Research Spain", "Empresa",
    "Cristal arenado de regalo institucional con logo corporativo internacional para multinacional surcoreana de tecnología de inspección.",
    "Koh Young\nResearch Spain\n2023"),

  // ─── EMPRESAS Y MARCAS ───────────────────────────────────────────────
  ITEM(200, "Material punto venta Crestanevada",
    "Crestanevada", "Empresa",
    "Cristal arenado y material institucional para apertura de tiendas de la cadena Crestanevada en Andalucía.",
    "Crestanevada\nPV\n2021"),
  ITEM(210, "Marcaje técnico Loom — Arcserve",
    "Loom — Arcserve", "Empresa",
    "Pedido marcaje técnico para campaña de captación de clientes en Loom (división Arcserve). Pedido recurrente.",
    "Loom\nArcserve\n2022"),
  ITEM(220, "Material institucional Construalia — plazo crítico",
    "Construalia", "Empresa",
    "Material institucional para Construalia (construcción y rehabilitación) con plazo crítico de salida de talleres y agencia de transporte 24-48 h.",
    "Construalia\n2017"),
  ITEM(230, "Cristal Grupo Prevención Andalucía 3 sedes",
    "Grupo Prevención Andalucía", "Empresa",
    "Cristal arenado con teléfonos y web (gpandalucia.es) para Grupo Prevención Andalucía. Cliente recurrente del sector salud laboral.",
    "Grupo Prevención\nAndalucía\n2016"),
  ITEM(240, "Manta personalizada Bracana",
    "Bracana", "Empresa",
    "Manta con marcaje en esquina, logo a varias tintas con pantones específicos. Pedido empresa Bracana.",
    "Bracana\nManta\n2016"),
  ITEM(250, "Cristal regalo corporativo Meridianos",
    "Meridianos", "Empresa",
    "Cristal arenado para Meridianos (consultoría y servicios profesionales). Pedido institucional con confirmación rápida de montaje.",
    "Meridianos\n2016"),
  ITEM(260, "Material institucional The Butlers Granada",
    "The Butlers", "Empresa",
    "Cristal arenado y material gráfico para The Butlers (eventos y hostelería en Granada).",
    "The Butlers\n2017"),
  ITEM(270, "Cristal industrial Traficalia",
    "Traficalia", "Empresa",
    "Cristal personalizado para Traficalia (señalización y seguridad vial).",
    "Traficalia\n2017"),
  ITEM(280, "Pedido institucional Enboga",
    "Enboga", "Empresa",
    "Material institucional para Enboga con varios bocetos previos y validación múltiple.",
    "Enboga\n2018"),
  ITEM(290, "Cristal industrial Grupo Bidasoa",
    "Grupo Bidasoa", "Empresa",
    "Cristal arenado para Grupo Bidasoa (acero inoxidable industrial). Pedido recurrente.",
    "Grupo Bidasoa\n2019"),
  ITEM(300, "Material farmacéutico Rafarma",
    "Rafarma", "Empresa",
    "Cristal arenado y libreta personalizada para Rafarma (distribuidor farmacéutico).",
    "Rafarma\n2019"),
  ITEM(310, "Cristal empresa Esmovil.es",
    "Esmovil.es", "Empresa",
    "Cristal arenado para Esmovil.es (servicios técnicos móviles).",
    "Esmovil.es\n2020"),
  ITEM(320, "Cristal Neotalentway / Granada Social",
    "Neotalentway", "Empresa",
    "Cristal arenado de regalo institucional para Neotalentway (hub de talento). Pedido conjunto con campaña Granada Social.",
    "Neotalentway\n2022"),
  ITEM(330, "Cristal personalizado Conzientemente",
    "Conzientemente", "Empresa",
    "Cristal arenado para marca alineada con consumo responsable. Dos campañas en el mismo año.",
    "Conzientemente\n2024"),
  ITEM(340, "Cristal flota Loxa Trans",
    "Loxa Trans", "Empresa",
    "Cristal arenado de regalo navideño a flota de conductores y agentes comerciales de Loxa Trans.",
    "Loxa Trans\n2024"),
  ITEM(350, "Cristal regalo cliente Materiales Mundo Kasa",
    "Materiales Mundo Kasa", "Empresa",
    "Cristal arenado de regalo institucional de Materiales Mundo Kasa (distribuidora materiales construcción).",
    "Mundo Kasa\n2024"),
  ITEM(360, "Muñeco personalizado UpToMe",
    "UpToMe", "Empresa",
    "Producción de muñeco/figura personalizada a medida para UpToMe (marca regalo personalizado). Acompañamiento desde modelo a serie.",
    "UpToMe\nMuñeco\n2016"),
  ITEM(370, "Globos publicitarios Hispánica de Globos",
    "Hispánica de Globos", "Empresa",
    "Globos publicitarios personalizados para campañas. Coordinación con distribuidor especialista.",
    "Hispánica\nGlobos\n2016"),
  ITEM(380, "Pedido internacional Tejobrinde Portugal",
    "Tejobrinde Portugal", "Empresa",
    "Coordinación con distribuidor portugués Tejobrinde para pedido cross-border Iberia. Ejemplo de proyecto internacional.",
    "Tejobrinde\nPortugal\n2016"),
  ITEM(390, "Regalo corporativo Intertek",
    "Intertek", "Empresa",
    "Material personalizado para multinacional británica de certificación (testing, inspection, certification).",
    "Intertek\n2017"),

  // ─── INSTITUCIONALES Y ASOCIACIONES EMPRESARIALES ─────────────────────
  ITEM(400, "Cristal institucional Club Cámara Comercio Granada",
    "Club Cámara Comercio Granada", "Institucional",
    "Cristal arenado para acto institucional de Cámara de Comercio. Cliente recurrente con varios pedidos anuales.",
    "Cámara Comercio\n2023"),
  ITEM(410, "Portamóviles Club Cámara Comercio Granada",
    "Club Cámara Comercio Granada", "Institucional",
    "Portamóviles serigrafiados para acto institucional. Acompañamiento gráfico al cristal arenado.",
    "Cámara Comercio\nMóviles\n2024"),
  ITEM(420, "Pulseras serigrafiadas AJE Granada + EIG",
    "AJE Granada + EIG", "Institucional",
    "Pulseras con adaptación de tamaño de letra para mejorar legibilidad en circunferencia pequeña. Pedido conjunto con Encuentro Iberoamericano.",
    "AJE Granada\nEIG\n2022"),
  ITEM(430, "Cinta gafas color corporativo AJE Granada",
    "AJE Granada", "Institucional",
    "Cinta para gafas en color corporativo (con opción alternativa en blanco). Asociación de Jóvenes Empresarios de Granada.",
    "AJE Granada\nCinta gafas\n2024"),
  ITEM(440, "Cristal cubertería Alianza Francesa",
    "Alianza Francesa", "Institucional",
    "Cristal arenado de cubertería para Alianza Francesa. Cliente recurrente con varios años de pedidos.",
    "Alianza Francesa\n2017"),
  ITEM(450, "Cristal evento FESIE",
    "FESIE", "Institucional",
    "Cristal arenado para evento de Federación empresarial nacional vinculada a innovación.",
    "FESIE\n2023"),

  // ─── JURÍDICO ────────────────────────────────────────────────────────
  ITEM(500, "Cristal regalo corporativo HispaColex",
    "HispaColex", "Jurídico",
    "Cristal arenado para regalo institucional del despacho jurídico HispaColex (Granada).",
    "HispaColex\n2022"),
  ITEM(510, "Cristal LTA Abogados & Economistas",
    "LTA Abogados & Economistas", "Jurídico",
    "Cristal arenado de regalo de despacho de abogados y economistas LTA. Pedido vinculado a aniversario.",
    "LTA Abogados\n2024"),

  // ─── ONG / PROYECTOS SOCIALES ────────────────────────────────────────
  ITEM(600, "Cristal SED evento",
    "SED ONGD", "ONG",
    "Cristal arenado para evento institucional de SED ONGD. Cliente recurrente desde 2017.",
    "SED\nEvento\n2022"),
  ITEM(610, "Cristal institucional Asprogrades",
    "Asprogrades", "ONG",
    "Cristal arenado para acto institucional de Asprogrades, asociación pro discapacidad intelectual.",
    "Asprogrades\n2023"),
  ITEM(620, "Material campaña APor Solidaridad",
    "APor Solidaridad", "ONG",
    "Material gráfico y serigrafía para campaña institucional de APor Solidaridad (área Participación Ciudadana Andalucía).",
    "APor\nSolidaridad\n2024"),
  ITEM(630, "Camisetas evento Delegación Pastoral Juvenil",
    "Delegación Pastoral Juvenil", "ONG",
    "Camisetas con serigrafía adaptada al tamaño solicitado en pecho. Pedido institucional para encuentro juvenil.",
    "Pastoral\nJuvenil\n2022"),
  ITEM(640, "Material asociación Síndrome 22Q",
    "Asociación Síndrome 22Q", "ONG",
    "Material personalizado para Asociación Síndrome 22Q (enfermedades raras). Causa social.",
    "Síndrome 22Q\n2020"),
  ITEM(650, "Taza personalizada PauCosta Foundation",
    "PauCosta Foundation", "ONG",
    "Taza metálica con impresión en culo de la taza (efecto sorpresa al beber) para PauCosta Foundation.",
    "PauCosta\nFoundation\n2020"),

  // ─── HOSPITALIDAD ────────────────────────────────────────────────────
  ITEM(700, "Bolsas serigrafiadas Los Monteros",
    "Urbanización Los Monteros", "Hospitalidad",
    "Bolsas con serigrafía para urbanización exclusiva de la Costa del Sol. Cliente recurrente desde 2023 con pedidos semestrales.",
    "Los Monteros\nBolsas\n2024"),
  ITEM(710, "Cristal Los Monteros",
    "Urbanización Los Monteros", "Hospitalidad",
    "Cristal arenado para urbanización Los Monteros Marbella. Cliente recurrente.",
    "Los Monteros\nCristal\n2024"),
  ITEM(720, "Cristal Los Monteros 2026",
    "Urbanización Los Monteros", "Hospitalidad",
    "Pedido recurrente 2026 para urbanización Los Monteros. Cliente fidelizado.",
    "Los Monteros\n2026"),
  ITEM(730, "Cristal residentes Residencia El Cerrillo",
    "Residencia El Cerrillo", "Hospitalidad",
    "Cristal arenado personalizado con nombre de cada residente para Residencia de Mayores El Cerrillo.",
    "Residencia\nEl Cerrillo\n2021"),
  ITEM(740, "Cristal cubertería Bar La Parada",
    "Bar La Parada", "Hospitalidad",
    "Cristal personalizado de cubertería para hostelería. Cliente recurrente con 3 pedidos en 18 meses.",
    "Bar La Parada\n2022"),
  ITEM(750, "Cristal Taberna Rocío Granada",
    "Taberna Rocío", "Hospitalidad",
    "Cristal arenado para Taberna Rocío. Hostelería local de Granada.",
    "Taberna Rocío\n2020"),

  // ─── EVENTOS Y CAMPAÑAS ──────────────────────────────────────────────
  ITEM(800, "Camisetas evento Mes Que Ritmes Barcelona",
    "Mes Que Ritmes", "Evento",
    "Camisetas serigrafiadas con diseño adaptado a las pantallas (líneas pequeñas eliminadas para asegurar nitidez). Pedido enviado a Barcelona.",
    "Mes Que Ritmes\nBarcelona\n2017"),
  ITEM(810, "Gorras serigrafiadas Albayzín",
    "Albayzín", "Evento",
    "Gorras con grabado adaptado al tamaño óptimo de visera. Pedido para proyecto de barrio del Albayzín granadino.",
    "Albayzín\nGorras\n2023"),
  ITEM(820, "Stand personalizado Feria Matelec IFEMA — Misscolors",
    "Misscolors", "Evento",
    "Diseño y producción de material gráfico para stand en Feria Matelec (IFEMA Madrid, soluciones eléctricas).",
    "Stand Matelec\nIFEMA\n2016"),

  // ─── EDUCACIÓN ───────────────────────────────────────────────────────
  ITEM(900, "Parasoles Academia New York Granada",
    "Academia New York Granada", "Educación",
    "100 parasoles con dos logotipos distintos (50+50) personalizados para academia de idiomas. Pedido institucional ajustado a mínimo de fabricación.",
    "Academia\nNew York\n2017"),
  ITEM(910, "Cristal reconocimiento Escuela Esmeralda",
    "Escuela Esmeralda", "Educación",
    "Cristal arenado de reconocimiento para Escuela Esmeralda. Pedido recurrente fin de curso.",
    "Escuela\nEsmeralda\n2019"),
  ITEM(920, "Sudaderas Centro Espiral",
    "Centro Espiral", "Educación",
    "70 sudaderas personalizadas para Centro Espiral, proyecto pedagógico alternativo.",
    "Centro Espiral\n2020"),
  ITEM(930, "Material educativo Aulas 2030 — Globauzolan",
    "Aulas 2030 — Globauzolan", "Educación",
    "Material gráfico y web para Aulas 2030 / Globauzolan (proyecto educativo País Vasco-Andalucía).",
    "Aulas 2030\nGlobauzolan\n2020"),
  ITEM(940, "Pins identificadores 35×16 Etitecnic",
    "Etitecnic", "Educación",
    "Pins identificadores para estudiantes de Etitecnic, formato 35×16 mm. Pedido institucional centro de formación.",
    "Etitecnic\nPins\n2016"),
  ITEM(950, "Cristal academia educativa Enciende Tu Mente",
    "Enciende Tu Mente", "Educación",
    "Cristal arenado para academia educativa con pedido recurrente anual.",
    "Enciende Tu Mente\n2021"),

  // ─── SALUD / SECTOR ESPECÍFICO ────────────────────────────────────────
  ITEM(1000, "Pedido Ópticas ClaraVisión Aranda de Duero",
    "Ópticas ClaraVisión", "Empresa",
    "Material institucional personalizado con cambio de tinta a roja (decisión cliente) para Ópticas ClaraVisión Burgos.",
    "Ópticas\nClaraVisión\n2019"),
  ITEM(1010, "Material clínica dental — cabezas anatómicas",
    "Clínica dental", "Empresa",
    "Personalización de cabezas anatómicas para clínica dental. Logo ajustado al máximo tamaño permitido.",
    "Clínica\nDental\n2019"),

  // ─── TEXTIL ──────────────────────────────────────────────────────────
  ITEM(1100, "Camisetas DTF Dorcas",
    "Dorcas", "ONG",
    "Camisetas y prendas con marcaje DTF, adaptado al tamaño mínimo para que no quede excesivamente grande en tallas pequeñas.",
    "Dorcas\nCamisetas DTF\n2026"),
  ITEM(1110, "Camiseta Oswaldoneta",
    "Oswaldoneta", "Empresa",
    "Camiseta serigrafiada con diseño personalizado a un color.",
    "Oswaldoneta\n2024"),
  ITEM(1120, "Sacacorchos 50 aniversario Pepe Garrido",
    "Pepe Garrido — 50 aniversario", "Hospitalidad",
    "Sacacorchos personalizado con marcaje conmemorativo de los 50 años de Pepe Garrido.",
    "Pepe Garrido\n50 aniv\n2024"),
  ITEM(1130, "Sacacorchos Gestión Integral Amianto / Elecnor",
    "Gestión Integral Amianto / Elecnor", "Empresa",
    "Sacacorchos con marcaje lateral y logotipo en la parte superior. Pedido conjunto Gestión Integral Amianto + Elecnor.",
    "GIA / Elecnor\nSacacorchos\n2024"),
  ITEM(1140, "Libreta Diacash",
    "Diacash", "Empresa",
    "Libreta corporativa para Diacash (servicios financieros).",
    "Diacash\nLibreta\n2024"),
];

export const PORTFOLIO_SEED_COUNT = PORTFOLIO_SEED.length;
