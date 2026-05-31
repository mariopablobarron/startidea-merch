/**
 * Generador de artículos de blog SEO — long-form 1500-2500 palabras
 * anclado al Manual de identidad Startidea v1.0.
 *
 * Usa OpenRouter (Claude Sonnet 4.5 por defecto) para generar:
 *   - Title H1 con keyword
 *   - Meta title + meta description
 *   - Excerpt 150-200 chars
 *   - Body Markdown estructurado (H2/H3/listas/CTA)
 *   - FAQ schema.org (3-5 preguntas)
 *   - Tags relevantes
 *
 * Modelo SEO objetivo: posicionar para keywords B2B de merchandising
 * corporativo en España. Cada post incluye internal links a /catalogo
 * y CTAs sutiles para captura de leads.
 */

import { marked } from "marked";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL_BLOG || "anthropic/claude-sonnet-4.5";

export type BlogIntent = "INFORMATIONAL" | "TRANSACTIONAL" | "NAVIGATIONAL" | "COMMERCIAL";

export type BlogGenerateInput = {
  topic: string;                 // tema central
  keywordTarget: string;         // keyword principal SEO
  intent?: BlogIntent;           // default INFORMATIONAL
  targetWordCount?: number;      // 1500-2500 default 1800
  internalLinks?: string[];      // URLs absolutas a productos/categorías
  customInstructions?: string;
};

export type BlogGenerated = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  bodyMd: string;
  tags: string[];
  faq: Array<{ q: string; a: string }>;
  model: string;
};

const SYSTEM_PROMPT = `
Eres redactor SEO senior de Startidea (consultora de marketing en Granada). Escribes para TodoMerchandising, la sub-marca B2B que vende merchandising corporativo personalizado con producción en Centros Especiales de Empleo (CEE).

TONO (Manual Startidea v1.0):
- Directo, atento, sin disfraz de agencia. Frase corta gana.
- Cifras concretas en vez de adjetivos vagos.
- Verbo en activa. Sujeto explícito cuando aporta.
- Cero jerga: nada de "soluciones integrales 360º", "sinergias disruptivas", "storytelling de impacto", "potenciamos tu marca al siguiente nivel".
- Cero emojis decorativos.

ESTRUCTURA SEO obligatoria para un post:
1. Title H1 que incluya la keyword target literal o muy próxima
2. Intro de 80-120 palabras que enganche con dato concreto o pregunta del lector B2B
3. 4-6 H2 que cubran el tema en profundidad
4. Listas (bullets o numeradas) cuando aporten claridad
5. Tabla Markdown si comparas opciones
6. Ejemplos concretos con cifras o casos hipotéticos del sector
7. Internal links sutiles (markdown link a las URLs proporcionadas) en sitios naturales
8. CTA suave al final invitando a pedir cotización o explorar el catálogo
9. FAQ de 3-5 preguntas al final como sección con H2 "Preguntas frecuentes"

CALIDAD:
- Información útil y accionable (no fluff)
- Mencionar productos reales del sector (camisetas, sudaderas, termos, mochilas RPET, etc.)
- Cuando aplique, citar CEE como diferencial ("Centros Especiales de Empleo, empresas con >70% plantilla con discapacidad")
- Sin promesas exageradas. Sin clichés.

Devuelve SIEMPRE JSON estricto sin texto adicional.
`.trim();

