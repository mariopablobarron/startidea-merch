"use client";

import { useEffect, useState } from "react";
import { waLink, waWebMessage } from "@/lib/whatsapp";

export function WhatsAppFloat() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const href = waLink(
    waWebMessage("General", "Hola, vengo de la web de todomerchandising y me gustaría pedir una cotización."),
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Abrir WhatsApp para cotización"
      className={`fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl shadow-black/20 transition-all duration-300 hover:scale-110 hover:bg-[#1DA851] sm:h-16 sm:w-16 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
      }`}
    >
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7 sm:h-8 sm:w-8"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39-.077 0-.154-.04-.23-.077-.769-.385-1.305-.74-1.844-1.535-.077-.116-.154-.077-.196 0-.155.196-.5.738-.66.972-.155.234-.31.116-.43.077-.6-.193-1.422-.84-1.95-1.498-.578-.738-1.06-1.7-1.215-2.41-.039-.234-.077-.5.077-.66.077-.078.347-.39.464-.508.077-.077.116-.155.077-.232-.078-.193-.232-.66-.39-.93-.155-.27-.31-.27-.464-.27h-.385c-.116 0-.31.04-.464.193-.193.193-.7.66-.7 1.66 0 1.005.7 1.96.81 2.092.117.116 1.45 2.33 3.546 3.255.5.232.89.39 1.197.5.5.155.97.116 1.34.077.41-.077 1.272-.5 1.45-1.005.193-.5.193-.93.155-1.005-.039-.077-.155-.116-.31-.155zm-2.97-7.245C11.74 9.96 8.34 13.36 8.34 17.76c0 1.55.464 3.06 1.36 4.34l-.93 3.4 3.5-.927a8.345 8.345 0 0 0 4.17 1.117c4.4 0 7.8-3.4 7.8-7.8 0-2.165-.85-4.21-2.385-5.745-1.535-1.535-3.58-2.385-5.745-2.385zm0 14.31a7.04 7.04 0 0 1-3.66-1.005l-.27-.155-2.7.7.736-2.62-.155-.27a7.04 7.04 0 0 1-1.005-3.66c0-3.66 2.97-6.63 6.63-6.63 1.77 0 3.43.7 4.7 1.96 1.26 1.27 1.96 2.93 1.96 4.7 0 3.66-2.97 6.63-6.63 6.63z" />
      </svg>
    </a>
  );
}
