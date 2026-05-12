/**
 * Pasos del tour guiado de la web. On-demand: solo se dispara cuando el
 * usuario pulsa "¿Cómo funciona?" en la navbar. Nunca automático.
 *
 * Cada paso apunta a un elemento del DOM via `target` (CSS selector) o a
 * ningún elemento (`target: null`) para diálogo centrado de bienvenida/fin.
 * Si el paso requiere otra página, `requiresPath` indica a dónde navegar.
 *
 * Para que un componente sea "target-able" desde aquí, usa data-tour="<id>"
 * en su elemento raíz o el más representativo.
 */
export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector del elemento a destacar. null = diálogo centrado sin target. */
  target: string | null;
  /** Si el paso requiere estar en una ruta concreta, navega allí antes. */
  requiresPath?: string;
  /** Posición del tooltip respecto al target. Default: auto. */
  placement?: "top" | "bottom" | "left" | "right" | "center";
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Bienvenida.",
    body: "En 90 segundos te enseño cómo pedir merchandising corporativo personalizado en TodoMerchandising. Puedes salir cuando quieras pulsando 'Saltar tour'.",
    target: null,
    placement: "center",
  },
  {
    id: "search",
    title: "Busca productos.",
    body: "Más de 2.400 productos personalizables con tu logo. Buscador inteligente que entiende lenguaje natural: 'sudaderas para evento', 'botellas eco', etc.",
    target: '[data-tour="search"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "nav-catalog",
    title: "Catálogo completo.",
    body: "Explora los 2.400+ productos organizados por categorías: textil, drinkware, escritura, tecnología, eventos…",
    target: '[data-tour="nav-catalog"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "nav-recommender",
    title: "Recomendador IA.",
    body: "¿No sabes qué pedir? Cuéntanos en una frase qué necesitas (público, cantidad, valores) y la IA elige 3-5 productos del catálogo que mejor encajan.",
    target: '[data-tour="nav-recommender"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "nav-promos",
    title: "Promociones y novedades.",
    body: "Productos destacados, ofertas activas y novedades del mes. Pulsa para verlas todas.",
    target: '[data-tour="nav-promos"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "nav-cart",
    title: "Cesta de cotización.",
    body: "Aquí ves siempre tu cesta. Añade varios productos y pídenos cotización agrupada — calculamos descuento por volumen total.",
    target: '[data-tour="cart-badge"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "product-order",
    title: "Configura tu pedido.",
    body: "En cada producto eliges cantidad, decides si lleva marcaje (técnica + colores + posición) y ves el precio estimado al instante. Sin sorpresas en la cotización final.",
    target: null,
    placement: "center",
  },
  {
    id: "whatsapp",
    title: "¿Tienes dudas? WhatsApp directo.",
    body: "En cada ficha hay un botón de WhatsApp con el producto pre-rellenado en el mensaje. 1 click → conversación con el equipo. Respondemos en menos de 1h laborable.",
    target: null,
    placement: "center",
  },
  {
    id: "client-portal",
    title: "Portal cliente.",
    body: "Tras tu primer pedido, accede al portal para ver histórico, descargar facturas, aprobar mockups y consultar el estado de producción.",
    target: '[data-tour="nav-account"]',
    requiresPath: "/",
    placement: "bottom",
  },
  {
    id: "done",
    title: "Listo. ¿Probamos?",
    body: "Empieza por el catálogo o pídenos cotización directamente. Te respondemos en 24h con tarifas finales y plazo.",
    target: null,
    placement: "center",
  },
];
