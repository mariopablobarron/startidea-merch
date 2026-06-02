"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atajos de teclado tipo Linear/Notion para el panel admin.
 *
 * Secuencias (estilo Vim "g" prefix):
 *   g + i  → Insights
 *   g + q  → Quick
 *   g + p  → Propuestas
 *   g + e  → Experiments
 *   g + n  → Notificaciones
 *   g + l  → Actions log
 *   g + r  → Errors (R de eRrores)
 *   g + s  → Search aliases
 *
 * También ? muestra ayuda en consola.
 */
const SHORTCUTS: Record<string, { href: string; label: string }> = {
  i: { href: "/admin/insights", label: "Insights" },
  q: { href: "/admin/quick", label: "Quick view" },
  p: { href: "/admin/propuestas", label: "Propuestas" },
  e: { href: "/admin/insights/experiments", label: "Experiments" },
  n: { href: "/admin/insights/notifications", label: "Notificaciones" },
  l: { href: "/admin/insights/actions-log", label: "Actions log" },
  r: { href: "/admin/insights/errors", label: "Errores" },
  s: { href: "/admin/insights/search-aliases", label: "Search aliases" },
};

export function AdminShortcuts() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined") return;
    let gPressed = false;
    let gTimeout: ReturnType<typeof setTimeout> | null = null;

    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      if (e.key === "?") {
        const lines = Object.entries(SHORTCUTS).map(
          ([k, v]) => `  g + ${k}  →  ${v.label}`,
        );
        // eslint-disable-next-line no-console
        console.log("Admin shortcuts:\n" + lines.join("\n"));
        return;
      }

      if (e.key === "g" && !gPressed) {
        gPressed = true;
        if (gTimeout) clearTimeout(gTimeout);
        gTimeout = setTimeout(() => {
          gPressed = false;
        }, 1200);
        return;
      }

      if (gPressed) {
        const target = SHORTCUTS[e.key.toLowerCase()];
        gPressed = false;
        if (gTimeout) clearTimeout(gTimeout);
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [router]);

  return null;
}
