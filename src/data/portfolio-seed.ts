/**
 * Semilla de 30 ejemplos de trabajos realizados (2017-2026) extraídos del
 * histórico Gmail de mario@startidea.es. Se inserta vía
 * POST /api/admin/portfolio/seed-30 (idempotente por título).
 *
 * Reglas aplicadas:
 * - Items con consent claro (proyectos propios, ONGs afines, eventos
 *   institucionales) → active: true, clientName real.
 * - Items con cliente "fuerte" pero sin permiso confirmado → active: false,
 *   clientName anonimizado por sector. Mario los activa desde admin tras
 *   pedir permiso al cliente.
 * - NUNCA se mencionan proveedores (Cifra, MidOcean, Makito, Eben-Ezer,
 *   Sumejorimagen, Giving Europe) — solo técnicas neutras.
 *
 * imageUrl: placeholder placehold.co con paleta de marca (ink/bone).
 *           Mario sustituye en /admin/marketing/portfolio con foto real
 *           cuando descargue los PDF/JPG de Gmail.
 *
 * Para la planilla con links a cada email de origen ver:
 *   ~/Desktop/bocetos-clientes-2017-2026/INDICE-30-EJEMPLOS.md
 */

// Paleta marca (usada en globals.css): ink #0F0F0E, bone #F5F2EC, accent #E64571
const INK = "0F0F0E";
const BONE = "F5F2EC";

