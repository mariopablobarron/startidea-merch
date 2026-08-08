import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

/**
 * Cerrojo para cursar el pedido de UN carrito a UN proveedor.
 *
 * Los `*-auto-order` comprueban si el pedido ya se cursó, llaman al proveedor
 * y anotan el resultado. Entre la comprobación y la anotación hay una llamada
 * HTTP entera, y ahí caben dos ejecuciones: el webhook de Stripe (que llega
 * por dos ramas distintas del mismo pago) y el botón «enviar» del panel. Dos
 * ganadores = **dos pedidos físicos reales**, con mercancía y factura
 * duplicadas. Reclamar ANTES de llamar cierra esa ventana.
 *
 * Reutiliza `acquireCronLock`, que ya resuelve la parte difícil: la unicidad
 * de clave de `AdminSetting` hace de cerrojo atómico y el rescate por TTL es
 * un UPDATE … WHERE condicional, así que dos procesos que vean el cerrojo
 * caducado a la vez no ganan los dos.
 *
 * ## Por qué el TTL es de una hora y no de diez minutos
 *
 * En un cron, el TTL debe ser menor que la cadencia para no saltarse el
 * siguiente tick. Aquí es al revés: no hay tick siguiente, hay un pedido que
 * ya puede estar hecho. El TTL solo existe para que un proceso muerto no deje
 * el carrito bloqueado para siempre, así que conviene que sea **largo**: una
 * hora es tiempo de sobra para que cualquier llamada a un proveedor termine, y
 * corto comparado con lo que tarda alguien en mirar el panel.
 *
 * ## Dirección deliberada del fallo: como mucho una vez
 *
 * El cerrojo se libera SOLO en los caminos que no llegaron a llamar al
 * proveedor (apagado, sin dirección, carrito ajeno, error antes de pedir). Si
 * se llamó —con éxito o con rechazo— el cerrojo se queda puesto hasta que
 * expire. Así, si el proceso muere justo entre pedir y anotar, nadie vuelve a
 * pedir por su cuenta: el pedido queda visible en el panel con su aviso de
 * Telegram y lo cursa una persona.
 *
 * Es la misma elección que en `publish-scheduled`: un pedido duplicado hay que
 * devolverlo al proveedor, uno que no salió se manda en dos minutos.
 */
export const SUPPLIER_ORDER_CLAIM_TTL_MS = 60 * 60 * 1000;

function claimKey(supplier: string, cartId: string): string {
  return `supplier_order:${supplier}:${cartId}`;
}

/** `true` si este proceso puede cursar el pedido; `false` si ya lo está cursando otro. */
export async function claimSupplierOrder(supplier: string, cartId: string): Promise<boolean> {
  return acquireCronLock(claimKey(supplier, cartId), SUPPLIER_ORDER_CLAIM_TTL_MS);
}

/** Libera el cerrojo. Llamar SOLO si no se llegó a contactar con el proveedor. */
export async function releaseSupplierOrderClaim(supplier: string, cartId: string): Promise<void> {
  await releaseCronLock(claimKey(supplier, cartId));
}
