type FavoritesReadPayload = {
  authenticated?: boolean;
  ids?: unknown;
};

/**
 * Distingue la lectura anónima 200 del contrato autenticado. Durante el
 * despliegue acepta también la respuesta autenticada legacy, que no llevaba
 * `authenticated` pero sí un array `ids`.
 */
export function favoriteIdsForSession(payload: unknown): Set<string> | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as FavoritesReadPayload;
  if (
    (value.authenticated !== undefined && typeof value.authenticated !== "boolean") ||
    value.authenticated === false ||
    !Array.isArray(value.ids) ||
    !value.ids.every((id) => typeof id === "string")
  ) {
    return null;
  }
  return new Set(value.ids);
}
