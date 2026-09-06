import type { Metadata } from "next";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth";
import { LogoutButton } from "@/components/admin/LogoutButton";
import {
  NavDropdown,
  type NavItem,
  type NavSection,
} from "@/components/admin/NavDropdown";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { AdminShortcuts } from "@/components/admin/AdminShortcuts";
import { MobileAdminNav, type MobileNavEntry } from "@/components/admin/MobileAdminNav";

export const metadata: Metadata = {
  title: "Panel · TodoMerchandising",
  robots: { index: false, follow: false },
};

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO",
  COMERCIAL: "Comercial",
  FACTURACION: "Facturación",
  OPERACIONES: "Operaciones",
};

const ROLE_COLOR: Record<string, string> = {
  CEO: "bg-accent text-bone",
  COMERCIAL: "bg-accent-mist text-accent-deep",
  FACTURACION: "bg-social/15 text-social",
  OPERACIONES: "bg-bone-soft text-ink/70",
};

/**
 * Entradas del nav según rol — ÚNICA fuente para el nav de escritorio
 * (NavDropdown) y el móvil (MobileAdminNav): un solo sitio que mantener.
 *
 * ── Por qué los grupos se llaman así ────────────────────────────────────────
 * Antes nombraban partes del sistema —Pedidos, Catálogo, Marketing, Analytics,
 * Admin— y quien entraba tenía que saber en cuál vive lo que quiere hacer.
 * Ahora nombran EL TRABAJO: vender, producir, cobrar. Es la diferencia entre
 * «¿dónde estará esto?» y «voy a cotizar».
 *
 * ── La regla del destacado ──────────────────────────────────────────────────
 * `highlight` marca UNA entrada por grupo, la puerta principal. Había cuatro a
 * la vez repartidas entre dos menús: cuando todo grita, nada destaca.
 *
 * ── Cotizar tenía siete puertas ─────────────────────────────────────────────
 * Estaban repartidas entre «Catálogo» y «Marketing», y la de pegar un WhatsApp
 * se llamaba «Quote Builder» —en inglés, dentro de Marketing—, donde nadie que
 * quiera cotizar la busca. Ahora viven juntas bajo Vender › Cotizar, con
 * nombres que dicen lo que hacen.
 *
 * ── Los roles no se tocan ───────────────────────────────────────────────────
 * Cada entrada conserva EXACTAMENTE el rol que le hacía falta antes: esto
 * reordena y saca a la luz, no toca el control de acceso de ninguna pantalla.
 * Las ocho que antes no tenían entrada se colocan en el grupo con el rol MÁS
 * restrictivo que ya les correspondía —el centro de control, el diagnóstico y
 * el equipo quedan en Ajustes, solo CEO—, salvo «Peticiones del formulario»,
 * que va con todos porque la propia pantalla admite a cualquier administrador
 * con sesión. Ver un enlace nunca da acceso: manda el guard de cada página,
 * más el middleware que cubre /admin entero.
 */
