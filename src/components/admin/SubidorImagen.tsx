"use client";

import { useRef, useState } from "react";

/**
 * Campo de imagen del editor de presupuestos: se sube el archivo o se pega una
 * URL del catálogo.
 *
 * La subida redimensiona en servidor y devuelve la ruta ya servible; lo que se
 * guarda aquí es esa ruta, no el archivo. Se deja también el campo de texto
 * porque muchas fotos ya están en el catálogo (`/api/m/<hash>`) y volver a
 * subirlas sería duplicarlas.
 */
export function SubidorImagen({
  etiqueta,
  valor,
  onChange,
  compacto = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (url: string) => void;
  /** Para la miniatura de una línea, donde no cabe el campo de URL. */
  compacto?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append("file", archivo);
      const r = await fetch("/api/admin/uploads/presupuesto", { method: "POST", body: cuerpo });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos?.error ?? "No se pudo subir");
      onChange(datos.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
      if (input.current) input.current.value = "";
    }
  }

  if (compacto) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo);
          }}
          className="hidden"
        />
        {valor ? (
          // Misma razón que en la variante de abajo.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valor} alt="" className="h-7 w-7 rounded border border-line object-contain" />
        ) : null}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={subiendo}
          title={etiqueta}
          className="rounded border border-line px-2 py-1 text-ink/50 hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {subiendo ? "…" : valor ? "cambiar foto" : "+ foto"}
        </button>
        {valor && (
          <button type="button" onClick={() => onChange("")} className="text-ink/40 hover:text-red-600">
            ✕
          </button>
        )}
        {error && <span className="font-semibold text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div>
      <span className="text-[11px] uppercase tracking-wider text-ink/50">{etiqueta}</span>
      <div className="mt-1 flex items-start gap-3">
        {valor ? (
          // Vista previa de una ruta que puede ser /files/… o una URL del
          // catálogo: no pasa por el optimizador de Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={valor}
            alt=""
            className="h-16 w-16 rounded border border-line object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink/30">
            sin foto
          </div>
        )}

        <div className="flex-1 space-y-1">
          <input
            value={valor}
            placeholder="/files/presupuestos/… o URL del catálogo"
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-line px-2 py-1.5 text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subir(archivo);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={subiendo}
              className="rounded border border-line px-2 py-1 text-xs text-ink/60 hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : "Subir imagen"}
            </button>
            {valor && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs text-ink/40 hover:text-red-600"
              >
                Quitar
              </button>
            )}
          </div>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