export async function generateBlogPost(
  input: BlogGenerateInput,
): Promise<{ ok: true; post: BlogGenerated } | { ok: false; error: string }> {
  if (!OPENROUTER_API_KEY) {
    return { ok: false, error: "OPENROUTER_API_KEY no configurado" };
  }

  const wordCount = input.targetWordCount ?? 1800;
  const linksBlock = input.internalLinks && input.internalLinks.length > 0
    ? `\nINTERNAL LINKS DISPONIBLES (úsalos en contexto natural):\n${input.internalLinks.map((u) => `- ${u}`).join("\n")}`
    : "";

  const userPrompt = `
GENERA un artículo de blog SEO completo según estas reglas.

TEMA: ${input.topic}
KEYWORD TARGET: ${input.keywordTarget}
INTENT: ${input.intent || "INFORMATIONAL"}
LONGITUD OBJETIVO: ${wordCount} palabras (rango aceptable ±15%)
${linksBlock}
${input.customInstructions ? `\nINSTRUCCIONES EXTRA: ${input.customInstructions}` : ""}

DEVUELVE JSON con esta estructura exacta:
{
  "title": "Título H1 con keyword",
  "slug": "slug-en-kebab-case",
  "metaTitle": "≤60 caracteres con keyword al principio",
  "metaDescription": "120-155 caracteres con keyword y CTA",
  "excerpt": "150-200 caracteres resumiendo el valor del post",
  "bodyMd": "# Title\\n\\nIntro 80-120 palabras...\\n\\n## H2 sección 1\\n\\nContenido...\\n\\n## Preguntas frecuentes\\n\\n### ¿Pregunta?\\nRespuesta...",
  "tags": ["tag1", "tag2", "tag3"],
  "faq": [
    { "q": "Pregunta 1", "a": "Respuesta concreta" },
    { "q": "Pregunta 2", "a": "Respuesta concreta" }
  ]
}

REGLAS slug: minúsculas, sin acentos, máx 60 chars, kebab-case, incluir keyword si encaja.
REGLAS bodyMd: usar # Title arriba (H1), ## para H2, ### para H3. Mantener Markdown válido.
REGLAS FAQ: la última sección H2 del bodyMd debe ser "## Preguntas frecuentes" con cada pregunta como ### + respuesta. Y además devolver el array faq estructurado para schema.org.
`.trim();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://merchandising.hubstartidea.es",
        "X-Title": "TodoMerchandising Blog Generator",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `OpenRouter HTTP ${res.status}: ${txt.slice(0, 300)}` };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Respuesta IA vacía" };

    let parsed: Partial<BlogGenerated>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (!match) return { ok: false, error: "Respuesta no es JSON válido" };
      parsed = JSON.parse(match[1]);
    }

    if (!parsed.title || !parsed.bodyMd) {
      return { ok: false, error: "JSON sin title o bodyMd" };
    }

    return {
      ok: true,
      post: {
        title: String(parsed.title).trim().slice(0, 200),
        slug: ensureSlug(parsed.slug || parsed.title),
        metaTitle: String(parsed.metaTitle || parsed.title).slice(0, 160),
        metaDescription: String(parsed.metaDescription || "").slice(0, 320),
        excerpt: String(parsed.excerpt || "").slice(0, 400),
        bodyMd: String(parsed.bodyMd).trim(),
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.map((t) => String(t).toLowerCase().trim().slice(0, 40)).slice(0, 10)
          : [],
        faq: Array.isArray(parsed.faq)
          ? parsed.faq
              .map((f) => ({
                q: String(f.q || "").trim().slice(0, 300),
                a: String(f.a || "").trim().slice(0, 1000),
              }))
              .filter((f) => f.q && f.a)
              .slice(0, 8)
          : [],
        model: MODEL,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error red" };
  }
}

export function ensureSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Convierte Markdown a HTML server-side con `marked`.
 * Configuración: GFM, tablas, breaks suaves, headerIds.
 */
export function mdToHtml(md: string): string {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
  return marked.parse(md, { async: false }) as string;
}

/**
 * Construye schema.org JSON-LD completo para un post.
 * Combina Article + FAQPage si tiene FAQ.
 */
export function buildBlogSchema(post: {
  title: string;
  slug: string;
  excerpt: string | null;
  heroUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  author: string | null;
  tags?: string[];
  bodyMd?: string | null;
  faq?: Array<{ q: string; a: string }>;
}, siteUrl: string): object {
  const url = `${siteUrl}/blog/${post.slug}`;
  // Si no hay heroUrl en BD, el OG dinámico del post sirve como image canónico.
  // BlogPosting (subtipo de Article) → mejor rich result en Google.
  const image = post.heroUrl || `${siteUrl}/blog/${post.slug}/opengraph-image`;

  // wordCount aproximado a partir del markdown (ayuda a Google a clasificar
  // como long-form / short-form y mejora featured snippets en posts largos).
  const wordCount = post.bodyMd
    ? post.bodyMd
        .replace(/```[\s\S]*?```/g, "") // quitar bloques de código
        .replace(/[#*_~`>\-+|]/g, " ") // quitar markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // quitar links
        .split(/\s+/)
        .filter(Boolean).length
    : undefined;

  // Author como Person con worksFor — mejor E-E-A-T que Organization plano.
  // Google da más peso a contenido firmado por personas con expertise visible.
  const authorName = post.author || "Equipo TodoMerchandising";
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    image: [image],
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    inLanguage: "es-ES",
    author: {
      "@type": "Person",
      name: authorName,
      jobTitle: "Especialistas en merchandising corporativo B2B",
      worksFor: {
        "@type": "Organization",
        name: "TodoMerchandising",
        url: siteUrl,
      },
      knowsAbout: [
        "Merchandising corporativo",
        "Centros Especiales de Empleo",
        "Personalización textil",
        "Serigrafía",
        "Bordado",
        "DTF",
        "Compras B2B",
      ],
    },
    publisher: {
      "@type": "Organization",
      name: "TodoMerchandising",
      url: siteUrl,
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-mark.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(wordCount ? { wordCount } : {}),
    ...(post.tags && post.tags.length > 0
      ? {
          keywords: post.tags.join(", "),
          articleSection: post.tags[0],
        }
      : {}),
  };

  // BreadcrumbList — Inicio → Blog → <post>. Mejora el rich result en
  // Google con la ruta visible bajo el título en los resultados.
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  const items: object[] = [article, breadcrumbs];

  if (post.faq && post.faq.length > 0) {
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return items;
}
