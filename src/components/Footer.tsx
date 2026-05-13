import Link from "next/link";
import Image from "next/image";
import { NewsletterForm } from "./NewsletterForm";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contacto" className="border-t border-line bg-ink text-bone">
      {/* Strip de confianza — tres bloques de propuesta de valor */}
      <div className="border-b border-bone/10">
        <div className="mx-auto grid max-w-8xl gap-px bg-bone/5 px-6 lg:grid-cols-3 lg:px-10">
          <TrustBlock
            icon={
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z" strokeLinejoin="round" />
                <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Producción con impacto"
            text="Cada pedido se fabrica en Centros Especiales de Empleo o talleres locales certificados."
          />
          <TrustBlock
            icon={
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Cotización en 24 h"
            text="Te enviamos brief cerrado con precio, plazo, mockup y opciones de marcaje en menos de 24 horas laborables."
          />
          <TrustBlock
            icon={
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 7h13l4 4v6h-2" strokeLinejoin="round" />
                <path d="M3 7v10h2" />
                <circle cx="7" cy="17" r="2" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            }
            title="Envío peninsular 7–15 días"
            text="Stock europeo + producción nacional. Plazos cerrados, sin sorpresas. Pedidos urgentes consultar."
          />
        </div>
      </div>

      <div className="mx-auto max-w-8xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr,1fr,1fr,1fr]">
          <div>
            <p className="font-display text-2xl font-semibold">
              todo<span className="text-accent">merchandising</span>
            </p>
            <p className="mt-4 max-w-sm text-sm text-bone/60">
              Una iniciativa de{" "}
              <a
                href="https://startidea.es"
                target="_blank"
                rel="noopener"
                className="underline-offset-2 hover:underline"
              >
                Startidea
              </a>
              , consultora de marketing y comunicación con sede en Granada. Damos forma
              a ideas que ya estaban ahí, esperando ser contadas.
            </p>
            <p className="mt-3 text-xs text-bone/40">
              STARTIDEA MALAGA SL · CIF B19583632
              <br />
              C/ Conde Cifuentes, 33 — 18005 Granada
            </p>

            {/* Endorsement Startidea matriz — logo oficial blanco */}
            <a
              href="https://startidea.es"
              target="_blank"
              rel="noopener"
              className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-bone/15 bg-bone/5 px-4 py-3 transition hover:border-bone/30 hover:bg-bone/10"
              title="Visitar Startidea — consultora matriz"
            >
              <Image
                src="/logo-startidea-blanco.png"
                alt="Startidea"
                width={538}
                height={538}
                className="h-12 w-auto flex-shrink-0"
              />
              <span className="block text-xs text-bone/60">
                Una iniciativa de Startidea — Agencia de Innovación Social
              </span>
            </a>
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-bone/40">
                Newsletter mensual con casos reales
              </p>
              <NewsletterForm />
            </div>
          </div>
          <FooterCol title="Contacto">
            <a href="mailto:pedidos@startidea.es" className="hover:text-accent">
              pedidos@startidea.es
            </a>
            <a href="tel:+34958045789" className="hover:text-accent">
              +34 958 045 789
            </a>
            <p className="text-bone/60">L–V 9:00 – 18:00</p>
          </FooterCol>
          <FooterCol title="Catálogo">
            <Link href="/catalogo" className="hover:text-accent">Todos los productos</Link>
            <Link href="/catalogo?cat=ropa-y-textil" className="hover:text-accent">Textil</Link>
            <Link href="/catalogo?cat=oficina-y-escritura" className="hover:text-accent">Escritura</Link>
            <Link href="/ayuda" className="hover:text-accent">Centro de ayuda</Link>
          </FooterCol>
          <FooterCol title="Legal">
            <Link href="/aviso-legal" className="hover:text-accent">Aviso legal</Link>
            <Link href="/privacidad" className="hover:text-accent">Privacidad</Link>
            <Link href="/cookies" className="hover:text-accent">Cookies</Link>
          </FooterCol>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-bone/10 pt-8 text-xs text-bone/50 sm:flex-row sm:items-center">
          <p>© {year} Startidea · todomerchandising. Todos los derechos reservados.</p>
          <p>Producido en España con materiales responsables.</p>
        </div>
      </div>
    </footer>
  );
}

function TrustBlock({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-4 bg-ink p-7 lg:p-8">
      <span className="text-accent">{icon}</span>
      <div>
        <p className="font-display text-base font-semibold text-bone">{title}</p>
        <p className="mt-1 text-sm text-bone/60">{text}</p>
      </div>
    </div>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-display text-xs uppercase tracking-wider text-bone/40">{title}</p>
      {children}
    </div>
  );
}