function placeholder(text: string): string {
  // placehold.co soporta saltos de línea con %5Cn y respeta texto largo.
  // Si supera 500 chars (límite del schema) cortar agresivamente.
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

export const PORTFOLIO_SEED: PortfolioSeedItem[] = [
  // ─── ACTIVOS (proyectos propios + ONGs + eventos con permiso claro) ───
  {
    title: "Cristal conmemorativo 25 aniversario SED ONGD",
    description: "Cristal arenado a medida con texto institucional 'La ONGD SED en sus 25 años' para conmemorar el aniversario de la ONG.",
    clientName: "SED ONGD",
    sector: "ONG",
    featured: true,
    active: true,
    order: 10,
    imageUrl: placeholder("SED ONGD\n25 aniversario\n2017"),
  },
  {
    title: "Cristal evento Aliadas por la Ciudadanía",
    description: "Cristal arenado para acto institucional de Aliadas por la Ciudadanía. Pedido recurrente del cliente con varias campañas anuales.",
    clientName: "Aliadas por la Ciudadanía",
    sector: "ONG",
    featured: true,
    active: true,
    order: 20,
    imageUrl: placeholder("Aliadas\npor la Ciudadanía\n2023"),
  },
  {
    title: "Cristal campaña 8M Startidea — Día Internacional Mujer",
    description: "Cristal arenado de la campaña 8M de Startidea. Proyecto propio: reconocimiento a referentes feministas locales.",
    clientName: "Startidea — campaña 8M",
    sector: "Evento",
    featured: true,
    active: true,
    order: 30,
    imageUrl: placeholder("Startidea\nCampaña 8M\n2023"),
  },
  {
    title: "Cristal institucional Granada Social — Startidea",
    description: "Cristal arenado para evento conjunto Granada Social + Startidea. Cliente recurrente del grupo.",
    clientName: "Granada Social",
    sector: "Evento",
    featured: true,
    active: true,
    order: 40,
    imageUrl: placeholder("Granada Social\nStartidea\n2023"),
  },
  {
    title: "Cartones identificadores Climathon Sevilla",
    description: "Cartones identificadores serigrafiados a 2 colores ajustados al tamaño legible mínimo para evento de innovación climática.",
    clientName: "Climathon Sevilla",
    sector: "Evento",
    featured: true,
    active: true,
    order: 50,
    imageUrl: placeholder("Climathon\nSevilla\n2023"),
  },
  {
    title: "Cristal Día Nacional del Deporte",
    description: "Cristal arenado de regalo conmemorativo para evento institucional Día Nacional del Deporte.",
    clientName: "Día Nacional del Deporte",
    sector: "Evento",
    featured: true,
    active: true,
    order: 60,
    imageUrl: placeholder("Día Nacional\ndel Deporte\n2022"),
  },
  {
    title: "Cristal institucional Asprogrades",
    description: "Cristal arenado para acto institucional de Asprogrades, asociación pro discapacidad intelectual.",
    clientName: "Asprogrades",
    sector: "ONG",
    featured: false,
    active: true,
    order: 70,
    imageUrl: placeholder("Asprogrades\nReconocimiento\n2023"),
  },
  {
    title: "Camisetas serigrafiadas Delegación Pastoral Juvenil",
    description: "Camisetas con serigrafía adaptada al tamaño solicitado en pecho. Pedido institucional para encuentro juvenil.",
    clientName: "Delegación Pastoral Juvenil",
    sector: "ONG",
    featured: false,
    active: true,
    order: 80,
    imageUrl: placeholder("Pastoral\nJuvenil\n2022"),
  },
  {
    title: "Gorras serigrafiadas Albayzín",
    description: "Gorras con grabado adaptado al tamaño óptimo de visera. Pedido para proyecto de barrio y vecinos del Albayzín granadino.",
    clientName: "Albayzín",
    sector: "Evento",
    featured: false,
    active: true,
    order: 90,
    imageUrl: placeholder("Albayzín\nGorras\n2023"),
  },
  {
    title: "Cristal regalo corporativo Neotalentway",
    description: "Cristal arenado de regalo institucional para Neotalentway, hub de talento. Pedido conjunto con campaña Granada Social.",
    clientName: "Neotalentway",
    sector: "Empresa",
    featured: false,
    active: true,
    order: 100,
    imageUrl: placeholder("Neotalentway\nGranada\n2022"),
  },
  {
    title: "Camisetas evento cultural Mes Que Ritmes Barcelona",
    description: "Camisetas serigrafiadas con diseño adaptado a las pantallas (líneas pequeñas eliminadas para asegurar nitidez). Pedido enviado a Barcelona.",
    clientName: "Mes Que Ritmes",
    sector: "Evento",
    featured: false,
    active: true,
    order: 110,
    imageUrl: placeholder("Mes Que Ritmes\nBarcelona\n2017"),
  },
  {
    title: "Cristal de cubertería Bar La Parada",
    description: "Cristal personalizado de cubertería para hostelería. Cliente recurrente con 3 pedidos en 18 meses.",
    clientName: "Bar La Parada",
    sector: "Hospitalidad",
    featured: false,
    active: true,
    order: 120,
    imageUrl: placeholder("Bar La Parada\nCristal hostelería\n2022"),
  },

  // ─── ANONIMIZADOS (pendientes permiso del cliente — Mario activa tras autorización) ───
  {
    title: "Cintas de sombrero corporativas PANTONE 541 C — multinacional alimentación europea",
    description: "Cintas de sombrero personalizadas con marcaje PANTONE 541 C (azul corporativo). Pedido de gran volumen para feria sectorial. NECESITA PERMISO DE USO ANTES DE ACTIVAR.",
    clientName: "Multinacional alimentación europea",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 200,
    imageUrl: placeholder("Multinacional\nAlimentación EU\n2022"),
  },
  {
    title: "Abanicos personalizados — multinacional alimentación",
    description: "Abanicos serigrafiados (7cm máx grabación) para campaña verano. Posibilidad alternativa de DTF para resolución más fina. NECESITA PERMISO DE USO.",
    clientName: "Multinacional alimentación europea",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 210,
    imageUrl: placeholder("Abanicos\ncorporativos\n2024"),
  },
  {
    title: "Cristal corporativo — multinacional alimentación internacional",
    description: "Cristal arenado de alta precisión para regalo institucional. Pedido grande con marcaje en múltiples idiomas. NECESITA PERMISO DE USO.",
    clientName: "Multinacional alimentación internacional",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 220,
    imageUrl: placeholder("Multinacional\nAlimentación INT\n2021"),
  },
  {
    title: "Regalo cristal corporativo — tecnológica internacional asiática",
    description: "Cristal arenado de regalo institucional con logo corporativo internacional. NECESITA PERMISO DE USO.",
    clientName: "Multinacional tecnología asiática",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 230,
    imageUrl: placeholder("Multinacional\nTecnología APAC\n2023"),
  },
  {
    title: "Material punto de venta — cadena nacional supermercados",
    description: "Cristal arenado y material institucional para apertura de tiendas en cadena de supermercados andaluza. NECESITA PERMISO DE USO.",
    clientName: "Cadena nacional supermercados",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 240,
    imageUrl: placeholder("Cadena\nSupermercados\n2021"),
  },
  {
    title: "Marcaje técnico empresa software — pedido recurrente 2022",
    description: "Pedido marcaje técnico para campaña de captación de clientes en empresa de software internacional. Pedido recurrente. NECESITA PERMISO DE USO.",
    clientName: "Tecnológica internacional",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 250,
    imageUrl: placeholder("Tecnológica\nB2B Software\n2022"),
  },
  {
    title: "Cristal institucional Cámara de Comercio andaluza",
    description: "Cristal arenado para acto institucional de Cámara de Comercio. Cliente recurrente con varios pedidos anuales. NECESITA PERMISO DE USO.",
    clientName: "Cámara de Comercio andaluza",
    sector: "Institucional",
    featured: false,
    active: false,
    order: 260,
    imageUrl: placeholder("Cámara Comercio\nReconocimiento\n2023"),
  },
  {
    title: "Portamóviles institucionales — Cámara de Comercio",
    description: "Portamóviles serigrafiados para acto institucional. Acompañamiento gráfico al cristal arenado. NECESITA PERMISO DE USO.",
    clientName: "Cámara de Comercio andaluza",
    sector: "Institucional",
    featured: false,
    active: false,
    order: 270,
    imageUrl: placeholder("Cámara Comercio\nPortamóviles\n2024"),
  },
  {
    title: "Pulseras serigrafiadas — Asociación de Jóvenes Empresarios",
    description: "Pulseras con adaptación de tamaño de letra para mejorar legibilidad en circunferencia pequeña. Pedido conjunto con Encuentro Iberoamericano. NECESITA PERMISO DE USO.",
    clientName: "Asociación empresarial joven",
    sector: "Institucional",
    featured: false,
    active: false,
    order: 280,
    imageUrl: placeholder("Asociación\nJoven Empresa\n2022"),
  },
  {
    title: "Cristal de cubertería — institución cultural europea",
    description: "Cristal arenado de cubertería para institución cultural europea con sede en España. Cliente recurrente con pedidos en varios años. NECESITA PERMISO DE USO.",
    clientName: "Institución cultural europea",
    sector: "Institucional",
    featured: false,
    active: false,
    order: 290,
    imageUrl: placeholder("Institución\nCultural EU\n2017"),
  },
  {
    title: "Cristal evento — Federación empresarial nacional de innovación",
    description: "Cristal arenado para evento de Federación empresarial nacional vinculada a innovación. NECESITA PERMISO DE USO.",
    clientName: "Federación empresarial nacional",
    sector: "Institucional",
    featured: false,
    active: false,
    order: 300,
    imageUrl: placeholder("Federación\nEmpresarial\n2023"),
  },
  {
    title: "Cristal de regalo corporativo — despacho jurídico Granada",
    description: "Cristal arenado para regalo institucional de despacho jurídico. NECESITA PERMISO DE USO.",
    clientName: "Despacho jurídico andaluz",
    sector: "Jurídico",
    featured: false,
    active: false,
    order: 310,
    imageUrl: placeholder("Despacho\nJurídico A\n2022"),
  },
  {
    title: "Cristal personalizado — despacho abogados y economistas",
    description: "Cristal arenado de regalo de despacho de abogados y economistas (Granada). Pedido vinculado a aniversario del despacho. NECESITA PERMISO DE USO.",
    clientName: "Despacho jurídico Granada",
    sector: "Jurídico",
    featured: false,
    active: false,
    order: 320,
    imageUrl: placeholder("Despacho\nJurídico B\n2024"),
  },
  {
    title: "Cristal y bolsas serigrafiadas — urbanización lujo Costa del Sol",
    description: "Combinación de bolsas serigrafiadas + cristal arenado para urbanización exclusiva de la Costa del Sol. Cliente recurrente desde 2023 con pedidos cada 6 meses. NECESITA PERMISO DE USO.",
    clientName: "Urbanización lujo Costa del Sol",
    sector: "Hospitalidad",
    featured: false,
    active: false,
    order: 330,
    imageUrl: placeholder("Urbanización\nLujo CSol\n2024"),
  },
  {
    title: "Cristal personal residentes — residencia mayores Granada",
    description: "Cristal arenado personalizado con nombre de cada residente para residencia de mayores. NECESITA PERMISO DE USO.",
    clientName: "Residencia mayores Granada",
    sector: "Hospitalidad",
    featured: false,
    active: false,
    order: 340,
    imageUrl: placeholder("Residencia\nMayores\n2021"),
  },
  {
    title: "Cristal academia educativa — proyecto recurrente 2020-2021",
    description: "Cristal arenado para academia educativa con pedido recurrente anual. NECESITA PERMISO DE USO.",
    clientName: "Academia educativa",
    sector: "Educación",
    featured: false,
    active: false,
    order: 350,
    imageUrl: placeholder("Academia\nEducativa\n2021"),
  },
  {
    title: "Cristal flota — empresa logística andaluza",
    description: "Cristal arenado para regalo navideño a flota de conductores y agentes comerciales. NECESITA PERMISO DE USO.",
    clientName: "Empresa logística andaluza",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 360,
    imageUrl: placeholder("Empresa\nLogística\n2024"),
  },
  {
    title: "Cristal regalo cliente — marca consumo consciente",
    description: "Cristal arenado para marca alineada con consumo responsable. Dos campañas en mismo año. NECESITA PERMISO DE USO.",
    clientName: "Marca consumo consciente",
    sector: "Empresa",
    featured: false,
    active: false,
    order: 370,
    imageUrl: placeholder("Marca\nConsciente\n2024"),
  },
];

export const PORTFOLIO_SEED_COUNT = PORTFOLIO_SEED.length;