function buildNav(role: string): MobileNavEntry[] {
  const isCEOorComercial = role === "CEO" || role === "COMERCIAL";
  const esCEO = role === "CEO";
  const cobra = role === "CEO" || role === "FACTURACION";
  const nav: MobileNavEntry[] = [];

  // === VENDER — de la petición del cliente al presupuesto ===
  {
    const sections: NavSection[] = [];

    if (isCEOorComercial) {
      sections.push({
        title: "Cotizar",
        items: [
          {
            href: "/admin/cotizar",
            label: "Cotizar",
            title: "Producto, marcaje y cliché en una vista — coste, PVP, IVA y documento",
            highlight: true,
          },
          {
            href: "/admin/proposals/ai",
            label: "Pegar un WhatsApp o email",
            title: "El brief libre del cliente se trocea en líneas y busca los productos",
          },
          {
            href: "/admin/presupuestos",
            label: "Presupuestos",
            title: "Documento de 3 páginas con partidas, opciones y margen en vivo",
          },
          { href: "/admin/proposals/new", label: "Propuesta rápida" },
          {
            href: "/admin/suppliers/cifra/quote",
            label: "Cotizador de proveedor",
            title: "Producto + marcaje en 1 vista",
          },
        ],
      });
    }

    // Lo que entra solo: web, formulario y asistente de voz.
    sections.push({
      title: "Entra solo",
      items: [
        { href: "/admin/cart-quotes", label: "Carritos", title: "Cotizaciones activas y enviadas" },
        {
          href: "/admin/cart-quotes/abandoned",
          label: "Carritos abandonados",
          title: "Enviar recordatorios",
        },
        {
          href: "/admin/quotes",
          label: "Peticiones del formulario",
          title: "Lo que llega por el formulario de la web",
        },
        {
          href: "/admin/voice-sessions",
          label: "Llamadas del asistente",
          title: "Transcripciones y métricas del asistente de voz",
        },
      ],
    });

    if (isCEOorComercial) {
      sections.push({
        title: "Clientes",
        items: [
          { href: "/admin/clientes", label: "Fichas de cliente", title: "LTV, segmentos y notas" },
          {
            href: "/admin/marketing/outbound",
            label: "Seguimiento de leads",
            title: "Pipeline manual (LinkedIn, eventos)",
          },
        ],
      });
    }

    nav.push({ label: "Vender", sections });
  }

  // === PRODUCIR — lo aceptado, camino de salir por la puerta ===
  nav.push({
    label: "Producir",
    items: [
      { href: "/admin/orders", label: "Pedidos confirmados", highlight: true },
      {
        href: "/admin/mockup-requests",
        label: "Mockups",
        title: "Peticiones de mockup técnico (Capa D · respuesta en 4h)",
      },
      { href: "/admin/stock", label: "Stock", title: "Alertas de stock + reposición" },
      ...(esCEO
        ? [
            {
              href: "/admin/suppliers",
              label: "Proveedores",
              title: "Contacto, condiciones comerciales y estado del catálogo por proveedor",
            },
          ]
        : []),
    ] satisfies NavItem[],
  });

  // === COBRAR — dinero dentro ===
  if (cobra || isCEOorComercial) {
    const items: NavItem[] = [
      ...(cobra
        ? [
            {
              href: "/admin/analytics",
              label: "Ventas y facturación",
              title: "Dashboard interno",
              highlight: true,
            },
            {
              href: "/admin/facturascripts",
              label: "Facturas (ERP)",
              title: "Estado y reintento de facturas en FacturaScripts",
            },
          ]
        : []),
      ...(isCEOorComercial
        ? [
            {
              href: "/admin/affiliates",
              label: "Afiliados",
              title: "Cupones con comisión + crédito · ledger y pagos",
            },
          ]
        : []),
      ...(esCEO ? [{ href: "/admin/coupons", label: "Cupones" }] : []),
    ];
    if (items.length > 0) nav.push({ label: "Cobrar", items });
  }

  // === CATÁLOGO — lo que vendemos ===
  if (isCEOorComercial) {
    nav.push({
      label: "Catálogo",
      items: [
        {
          href: "/admin/products",
          label: "Productos",
          title: "Editar precio, descripción, destacar",
          highlight: true,
        },
        { href: "/admin/promotions", label: "Promociones", title: "Descuentos automáticos programados" },
        {
          href: "/admin/suppliers/cifra/marking-rates",
          label: "Tarifas de marcaje",
          title: "% por técnica",
        },
        {
          href: "/admin/products/auto-describe",
          label: "Descripciones con IA",
          title: "Auto-generar descripciones",
        },
        { href: "/admin/reviews", label: "Reseñas", title: "Opiniones publicadas por clientes" },
        { href: "/admin/recomendador", label: "Consultas del recomendador", title: "Historial" },
      ],
    });
  }

  // === MARKETING === (sin las entradas de cotizar, que se fueron a Vender)
  if (isCEOorComercial) {
    nav.push({
      label: "Marketing",
      sections: [
        {
          title: "Audiencia",
          items: [
            {
              href: "/admin/marketing/newsletter",
              label: "Newsletter",
              title: "Subscribers + import Excel/CSV + tags",
            },
            {
              href: "/admin/marketing/ruleta",
              label: "Ruleta de premios",
              title: "Editar premios + KPIs + A/B del popup de captación",
            },
            { href: "/admin/marketing/broadcasts", label: "Boletines", title: "Enviar a tus listas" },
            { href: "/admin/captacion", label: "Captación", title: "Popups y formularios de captación" },
            {
              href: "/admin/marketing/partners",
              label: "Solicitudes de partners",
              title: "Aprobar nuevas solicitudes",
            },
          ],
        },
        {
          title: "Contenido",
          items: [
            {
              href: "/admin/marketing/content",
              label: "Estudio de textos",
              title: "IA copy + workflow de aprobación",
              highlight: true,
            },
            { href: "/admin/marketing/blog", label: "Blog" },
            {
              href: "/admin/marketing/assets",
              label: "Estudio de imágenes",
              title: "IA imágenes con Magnific/Replicate",
            },
            { href: "/admin/marketing/lead-magnets", label: "Recursos descargables" },
            { href: "/admin/marketing/calendar", label: "Calendario editorial" },
          ],
        },
        {
          title: "Web y promoción",
          items: [
            { href: "/admin/marketing/banners", label: "Banners" },
            { href: "/admin/marketing/site", label: "Textos de la home" },
            { href: "/admin/marketing/portfolio", label: "Portfolio público" },
            { href: "/admin/marketing/seo", label: "SEO por página" },
            {
              href: "/admin/analytics/seo",
              label: "Posicionamiento",
              title: "Search Console + GA4 embebido",
            },
          ],
        },
        {
          title: "Captar",
          items: [
            { href: "/admin/marketing/prospect", label: "Prospección" },
            {
              href: "/admin/marketing/voice-agent",
              label: "Agente de voz",
              title: "Tracking del agente de voz",
            },
            { href: "/admin/marketing/cotizador", label: "Ajustes del cotizador web" },
          ],
        },
      ] satisfies NavSection[],
    });
  }

  // === AJUSTES === (antes «Admin»; aquí salen a la luz las pantallas huérfanas)
  if (esCEO) {
    nav.push({
      label: "Ajustes",
      sections: [
        {
          title: "Cómo va todo",
          items: [
            {
              href: "/admin/control",
              label: "Centro de control",
              title: "Estado general del negocio y del sistema",
              highlight: true,
            },
            {
              href: "/admin/insights",
              label: "Diagnóstico",
              title: "Errores, crons, integraciones, uso de IA y experimentos",
            },
            { href: "/admin/system/crons", label: "Crons", title: "Estado y disparo manual" },
          ],
        },
        {
          title: "Equipo y accesos",
          items: [
            { href: "/admin/team", label: "Equipo" },
            { href: "/admin/users", label: "Usuarios" },
            {
              href: "/admin/integrations",
              label: "Integraciones",
              title: "Metricool, Magnific, Replicate, Meta Ads, etc.",
            },
          ],
        },
      ] satisfies NavSection[],
    });
  }

  return nav;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  const nav = session ? buildNav(session.role) : [];

  return (
    <div className="min-h-screen bg-bone-soft">
      {session && (
        <div className="sticky top-0 z-30 border-b border-line bg-bone/85 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-8xl items-center justify-between px-4 text-xs sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 md:gap-4">
              {/* Home siempre */}
              <Link href="/admin" className="font-semibold text-ink hover:text-accent">
                Panel
              </Link>

              {/* Nav escritorio: dropdowns/megamenús */}
              <nav className="hidden items-center gap-4 md:flex">
                {nav.map((e) => (
                  <NavDropdown key={e.label} label={e.label} items={e.items} sections={e.sections} />
                ))}
              </nav>

              {/* Nav móvil: hamburguesa con las MISMAS entradas */}
              <div className="md:hidden">
                <MobileAdminNav entries={nav} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_COLOR[session.role] || ""}`}
              >
                {ROLE_LABELS[session.role] || session.role}
              </span>
              <Link
                href="/admin/cuenta"
                className="hidden text-ink/70 hover:text-accent sm:inline"
                title="Mi cuenta · cambiar contraseña"
              >
                {session.name}
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
      {children}
      {/* Spell C1 — Cmd+K palette global del admin (Cmd/Ctrl+K abre, Esc cierra) */}
      {session && <CommandPalette />}
      {/* Atajos de teclado g+i / g+q / … — globales para todo el panel */}
      {session && <AdminShortcuts />}
    </div>
  );
}
