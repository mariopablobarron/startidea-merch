"use client";

import { useEffect, useState } from "react";
import { FLOATING_SURFACES } from "@/lib/floating-surfaces";

export function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const inHero = y < 500;
      // Ocultar cerca del propio formulario para no estorbar
      const cotizar = document.getElementById("cotizar");
      const inCotizar =
        cotizar && cotizar.getBoundingClientRect().top < window.innerHeight * 0.8;
      setVisible(!inHero && !inCotizar);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div
      data-floating-surface={FLOATING_SURFACES.transactional}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bone/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center gap-3">
        <a
          href="#cotizar"
          className="flex-1 rounded-full bg-ink py-3 text-center text-sm font-medium text-bone transition active:bg-accent"
        >
          Pedir cotización
        </a>
      </div>
    </div>
  );
}
