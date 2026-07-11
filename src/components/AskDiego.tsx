"use client";

/**
 * Punto de entrada a Diego desde cualquier parte de la web. Dispara el evento
 * global `diego:open` que escucha VoiceAgentWidget (montado en el layout):
 * abre el panel, arranca la sesión si no estaba activa y le pasa a Diego el
 * CONTEXTO de dónde estaba el cliente (producto que miraba, carrito…) para
 * que no empiece de cero.
 */
export function AskDiego({
  context,
  label = "Pregunta a Diego",
  className,
}: {
  /** Contexto para Diego, ej: 'El cliente está viendo "Botella X" (STM-…)'. */
  context?: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("diego:open", { detail: { context } }))
      }
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
      }
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {label}
    </button>
  );
}
