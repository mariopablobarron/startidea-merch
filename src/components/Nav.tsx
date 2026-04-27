import Link from "next/link";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/5 bg-bone/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-8xl items-center justify-between px-6 lg:px-10">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          todo<span className="text-accent">merchandising</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#impacto" className="text-sm hover:text-accent">Impacto</Link>
          <Link href="/#hecho-con" className="text-sm hover:text-accent">Hecho con</Link>
          <Link href="/#productos" className="text-sm hover:text-accent">Productos</Link>
          <Link href="/sobre" className="text-sm hover:text-accent">Sobre</Link>
          <a href="mailto:hola@merchandising.startidea.es" className="text-sm hover:text-accent">Contacto</a>
        </nav>
        <Link
          href="/#cotizar"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone transition hover:bg-accent"
        >
          Pedir cotización
        </Link>
      </div>
    </header>
  );
}
