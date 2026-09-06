/** Contención hasta vincular Telegram a usuarios activos del equipo.
 * La interpretación de una confirmación por el modelo no autoriza acciones.
 */
export const TELEGRAM_READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "buscar_productos", "detalle_producto", "cotizar", "estado_pedidos",
  "estadisticas", "promociones_activas", "margen_interno", "estado_sistema",
]);

export function telegramToolDenial(name: string): string | null {
  if (TELEGRAM_READ_ONLY_TOOLS.has(name)) return null;
  return "Esta acción no se ha ejecutado. Telegram está habilitado para consultas; los cambios y envíos requieren tu sesión y permisos en el panel. Abre /menu para continuar allí.";
}

export function isAuthorizedTelegramSender(
  message: { chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean } },
  allowedChats: ReadonlySet<string>,
): boolean {
  return message.chat.type === "private" &&
    !!message.from && !message.from.is_bot &&
    message.from.id === message.chat.id &&
    allowedChats.has(String(message.chat.id));
}
