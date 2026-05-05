import Link from "next/link";
import Image from "next/image";
import { NavSearch } from "./NavSearch";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bone-soft/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-8xl items-center gap-6 px-6 lg:gap-10 lg:px-10">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-ink"
        >
          <Image src="/logo-mark.svg" alt="" width={28} height={28} className="rounded-md" />
          <span>
            todo<span className="text-accent">merchandising</span>
          </span>
        </Link>

        {/* Buscador siempre visible — patrón Garrampa */}
        <div className="hidden flex-1 lg:flex lg:max-w-xl">
          <NavSearch />
        </div>

        <nav className="hidden items-center gap-7 md:flex">
          <Link href="/catalogo" className="text-sm font-medium hover:text-accent">
            Catálogo
          </Link>
          <Link
            href="/recomendador"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-dark"
          >
            <span>Recomendador IA</span>
            <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent-deep">
              Nuevo
            </span>
          </Link>
          <Link href="/#impacto" className="text-sm hover:text-accent">
            Impacto
          </Link>
          <Link href="/sobre" className="text-sm hover:text-accent">
            Sobre
          </Link>
          <Link href="/ayuda" className="text-sm hover:text-accent">
            Ayuda
          </Link>
        </nav>

        <Link
          href="/#cotizar"
          className="hidden rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone transition hover:bg-accent sm:inline-flex"
        >
          Pedir cotización
        </Link>
      </div>
    </header>
  );
}
