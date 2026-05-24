"use client";

/**
 * Spell C2 — Undo toast.
 *
 * Toast con timer visible que permite deshacer una acción durante N segundos.
 * Si el usuario pulsa "Deshacer" antes del timeout → llama a `onUndo`. Si el
 * timeout vence → llama a `onCommit` (acción queda firme; ideal para hacer
 * el commit real al backend solo cuando ya nadie va a deshacer).
 *
 * Patrón "optimistic action + soft commit": el usuario ve el cambio
 * inmediatamente en su UI, pero el backend solo se llama cuando el toast
 * vence. Si pulsa deshacer, revertimos la UI sin haber tocado backend.
 *
 * Si necesitas commit inmediato + undo que llame al backend para revertir,
 * usa modo `commitImmediate=true` y `onUndo` hará la llamada inversa.
 *
 * Uso típico:
 *   const { showUndoToast } = useUndoToast();
 *
 *   function onPausePromo(id) {
 *     setPromos(prev => prev.map(p => p.id===id ? {...p, active:false} : p));
 *     showUndoToast({
 *       message: "Promoción pausada",
 *       onUndo: () => setPromos(prev => prev.map(p => p.id===id ? {...p, active:true} : p)),
 *       onCommit: () => fetch(`/api/admin/promotions/${id}`, {method:"PUT", body: JSON.stringify({active:false})}),
 *     });
 *   }
 *
 * Montaje: añadir <UndoToastHost /> una sola vez en el layout admin.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION = 7000; // 7s — ventana razonable, no agobia

type ToastPayload = {
  id: string;
  message: string;
  onUndo?: () => void;
  onCommit?: () => void | Promise<void>;
  /** Si true, ejecuta onCommit inmediatamente; onUndo deshace via backend. Default false. */
  commitImmediate?: boolean;
  /** Duración en ms (default 7000) */
  duration?: number;
};

type UndoToastContextValue = {
  showUndoToast: (payload: Omit<ToastPayload, "id">) => void;
};

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

export function useUndoToast() {
  const ctx = useContext(UndoToastContext);
  if (!ctx) {
    throw new Error(
      "useUndoToast: falta <UndoToastHost/> en el árbol. Añádelo al layout.",
    );
  }
  return ctx;
}

/**
 * Host del sistema de toasts. Renderiza el toast actual y maneja timers.
 * Solo se debe montar UNA VEZ en el layout (admin o global). Provee el
 * context para que cualquier hijo llame `useUndoToast().showUndoToast(...)`.
 */
export function UndoToastHost({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [progress, setProgress] = useState(1); // 1 → 0
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const showUndoToast = useCallback((payload: Omit<ToastPayload, "id">) => {
    // Si hay otro toast pendiente, lo commit-eamos antes de pisarlo
    setToast((current) => {
      if (current && !current.commitImmediate) {
        current.onCommit?.();
      }
      return null;
    });
    // Trigger immediate commit if requested
    if (payload.commitImmediate) {
      payload.onCommit?.();
    }
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    setToast({ ...payload, id });
  }, []);

  // Timer + progress bar
  useEffect(() => {
    if (!toast) return;
    const duration = toast.duration ?? DEFAULT_DURATION;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      setProgress(Math.max(0, 1 - elapsed / duration));
      if (elapsed < duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = window.setTimeout(() => {
      if (!toast.commitImmediate) toast.onCommit?.();
      setToast(null);
      setProgress(1);
    }, duration);

    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [toast]);

  function handleUndo() {
    if (!toast) return;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    toast.onUndo?.();
    setToast(null);
    setProgress(1);
  }

  function handleDismiss() {
    if (!toast) return;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    // Dismiss = commit firme (igual que dejar vencer el timer)
    if (!toast.commitImmediate) toast.onCommit?.();
    setToast(null);
    setProgress(1);
  }

  return (
    <UndoToastContext.Provider value={{ showUndoToast }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl border border-line bg-ink text-bone shadow-2xl"
          style={{ minWidth: 320, maxWidth: "calc(100vw - 32px)" }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-social/20 text-social">
              ✓
            </span>
            <span className="flex-1 text-sm">{toast.message}</span>
            <button
              type="button"
              onClick={handleUndo}
              className="rounded-full bg-bone/10 px-3 py-1 text-xs font-semibold text-bone hover:bg-bone/20"
            >
              Deshacer
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Cerrar"
              className="rounded-full p-1 text-bone/50 hover:bg-bone/10 hover:text-bone"
            >
              ✕
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1 w-full overflow-hidden rounded-b-2xl bg-bone/10">
            <div
              className="h-full bg-accent transition-[width] duration-100 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}
    </UndoToastContext.Provider>
  );
}
