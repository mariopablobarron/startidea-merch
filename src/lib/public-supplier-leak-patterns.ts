/** Canarios fail-closed para HTML/RSC público. No incluir valores secretos. */
export const PUBLIC_SUPPLIER_LEAK_PATTERNS = [
  { code: "midocean-cdn", re: /[a-z0-9.-]*\.midocean\.com[^"'\s]*/gi },
  { code: "xindao-cdn", re: /[a-z0-9.-]*\.xindao\.(?:com|eu)[^"'\s]*/gi },
  { code: "cifra-cdn", re: /[a-z0-9.-]*\.publicatalogue\.com[^"'\s]*/gi },
  { code: "cifra-domain", re: /\bcifrashop\.com[^"'\s]*/gi },
  { code: "makito-cdn", re: /[a-z0-9.-]*\.makito\.(?:com|es)[^"'\s]*/gi },
  { code: "makito-keyword", re: /\bmakito\b/gi },
  { code: "slug-prefix-cif", re: /\/catalogo\/cif-[a-z0-9-]+/gi },
  { code: "slug-prefix-mak", re: /\/catalogo\/(?:mak|mk)-[a-z0-9-]+/gi },
  { code: "supplier-sku", re: /\b(ar|mo|cx|mk)[0-9]{3,5}\b/gi },
  {
    code: "cifra-size-sku",
    re: /\b[0-9]{4,6}-(?:XXS|XS|S|M|L|XL|XXL|XXXL|[3-8]XL)-[A-Z]{2}\b/gi,
  },
  // Las claves internas pueden venir como JSON normal o escapadas dentro del RSC.
  { code: "legacy-rsc-variant-key", re: /\\?"(?:primarySku|variantSku)\\?"\s*:/gi },
  // Next duplica el JSON-LD dentro de Flight. Permitimos solo el valor público
  // STM-* exacto; cualquier otra clave sku escapada (incluida numérica) falla.
  {
    code: "rsc-sku-key",
    re: /\\"sku\\"\s*:\s*(?!\\"STM-[A-Z0-9-]+\\"(?=\s*[,}]))/gi,
  },
] as const;
