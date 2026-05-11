"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NavSearch } from "./NavSearch";
import { TopBar } from "./TopBar";
import { NavCartBadge } from "./NavCartBadge";

type NavLink = { href: string; label: string; badge?: string };

const NAV_LINKS: NavLink[] = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/promociones", label: "Promos", badge: "★" },
  { href: "/recomendador", label: "Recomendador IA" },
  { href: "/trabajos", label: "Trabajos" },
  { href: "/#impacto", label: "Impacto" },
  { href: "/sobre", label: "Sobre" },
  { href: "/ayuda", label: "Ayuda" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  // Portal solo tras hidratación
  useEffect(() => setMounted(true), []);

  // Cerrar menú al cambiar de ruta
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bone-soft/85 backdrop-blur">
      <TopBar />
      <div className="mx-auto flex h-16 max-w-8xl items-center gap-4 px-4 sm:gap-6 sm:px-6 lg:gap-10 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-ink sm:text-xl"
        >
          <Image src="/logo-mark.svg" alt="" width={28} height={28} className="rounded-md" />
          <span>
            todo<span className="text-accent">merchandising</span>
          </span>
        </Link>

        {/* Buscador desktop */}
        <div className="hidden flex-1 lg:flex lg:max-w-xl">
          <NavSearch />
        </div>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`inline-flex items-center gap-1 text-sm hover:text-accent ${l.badge ? "font-medium text-accent" : "font-medium"}`}
            >
              <span>{l.label}</span>
              {l.badge && (
                <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-deep">
                  {l.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Acciones desktop: cesta + login + CTA */}
        <div className="ml-auto hidden items-center gap-2 sm:flex md:ml-0">
          <NavCartBadge />
          <Link
            href="/clientes"
            className="hidden rounded-full border border-line bg-bone-soft px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:border-accent hover:text-ink lg:inline-flex"
            title="Acceder al portal de cliente"
          >
            Mi cuenta
          </Link>
          <Link
            href="/#cotizar"
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone transition hover:bg-accent"
          >
            Pedir cotización
          </Link>
        </div>

        {/* Cart badge móvil (siempre visible) */}
        <div className="ml-auto sm:hidden">
          <NavCartBadge />
        </div>

        {/* Botón hamburguesa móvil — solo <md */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-bone text-ink hover:border-accent md:hidden"
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </div>

      {/* Drawer móvil — Portal a body para escapar del backdrop-filter del
          header (que crea containing block para position:fixed) */}
      {open &&
        mounted &&
        createPortal(
          <div
            id="mobile-drawer"
            className="fixed inset-0 z-[60] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú principal"
          >
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            aria-label="Cerrar menú"
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col bg-bone shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="font-display text-base font-semibold text-ink">Menú</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink hover:border-accent"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Buscador móvil */}
            <div className="border-b border-line px-5 py-4">
              <NavSearch />
            </div>

            {/* Links */}
            <nav className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-1">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-bone-soft hover:text-accent"
                    >
                      <span>{l.label}</span>
                      {l.badge && (
                        <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-deep">
                          {l.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                <li className="pt-4">
                  <Link
                    href="/clientes"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-ink/70 hover:bg-bone-soft hover:text-accent"
                  >
                    <span>👤</span>
                    <span>Mi área de cliente</span>
                  </Link>
                </li>
              </ul>
            </nav>

            {/* CTA primario abajo */}
            <div className="border-t border-line px-5 py-4">
              <Link
                href="/#cotizar"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-bone shadow"
              >
                Pedir cotización en 24h →
              </Link>
              <Link
                href="/catalogo"
                onClick={() => setOpen(false)}
                className="mt-2 flex w-full items-center justify-center rounded-full border border-line bg-bone px-5 py-3 text-sm font-medium text-ink hover:border-accent"
              >
                Ver catálogo
              </Link>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </header>
  );
}
