/**
 * Filtra marcas de proveedor que no deben mostrarse al cliente.
 * "midocean" no es una marca real — es nuestro distribuidor.
 * Si encontramos otros (xindao, stricker…) se añaden aquí.
 */
const SUPPLIER_BRANDS = new Set(["midocean", "xindao", "stricker", "supplier"]);

/**
 * Devuelve la marca solo si es marca real visible al cliente.
 * Si es "midocean" u otro proveedor, devuelve null.
 */
export function publicBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  if (SUPPLIER_BRANDS.has(brand.toLowerCase().trim())) return null;
  return brand;
}
