const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://merchandising.hubstartidea.es";

export const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "todomerchandising",
  alternateName: "TodoMerchandising",
  url: SITE_URL,
  logo: `${SITE_URL}/opengraph-image`,
  description:
    "Merchandising corporativo personalizado producido en Centros Especiales de Empleo y talleres locales. Una iniciativa de Startidea.",
  parentOrganization: {
    "@type": "Organization",
    name: "Startidea",
    url: "https://startidea.es",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "sales",
    email: "pedidos@startidea.es",
    availableLanguage: ["Spanish"],
    areaServed: "ES",
  },
  address: {
    "@type": "PostalAddress",
    addressCountry: "ES",
  },
  knowsAbout: [
    "Merchandising corporativo",
    "Regalo promocional",
    "Centros Especiales de Empleo",
    "Personalización textil",
    "Serigrafía",
    "Bordado",
    "Grabado láser",
    "Impacto social",
  ],
};

export const FAQ_JSONLD_ITEMS = [
  {
    q: "¿Qué cantidades mínimas manejáis?",
    a: "Depende del producto y la técnica de marcaje. En textil suelen ser 25 unidades; en bolígrafos o tote bags trabajamos desde 50. Si el volumen es bajo te derivamos a un taller artesano local que sí puede asumirlo.",
  },
  {
    q: "¿En qué se nota que es producción con impacto?",
    a: "Trabajamos con Centros Especiales de Empleo y talleres locales con identidad real. Cada cotización viene con un informe de impacto: horas de trabajo digno, % producido en CEE y, cuando aplica, kg de CO₂ evitados frente a un proveedor estándar.",
  },
  {
    q: "¿Cuál es el plazo medio de entrega?",
    a: "Entre 7 y 15 días laborables según producto y técnica. Para urgencias trabajamos plazos express (3-5 días) sin coste adicional siempre que el stock acompañe.",
  },
  {
    q: "¿Hacéis muestras antes del pedido?",
    a: "Sí. En pedidos a partir de 100 unidades enviamos una muestra física previa sin coste. Para tiradas más pequeñas hacemos prueba digital con simulación 3D del marcaje.",
  },
  {
    q: "¿Cómo gestionáis los logos y archivos de marca?",
    a: "Aceptamos SVG, AI, EPS o PDF vectorial. Si solo tienes PNG/JPG te lo vectorizamos sin coste. Todos los archivos se borran tras la entrega salvo que pidas conservarlos.",
  },
  {
    q: "¿Trabajáis con empresas pequeñas o solo con grandes?",
    a: "Sin mínimo de empresa. Atendemos desde startups con su primer evento hasta corporativos con campañas anuales.",
  },
];

export const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_JSONLD_ITEMS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "todomerchandising",
  url: SITE_URL,
  inLanguage: "es-ES",
};

/**
 * Schema.org Product para rich snippets en SERP.
 * - precio: el de la primera tier (1 ud); Google muestra el "from X €" si especificas range.
 * - availability: InStock para todos los activos (MidOcean + locales).
 * - brand: "TodoMerchandising" (iniciativa de Startidea).
 */
export function productJsonLd(args: {
  slug: string;
  name: string;
  description: string | null;
  primaryImageUrl: string | null;
  productRef: string;
  priceCents: number | null; // precio mínimo por ud (1 ud)
  category: string | null;
  ratingValue?: number | null;
  ratingCount?: number | null;
}): Record<string, unknown> {
  const baseUrl = `${SITE_URL}/catalogo/${args.slug}`;
  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: args.name,
    description: args.description?.slice(0, 5000) || `${args.name} — merchandising corporativo personalizable producido en Centros Especiales de Empleo y talleres locales.`,
    image: args.primaryImageUrl ? [args.primaryImageUrl] : undefined,
    sku: args.productRef,
    mpn: args.productRef,
    brand: { "@type": "Brand", name: "TodoMerchandising" },
    category: args.category,
    url: baseUrl,
  };

  if (args.priceCents != null && args.priceCents > 0) {
    productSchema.offers = {
      "@type": "Offer",
      url: baseUrl,
      priceCurrency: "EUR",
      price: (args.priceCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "STARTIDEA MALAGA SL",
      },
    };
  }

  if (args.ratingValue != null && args.ratingCount != null && args.ratingCount > 0) {
    productSchema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: args.ratingValue.toFixed(1),
      reviewCount: args.ratingCount,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return productSchema;
}

/**
 * Schema.org BreadcrumbList para que Google muestre la migajita de pan
 * en la SERP del producto.
 */
export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url.startsWith("http") ? it.url : `${SITE_URL}${it.url}`,
    })),
  };
}
