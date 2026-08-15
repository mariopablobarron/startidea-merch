"use client";

import { useEffect } from "react";
import {
  FLOATING_SURFACES,
  floatingSurfacePriority,
  type FloatingSurface,
} from "@/lib/floating-surfaces";

const SELECTOR = "[data-floating-surface]";
const MODAL_SURFACES = new Set<FloatingSurface>([
  FLOATING_SURFACES.tourDialog,
  FLOATING_SURFACES.entryDialog,
  FLOATING_SURFACES.assistantSheet,
  FLOATING_SURFACES.assistantDialog,
]);

/**
 * Fallback accesible al arbitraje CSS `:has()`: tras hidratar, deja una sola
 * superficie móvil en el árbol interactivo y un único modal también en
 * escritorio. Los empates se resuelven de forma determinista: gana la última
 * apertura presente en el DOM.
 */
export function FloatingSurfaceCoordinator() {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    function restore(element: HTMLElement) {
      if (element.dataset.floatingSuppressed !== "true") return;
      delete element.dataset.floatingSuppressed;
      element.removeAttribute("aria-hidden");
    }

    function sync() {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(SELECTOR),
      );
      const candidates = media.matches
        ? elements
        : elements.filter((element) =>
            MODAL_SURFACES.has(
              element.dataset.floatingSurface as FloatingSurface,
            ),
          );

      for (const element of elements) {
        if (!candidates.includes(element)) restore(element);
      }

      if (candidates.length <= 1) {
        candidates.forEach(restore);
        return;
      }

      let winner = candidates[0];
      let winnerPriority = floatingSurfacePriority(
        winner.dataset.floatingSurface as FloatingSurface,
      );

      for (const element of candidates.slice(1)) {
        const priority = floatingSurfacePriority(
          element.dataset.floatingSurface as FloatingSurface,
        );
        if (priority <= winnerPriority) {
          winner = element;
          winnerPriority = priority;
        }
      }

      for (const element of candidates) {
        if (element === winner) {
          restore(element);
        } else {
          if (
            document.activeElement instanceof HTMLElement &&
            element.contains(document.activeElement)
          ) {
            document.activeElement.blur();
          }
          element.dataset.floatingSuppressed = "true";
          element.setAttribute("aria-hidden", "true");
        }
      }
    }

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-floating-surface"],
    });
    media.addEventListener("change", sync);
    sync();

    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
      document
        .querySelectorAll<HTMLElement>(SELECTOR)
        .forEach(restore);
    };
  }, []);

  return null;
}
