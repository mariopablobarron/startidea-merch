/**
 * Logos de clientes que han dado permiso explícito para mostrar su marca.
 *
 * Para añadir un cliente:
 *   1. Conseguir email de permiso del cliente ("¿podemos publicar tu logo?")
 *   2. Subir el SVG (ideal) o PNG con fondo transparente a /public/clients/
 *      Recomendado: 200x60px aspect ratio, monocromo o b/n para uniformidad.
 *   3. Añadir entry aquí abajo
 *
 * Si está vacío, la sección ClientLogos NO se renderiza en home.
 */
export type ClientLogo = {
  name: string;
  src: string; // ruta absoluta desde /public, ej: "/clients/acme.svg"
  width: number;
  height: number;
  alt?: string; // por defecto = name
  url?: string; // opcional: link al sitio del cliente
};

export const CLIENT_LOGOS: ClientLogo[] = [
  // Ejemplo (descomentar y subir el archivo):
  // { name: "Banco Santander", src: "/clients/santander.svg", width: 140, height: 40 },
  // { name: "Iberdrola", src: "/clients/iberdrola.svg", width: 120, height: 40 },
];
