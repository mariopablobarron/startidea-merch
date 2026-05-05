/**
 * Catálogo de sectores con copy completo para SEO.
 * Cada sector tiene una landing dedicada en /sectores/[slug].
 */

export type Sector = {
  slug: string;
  icon: string;
  title: string;
  short: string;
  // Lo nuevo: copy largo SEO
  heroIntro: string;
  challenges: { title: string; text: string }[];
  benefits: string[];
  realCases: string[];
  needs: string[];
  products: { name: string; q: string }[];
  faqs: { q: string; a: string }[];
  cta: string;
};

export const SECTORS: Sector[] = [
  {
    slug: "tech",
    icon: "💻",
    title: "Empresas tech",
    short: "Onboarding, hackathons, conferencias y kits para remoto",
    heroIntro:
      "El merchandising tech no es ya un capricho de marketing: es la primera impresión física de tu empresa para alguien que firmó por LinkedIn, hizo onboarding por Zoom y nunca pisó la oficina. Bien hecho, refuerza la cultura. Mal hecho, acaba en un cajón.",
    challenges: [
      {
        title: "El reto del onboarding remoto",
        text: "Cuando incorporas a alguien que vive en otra ciudad, su primer contacto físico con la empresa es el welcome pack que recibe en casa. Si llega bonito, completo y útil, esa persona empieza emocionalmente conectada con tu marca. Si llega barato y mal embalado, la primera impresión es mala y la frase 'oye qué cutre' se cuela en la conversación interna de Slack.",
      },
      {
        title: "Eventos dev sin parecer una marca cualquiera",
        text: "En un hackathon o una conferencia tu stand compite con marcas que llevan años perfeccionando su estética. Stickers manidos, camisetas baratas y pendrives genéricos no bastan. Necesitas piezas con buen acabado, materiales premium, paleta cuidada y un mensaje claro de qué hace tu empresa diferente.",
      },
      {
        title: "El kit de cierre de Q sin caer en el ridículo",
        text: "Cerrar un trimestre con un grabado láser en un objeto bien elegido vale más que veinte camisetas iguales. Los regalos de equipo que mejor envejecen son los que no parecen regalo de empresa: un buen cuaderno, una botella térmica con el logo discreto, un set de escritura.",
      },
    ],
    benefits: [
      "Welcome packs entregables en domicilio del empleado en cualquier punto de España",
      "Stock europeo: pedidos en 7-15 días para no fallar a tu sprint",
      "Marcaje láser y bordado premium para piezas que duran más de un año en uso real",
      "Imágenes y mockups previos para que tu equipo de marca apruebe sin sorpresas",
      "Producción con impacto social: certificado para tu memoria interna",
    ],
    realCases: [
      "Startup SaaS de 80 personas con incorporaciones cada dos semanas: pack mensual con sudadera + libreta + botella + tarjeta personalizada con el nombre.",
      "Empresa de ciberseguridad en feria internacional: 1500 lanyards + tote bags + cuadernos en menos de 14 días desde el brief.",
      "Compañía de IA en cierre de Q3: 60 cajas con grabado láser de la fecha y nombre del proyecto, entregadas en oficinas españolas y europeas.",
    ],
    needs: [
      "Welcome packs con sudadera, libreta, botella y bolígrafo",
      "Material para hackathons y conferencias dev",
      "Kits para equipos en remoto",
      "Regalos de cierre de Q con grabado premium",
    ],
    products: [
      { name: "Sudaderas y polos premium", q: "sudadera" },
      { name: "Libretas + bolígrafo set", q: "libreta" },
      { name: "Botellas tritan + tazas térmicas", q: "botella" },
      { name: "Power banks y cables USB-C", q: "power" },
    ],
    faqs: [
      {
        q: "¿Podéis entregar packs individuales en distintos domicilios?",
        a: "Sí. Trabajamos con drop shipping personalizado: envías la lista de empleados con su dirección y nosotros mandamos un pack a cada uno con su nombre. Coste por envío independiente, pero te ahorras la logística interna.",
      },
      {
        q: "¿Cuánto cuesta un welcome pack medio?",
        a: "Para 50 unidades, un pack tipo (sudadera Stanley/Stella + libreta A5 + bolígrafo metálico + botella tritan) ronda 28-35 €/ud incluyendo marcaje. La cifra exacta depende del marcaje (bordado vs serigrafía), del modelo de sudadera y del envío. Te lo cerramos en cotización.",
      },
      {
        q: "¿Tenéis ejemplos para feria internacional con plazo cerrado?",
        a: "Sí. Producciones de 1000-2000 lanyards o totes en 14 días son habituales si nos avisas con un mes de antelación. Para urgencias por debajo de 7 días sólo aceptamos ediciones limitadas con stock europeo. Contacta y te decimos qué es viable.",
      },
    ],
    cta: "Cotizar pack onboarding",
  },
  {
    slug: "eventos",
    icon: "🎤",
    title: "Organizadores de eventos",
    short: "Lanyards, acreditaciones, totes y goodie bags al peso",
    heroIntro:
      "El merchandising para eventos vive contra el reloj: el viernes hay feria y el material tiene que estar en el stand el jueves a las 18:00. Aquí la fiabilidad pesa más que la creatividad, pero los detalles diferencian un evento profesional de uno improvisado.",
    challenges: [
      {
        title: "El plazo siempre es ayer",
        text: "Los organizadores de eventos viven con la cuenta atrás encima. Trabajar con un proveedor que no entiende esto es la diferencia entre un evento bien rodado y un desastre. Producimos con stock europeo y mantenemos producción nacional para urgencias por debajo de 14 días.",
      },
      {
        title: "Acreditaciones y lanyards al detalle",
        text: "Una acreditación VIP debe parecer VIP. Un lanyard barato comunica desorganización. Trabajamos con materiales que diferencian niveles (PVC reciclado vs poliéster premium, prensa offset vs sublimación) y entregamos las acreditaciones ya cortadas, perforadas y listas para colgar.",
      },
      {
        title: "Goodie bags que no se tiran",
        text: "El 70% de los goodie bags de feria acaban en la papelera del hotel. Diseñamos packs útiles —no acumulación de objetos baratos— priorizando 3-4 piezas con buen acabado antes que 10 inutilidades.",
      },
    ],
    benefits: [
      "Producción nacional para plazos por debajo de 14 días",
      "Acreditaciones cortadas y perforadas listas para colgar",
      "Lanyards y pulseras con materiales diferenciados por nivel (asistente, ponente, VIP)",
      "Tote bags con cierre o asa larga, no las baratas que se rompen al primer uso",
      "Diseño y mockup incluidos en cotización",
    ],
    realCases: [
      "Congreso médico anual: 2.500 acreditaciones VIP + 3.000 lanyards en 12 días.",
      "Festival cultural de fin de semana: 5.000 pulseras Tyvek personalizadas + 1.500 totes con marcaje a una tinta.",
      "Conferencia tech en Bilbao: kit completo de stand (lanyards, totes, pendrives, libretas) en 18 días desde el brief inicial.",
    ],
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
    faqs: [
      {
        q: "¿Podéis producir acreditaciones VIP en menos de 7 días?",
        a: "En general sí, siempre que el stock de lanyards esté disponible. La impresión de la tarjeta y el corte se hacen en España en 48-72h. Avísanos cuanto antes con el diseño aprobado y te confirmamos la fecha exacta.",
      },
      {
        q: "¿Hacéis kits cerrados con varias piezas en un mismo bolso?",
        a: "Sí. Goodie bags armados con tote + libreta + bolígrafo + objeto destacado son nuestro pan de cada semana. Los entregamos ya armados o por separado para que tu equipo los monte en el stand.",
      },
      {
        q: "¿Plazo mínimo viable?",
        a: "Para acreditaciones simples (lanyard + tarjeta), 5 días laborables si el stock está disponible. Para producciones grandes con bordado o varios colores, mínimo 12 días. Sin excepciones por debajo de 5 días: lo evitamos para no fallarte.",
      },
    ],
    cta: "Cotizar pack feria",
  },
  {
    slug: "retail",
    icon: "🛍",
    title: "Retail y consumo",
    short: "Regalos directos al cliente final, packaging y promociones",
    heroIntro:
      "El merchandising en retail no es marketing interno: va directo al cliente final que decide volver a comprarte o no. Cada pieza compite con la marca de tu producto y debe estar a la altura.",
    challenges: [
      {
        title: "Regalo con compra (gift with purchase)",
        text: "El GWP es la herramienta más infrautilizada en retail español. Bien diseñado, sube ticket medio, fideliza y genera mención en redes. Mal diseñado (que es lo habitual), parece publicidad agresiva.",
      },
      {
        title: "Packaging diferenciado de campaña",
        text: "El packaging estándar mata las campañas estacionales. Producimos cajas, bolsas y precintos personalizados con plazo de campaña en mente, no de logística normal.",
      },
      {
        title: "Material POP para tienda física",
        text: "El displayer, el cartel A3 enmarcado, el folleto en mostrador. Cosas pequeñas que en tienda hacen la diferencia entre una sección activa y una sección abandonada.",
      },
    ],
    benefits: [
      "Diseño de campañas estacionales con producto y packaging coordinado",
      "Producción nacional con calidad uniforme entre tiendas físicas",
      "Material POP enmarcado, plastificado o impreso según uso",
      "Versiones limitadas con número de serie para clientes premium",
    ],
    realCases: [
      "Cadena de cosmética: 8.000 neceseres con regalo con compra para campaña primavera-verano.",
      "Tienda gourmet online: 1.200 cajas regalo navideñas con caligrafía personalizada en cada paquete.",
      "Marca de ropa técnica: 500 mochilas de fidelización para clientes que superan 1.000€ acumulados al año.",
    ],
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
    faqs: [
      {
        q: "¿Podéis producir packaging exclusivo de mi marca?",
        a: "Sí, con cantidades mínimas razonables. Cajas litografiadas a partir de 500 unidades, bolsas con asa rizada desde 1000, precintos custom desde 100 metros lineales. Para tiradas pequeñas usamos impresión digital con buen resultado.",
      },
      {
        q: "¿Qué tipo de productos funcionan mejor como GWP?",
        a: "Los útiles y duraderos. Botellas, totes premium, neceseres, accesorios pequeños de calidad. Lo que NO funciona: stickers, pulseras de tela baratas, llaveros de plástico. Si tu cliente paga 80€ por tu producto, su regalo no puede parecer de 50 céntimos.",
      },
    ],
    cta: "Cotizar campaña",
  },
  {
    slug: "aapp",
    icon: "🏛",
    title: "Administraciones públicas",
    short: "Concursos, contratación menor y memoria social documentada",
    heroIntro:
      "Trabajar con administración pública es trabajar con reglas distintas: dossier técnico exigente, plazo de pago de 30-60 días, certificación de origen y exigencia de impacto social. Hemos hecho el deber de aprender estas reglas para que tu departamento de contratación no tenga problema en aprobarnos.",
    challenges: [
      {
        title: "El concurso público y sus pliegos",
        text: "Los pliegos de contratación pública exigen documentación detallada: ficha técnica, certificados de calidad, origen, ecodiseño. Tenemos plantilla de respuesta probada en Junta de Andalucía, Diputación de Granada y varios ayuntamientos.",
      },
      {
        title: "El pago a 30/60 días con factura aprobada",
        text: "Asumimos el flujo de caja típico AAPP: factura enviada en formato Facturae, validación por intervención, pago a 60 días en algunos casos. Aceptamos este timing sin recargo siempre que el contrato esté firmado.",
      },
      {
        title: "Producción con impacto social documentado",
        text: "AAPP cada vez exige más cláusulas sociales: porcentaje en CEE, materiales reciclables, huella de carbono. Entregamos certificado documental con datos verificables (no greenwashing) firmados por el CEE.",
      },
    ],
    benefits: [
      "Dossier técnico listo para concurso con todos los certificados",
      "Pago a 30/60 días con factura electrónica Facturae",
      "Producción con porcentaje verificado en Centro Especial de Empleo",
      "Materiales reciclables y trazables con sellos GOTS, OEKO-Tex, FSC",
      "Cumplimiento de cláusulas sociales habituales en pliegos AAPP",
    ],
    realCases: [
      "Diputación provincial: 3.000 botellas acero reutilizables con grabado láser para campaña ambiental.",
      "Ayuntamiento capital: 5.000 bolsas algodón orgánico GOTS para campaña 'Sin plástico de un solo uso'.",
      "Universidad pública: 1.500 cuadernos FSC + bolígrafos con tinta a base de aceite vegetal para acto institucional.",
    ],
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
    faqs: [
      {
        q: "¿Os presentáis a concursos con licitador propio?",
        a: "Sí. STARTIDEA MALAGA SL está dada de alta en ROLECE y al corriente de obligaciones tributarias y con la Seguridad Social. Documentación administrativa actualizada disponible bajo solicitud.",
      },
      {
        q: "¿Podéis emitir factura electrónica Facturae?",
        a: "Sí, en formato 3.2.x con firma electrónica. Compatible con FACe (entidades AGE y CCAA adheridas) y con plataformas locales tipo eFact, eFACT Catalunya, FACAE Asturias, etc.",
      },
      {
        q: "¿Cómo certificáis el porcentaje en CEE?",
        a: "Cada CEE colaborador firma certificado con su número oficial de CEE, las personas implicadas (datos agregados, sin individualizar) y las horas dedicadas al pedido. Documento adjuntable a tu memoria de cumplimiento.",
      },
    ],
    cta: "Solicitar dossier para AAPP",
  },
  {
    slug: "rsc",
    icon: "🌱",
    title: "Departamentos RSC",
    short: "Memoria de sostenibilidad, ODS y trazabilidad social",
    heroIntro:
      "RSC pide datos verificables, no buenas intenciones. Te entregamos producto con trazabilidad social y ambiental real, certificado por terceros, alineado con tus ODS y listo para tu memoria anual sin que tengas que reescribir nada.",
    challenges: [
      {
        title: "El greenwashing es cada vez más fácil de cazar",
        text: "Una bolsa de algodón con un sello GOTS sin código verificable es como un producto bio sin certificadora. Te ofrecemos sólo material con certificación verificable: GOTS para algodón, FSC para madera, GRS para reciclados, OEKO-Tex para textil técnico.",
      },
      {
        title: "ODS y vinculación con tu estrategia",
        text: "Cada producto que entregamos te llega con tag de los ODS que cubre (ODS 8 trabajo decente cuando es CEE, ODS 12 producción responsable cuando es eco, ODS 13 acción climática cuando reduce huella). Útil para tu memoria sin tener que improvisar al final del año.",
      },
      {
        title: "Huella de carbono comparable",
        text: "Entregamos cálculo de la huella de carbono del pedido frente a alternativa equivalente producida en Asia. Te ahorras los datos en tu reporte anual y el discurso ante stakeholders es defendible.",
      },
    ],
    benefits: [
      "Productos con certificación verificable (GOTS, FSC, GRS, OEKO-Tex)",
      "Tag de ODS aplicable a cada producto del catálogo",
      "Huella de carbono calculada y comparada con alternativa Asia",
      "Certificado documental firmado por CEE con datos agregados",
      "Compatible con marcos de reporte: Pacto Mundial, GRI, EFRAG",
    ],
    realCases: [
      "Multinacional textil: pack RSC anual con regalos eco para 1.200 empleados, certificado para informe GRI.",
      "Banca cooperativa: cierre de campaña ambiental con 5.000 botellas RPET certificadas y memoria de huella.",
      "Cooperativa agroalimentaria: línea de regalos a clientes con bambú FSC y cálculo de huella detallado.",
    ],
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
    faqs: [
      {
        q: "¿Cómo se calcula la huella de carbono?",
        a: "Aplicamos metodología Carbon Footprint Standard (ISO 14067) con datos del proveedor: peso, materia prima, distancia transporte, energía de fabricación. El cálculo lo hace una consultora externa para garantizar independencia.",
      },
      {
        q: "¿Vuestro certificado RSC es válido para GRI o EFRAG?",
        a: "Es complemento, no sustituto. El certificado documenta la trazabilidad social del pedido (CEE, personas implicadas, horas), que tu departamento incorpora a su reporte GRI 401-2 o EFRAG ESRS S1. No reemplaza el reporte completo.",
      },
    ],
    cta: "Pedir certificado RSC",
  },
  {
    slug: "rrhh",
    icon: "👥",
    title: "RRHH · People Ops",
    short: "Welcome packs, cumpleaños, cierre de año y team building",
    heroIntro:
      "RRHH compra merchandising para tres momentos: cuando alguien entra, cuando cumple un hito y cuando se va. Cada momento merece su propio enfoque y sus propios productos.",
    challenges: [
      {
        title: "El welcome pack como primera impresión",
        text: "El primer día de un empleado en su nueva empresa empieza recibiendo un paquete físico. Si llega bonito y útil, sienta una expectativa. Si llega regular, también la sienta — pero hacia abajo. Diseñamos packs que cuestan lo que tienen que costar (~30-50€/ud) sin perder calidad.",
      },
      {
        title: "Aniversarios y cumpleaños sin protocolo de oficina",
        text: "Felicitar el aniversario laboral de alguien con un email automático es lo que hace todo el mundo y nadie aprecia. Un detalle físico personalizado (taza con su nombre, libreta, set de escritura grabado) cuesta 8-15€ y deja huella.",
      },
      {
        title: "Cierre de año y team building",
        text: "El cierre de año pide algo memorable, el team building algo cómodo y duradero. Para cierre, sets premium con grabado de la fecha. Para team building, sudaderas, mochilas o gorras con marcaje sobrio.",
      },
    ],
    benefits: [
      "Welcome packs con drop shipping individual a cada empleado",
      "Personalización con nombre del empleado a partir de 25 unidades",
      "Sets de cumpleaños/aniversario con coste por debajo de 15€",
      "Equipación de team-building con marcaje discreto y materiales premium",
    ],
    realCases: [
      "Grupo hostelero (250 empleados): pack mensual con personalización de nombre para nuevas incorporaciones.",
      "Despacho de abogados: 80 sets cierre de año con cuaderno + bolígrafo grabado láser + caja madera.",
      "ONG: equipación team-building 4 días montaña con sudaderas, gorras y mochilas técnicas.",
    ],
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
    faqs: [
      {
        q: "¿Personalizáis cada welcome pack con el nombre del empleado?",
        a: "Sí, con DTF o láser según el material. Mínimo de 25 packs por pedido para que el coste por unidad sea razonable. Tiempo extra de producción: +3 días respecto a pack genérico.",
      },
      {
        q: "¿Hacéis envíos individuales a casa de cada empleado?",
        a: "Sí. Te enviamos plantilla de Excel con campos (nombre, dirección, teléfono) que rellenas con tu lista de empleados. Coste por envío independiente, normalmente 5-7€/empleado en península.",
      },
    ],
    cta: "Cotizar welcome pack",
  },
];

export function getSector(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug);
}
