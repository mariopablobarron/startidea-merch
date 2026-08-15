"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readCart } from "@/lib/cart-storage";
import { cn } from "@/lib/cn";
import {
  FLOATING_SURFACES,
  isFloatingSurfaceAllowedOnPath,
  mobileFloatingOwner,
} from "@/lib/floating-surfaces";

const STORAGE_KEY = "merch:compare";

export function CompareBanner() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const pathname = usePathname() || "";

  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setSlugs(raw ? (JSON.parse(raw) as string[]) : []);
      } catch {
        setSlugs([]);
      }
      setCartCount(readCart().length);
    }
    read();
    window.addEventListener("merch:compare-change", read);
    window.addEventListener("merch:cart-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("merch:compare-change", read);
      window.removeEventListener("merch:cart-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  if (
    slugs.length === 0 ||
    !isFloatingSurfaceAllowedOnPath(FLOATING_SURFACES.compare, pathname)
  ) {
    return null;
  }

  const mobileOwner = mobileFloatingOwner({
    pathname,
    cartCount,
    compareCount: slugs.length,
  });

  return (
    <div
      data-floating-surface={FLOATING_SURFACES.compare}
      className={cn(
        "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] z-40 flex justify-center md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:transform",
        mobileOwner !== FLOATING_SURFACES.compare && "hidden md:flex",
      )}
    >
      <div className="flex min-h-11 w-full max-w-md items-center gap-2 rounded-2xl border border-line bg-ink px-3 py-1.5 text-sm text-bone shadow-2xl md:w-auto md:max-w-none md:gap-3 md:rounded-full md:px-5 md:py-2.5">
        <span className="min-w-0 flex-1 truncate font-medium">
          {slugs.length} producto{slugs.length === 1 ? "" : "s"} para comparar
        </span>
        <Link
          href={`/comparar?slugs=${slugs.join(",")}`}
          className="flex min-h-11 shrink-0 items-center rounded-full bg-accent px-4 text-xs font-medium text-bone transition-colors duration-200 motion-reduce:transition-none hover:bg-accent-dark"
        >
          Comparar →
        </Link>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
              window.dispatchEvent(new CustomEvent("merch:compare-change"));
            } catch {}
          }}
          className="min-h-11 shrink-0 rounded-full px-2 text-xs text-bone/60 transition-colors duration-200 motion-reduce:transition-none hover:text-accent"
        >
          Vaciar
        </button>
      </div>
    </div>
  );
}
