"use client";

import { useEffect, useState } from "react";

/**
 * Corazón de favoritos en la ficha de producto. Solo funciona con sesión del
 * portal cliente (cookie del magic link); sin sesión, el click lleva al login.
 *
 * El estado inicial (¿es favorito? ¿hay sesión?) se resuelve con UNA llamada
 * GET compartida entre todos los corazones de la página (caché a nivel de
 * módulo), así la ficha no dispara N peticiones.
 */

let favsPromise: Promise<Set<string> | null> | null = null;

function loadFavorites(): Promise<Set<string> | null> {
  if (!favsPromise) {
    favsPromise = fetch("/api/clientes/favorites")
      .then(async (r) => {
        if (r.status === 401) return null; // sin sesión
        const j = (await r.json()) as { ids?: string[] };
        return new Set(j.ids ?? []);
      })
      .catch(() => null);
  }
  return favsPromise;
}

export function FavoriteHeart({
  productId,
  size = "md",
}: {
  productId: string;
  /** "sm" para superponer en tarjetas del catálogo; "md" en la ficha. */
  size?: "md" | "sm";
}) {
  // null = sin sesión (o aún cargando); Set = sesión activa
  const [fav, setFav] = useState<boolean | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    loadFavorites().then((set) => {
      if (!alive) return;
      if (set === null) {
        setLoggedIn(false);
        setFav(false);
      } else {
        setLoggedIn(true);
        setFav(set.has(productId));
      }
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  async function toggle(e: React.MouseEvent) {
    // La card del catálogo es un <Link>: el corazón no debe navegar.
    e.preventDefault();
    e.stopPropagation();
    if (loggedIn === false) {
      window.location.href = "/clientes/login";
      return;
    }
    if (busy || fav === null) return;
    setBusy(true);
    const next = !fav;
    setFav(next); // optimista
    try {
      const res = await fetch("/api/clientes/favorites", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) setFav(!next); // revertir
    } catch {
      setFav(!next);
    } finally {
      setBusy(false);
    }
  }

  // Mientras carga no renderizamos nada llamativo (evita layout shift).
  const title =
    loggedIn === false
      ? "Inicia sesión para guardar favoritos"
      : fav
        ? "Quitar de favoritos"
        : "Guardar en favoritos";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={title}
      aria-label={title}
      aria-pressed={fav === true}
      className={`inline-flex items-center justify-center rounded-full border transition-colors ${
        size === "sm" ? "h-10 w-10 bg-bone/90 shadow-sm" : "h-11 w-11"
      } ${
        fav
          ? "border-accent bg-accent-mist text-accent"
          : "border-line bg-bone-soft text-ink/50 hover:border-accent hover:text-accent"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}
