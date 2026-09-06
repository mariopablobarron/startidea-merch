const SITE = "https://merchandising.startidea.es";

// Enlaces a vistas: abrir una pantalla nunca autoriza una acción ni evita el login.
export const TELEGRAM_ADMIN_MENU = {
  inline_keyboard: [
    [{ text: "Hoy", url: `${SITE}/admin` }, { text: "Buscar productos", url: `${SITE}/admin/products` }],
    [{ text: "Presupuestos", url: `${SITE}/admin/cart-quotes` }, { text: "Pedidos", url: `${SITE}/admin/orders` }],
    [{ text: "Incidencias técnicas", url: `${SITE}/admin/insights/errors?filter=unresolved` }],
    [{ text: "Revisar borradores", url: `${SITE}/admin/propuestas?status=draft` }],
  ],
};

export const TELEGRAM_ADMIN_HELP = [
  "<b>Carmen · Tu trabajo de hoy</b>",
  "Consulta productos, cotizaciones y estados en este chat personal.",
  "Para cambiar datos o enviar un presupuesto, abre el panel con tu sesión del equipo.",
  "Los botones te llevan a los mismos datos y pantallas de la web.",
  "", "Puedes escribir: «busca botellas», «cotiza 300 camisetas» o «estado del sistema».",
].join("\n");

export function isTelegramMenuRequest(text: string): boolean {
  return ["/start", "/help", "/ayuda", "/menu", "/hoy", "hoy", "abrir panel"].includes(text.toLowerCase());
}
