export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contacto" className="border-t border-ink/10 bg-ink text-bone">
      <div className="mx-auto max-w-8xl px-6 py-16 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.4fr,1fr,1fr,1fr]">
          <div>
            <p className="font-display text-2xl font-semibold">
              todo<span className="text-accent">merchandising</span>
            </p>
            <p className="mt-4 max-w-sm text-sm text-bone/60">
              Una iniciativa de Startidea. Merchandising corporativo personalizado con
              impacto social real.
            </p>
          </div>
          <FooterCol title="Contacto">
            <a href="mailto:hola@merchandising.startidea.es" className="hover:text-accent">
              hola@merchandising.startidea.es
            </a>
            <p className="text-bone/60">L–V 9:00 – 18:00</p>
          </FooterCol>
          <FooterCol title="Empresa">
            <a href="https://startidea.es" target="_blank" rel="noreferrer" className="hover:text-accent">
              Startidea
            </a>
            <a href="#impacto" className="hover:text-accent">Impacto social</a>
            <a href="#como" className="hover:text-accent">Cómo trabajamos</a>
          </FooterCol>
          <FooterCol title="Legal">
            <a href="/aviso-legal" className="hover:text-accent">Aviso legal</a>
            <a href="/privacidad" className="hover:text-accent">Privacidad</a>
            <a href="/cookies" className="hover:text-accent">Cookies</a>
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

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-display text-xs uppercase tracking-wider text-bone/40">{title}</p>
      {children}
    </div>
  );
}
