"use client";

/**
 * Botón que dispara el tour guiado. Se usa en navbar (desktop + drawer móvil)
 * y opcionalmente en otros sitios (footer, ayuda). Emite evento global
 * `tour:start` que escucha el componente <Tour /> montado en layout.
 *
 * Variantes visuales:
 *  - "navbar" → pill discreta para barra superior
 *  - "inline" → link de texto para integrar en párrafos o footer
 *  - "fab" → botón flotante esquina inferior izda (alternativa al WhatsApp float)
 */
export function TourLauncher({
  variant = "navbar",
  label = "¿Cómo funciona?",
}: {
  variant?: "navbar" | "inline" | "fab";
  label?: string;
}) {
  function start() {
    window.dispatchEvent(new CustomEvent("tour:start"));
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={start}
        className="text-accent underline-offset-2 hover:underline"
      >
        {label}
      </button>
    );
  }

  if (variant === "fab") {
    return (
      <button
        type="button"
        onClick={start}
        className="fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-xs font-medium text-bone shadow-xl transition hover:bg-accent"
        aria-label="Iniciar tour guiado"
      >
        <QuestionIcon />
        {label}
      </button>
    );
  }

  // navbar (default)
  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:border-accent hover:text-ink"
      aria-label="Iniciar tour guiado de la web"
    >
      <QuestionIcon />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function QuestionIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
