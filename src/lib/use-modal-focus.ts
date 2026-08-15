"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableChildren(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

function inertOutside(container: HTMLElement): () => void {
  const changed: Array<{ element: HTMLElement; inert: boolean }> = [];
  let current: HTMLElement = container;

  while (current.parentElement) {
    const parent = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      changed.push({ element: sibling, inert: sibling.inert });
      sibling.inert = true;
    }
    if (parent === document.body) break;
    current = parent;
  }

  return () => {
    for (const { element, inert } of changed) element.inert = inert;
  };
}

export function useModalFocus(input: {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
  restoreFallbackSelector?: string;
}) {
  const escapeRef = useRef(input.onEscape);
  escapeRef.current = input.onEscape;
  const { active, containerRef, restoreFallbackSelector } = input;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let activated = false;
    let frame = 0;
    let restoreOutside = () => {};

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableChildren(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const deactivate = () => {
      if (!activated) return;
      activated = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      restoreOutside();
      restoreOutside = () => {};
    };

    const sync = () => {
      const suppressed =
        container.dataset.floatingSuppressed === "true" ||
        getComputedStyle(container).display === "none";
      if (suppressed) {
        deactivate();
        return;
      }
      if (activated) return;

      activated = true;
      restoreOutside = inertOutside(container);
      document.addEventListener("keydown", onKeyDown);
      frame = requestAnimationFrame(() => {
        const preferred = container.querySelector<HTMLElement>(
          "[data-modal-initial-focus]",
        );
        (preferred || focusableChildren(container)[0] || container).focus();
      });
    };

    const observer = new MutationObserver(sync);
    observer.observe(container, {
      attributes: true,
      attributeFilter: ["data-floating-suppressed"],
    });
    frame = requestAnimationFrame(sync);

    return () => {
      observer.disconnect();
      deactivate();
      requestAnimationFrame(() => {
        if (previous?.isConnected) {
          previous.focus();
          return;
        }
        if (restoreFallbackSelector) {
          document
            .querySelector<HTMLElement>(restoreFallbackSelector)
            ?.focus();
        }
      });
    };
  }, [active, containerRef, restoreFallbackSelector]);
}
