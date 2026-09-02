import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [...new Set([...sanitizeHtml.defaults.allowedTags, "img"])] as string[];

/**
 * Allowlist del HTML público del blog.
 *
 * El Markdown vive en BD y lo pueden editar roles distintos de CEO. `marked`
 * convierte también HTML crudo, así que su salida nunca puede llegar sola a
 * `dangerouslySetInnerHTML`. Esta función se usa tanto al convertir Markdown
 * como al final del pipeline, después de inyectar enlaces internos.
 */
export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel", "class"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      code: ["class"],
      th: ["align"],
      td: ["align"],
    },
    allowedClasses: {
      a: ["text-accent", "hover:underline"],
      code: [/^language-[a-z0-9_-]+$/i],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["https"],
    },
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attributes) => {
        const safeAttributes = { ...attributes };
        if (safeAttributes.target !== "_blank" && safeAttributes.target !== "_self") {
          delete safeAttributes.target;
        }
        if (safeAttributes.target === "_blank") {
          safeAttributes.rel = "noopener noreferrer";
        }
        return { tagName, attribs: safeAttributes };
      },
    },
  });
}
