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
 */
function buildNav(role: string): MobileNavEntry[] {
  const isCEOorComercial = role === "CEO" || role === "COMERCIAL";
  const nav: MobileNavEntry[] = [];

  // === OPERATIVA — el día a día ===
  nav.push({
    label: "Pedidos",
    items: [
      { href: "/admin/cart-quotes", label: "Carritos", title: "Cotizaciones activas y enviadas" },
      { href: "/admin/cart-quotes/abandoned", label: "Abandonados ⏳", title: "Carritos abandonados — enviar recordatorios" },
      { href: "/admin/orders", label: "Pedidos confirmados" },
      { href: "/admin/mockup-requests", label: "Mockups 🎨", title: "Peticiones de mockup técnico (Capa D · respuesta en 4h)" },
      { href: "/admin/voice-sessions", label: "David 🎙️", title: "Conversaciones del asistente IA — transcripciones y métricas" },
      { href: "/admin/stock", label: "Stock", title: "Alertas de stock + reposición" },
    ] satisfies NavItem[],
  });

  // === CATÁLOGO ===
  if (isCEOorComercial) {
    nav.push({
      label: "Catálogo",
      items: [
        { href: "/admin/products", label: "Productos", title: "Editar precio, descripción, destacar" },
        { href: "/admin/promotions", label: "Promociones 🏷", title: "Descuentos automáticos programados" },
        { href: "/admin/suppliers/cifra/marking-rates", label: "Tarifa marcaje Cifra", title: "% por técnica · cotización aproximada Cifra" },
        { href: "/admin/cotizar", label: "Cotización rápida 💸", title: "Presupuesto por cualquier referencia (nuestra o proveedor) — coste, PVP, IVA y documento", highlight: true },
        { href: "/admin/suppliers/cifra/quote", label: "Cotizador Cifra ✨", title: "Cotización rápida producto+marcaje en 1 vista" },
        { href: "/admin/products/auto-describe", label: "IA descripciones ✨", title: "Auto-generar descripciones con IA" },
        { href: "/admin/recomendador", label: "Consultas IA", title: "Historial del recomendador" },
      ],
    });
  }

  // === MARKETING (megamenu de 4 columnas) ===
  if (isCEOorComercial) {
    nav.push({
      label: "Marketing",
      sections: [
        {
          title: "Audiencia",
          items: [
            { href: "/admin/marketing/newsletter", label: "Newsletter 📧", title: "Subscribers + import Excel/CSV + tags" },
            { href: "/admin/marketing/ruleta", label: "Ruleta de premios 🎡", title: "Editar premios + KPIs + A/B del popup de captación" },
            { href: "/admin/marketing/broadcasts", label: "Broadcasts (email)", title: "Enviar boletines a tus listas" },
            { href: "/admin/clientes", label: "CRM clientes", title: "Clientes con cuenta — LTV, segmentos, notas" },
            { href: "/admin/marketing/outbound", label: "CRM outbound", title: "Pipeline manual de leads (LinkedIn, eventos)" },
            { href: "/admin/affiliates", label: "Afiliados 💰", title: "Cupones con comisión + crédito · ledger + payouts" },
            { href: "/admin/marketing/partners", label: "Solicitudes partners 🤝", title: "Aprobar nuevas solicitudes" },
          ],
        },
        {
          title: "Contenido",
          items: [
            { href: "/admin/marketing/content", label: "Content Studio ✨", title: "IA copy + workflow aprobación", highlight: true },
            { href: "/admin/marketing/blog", label: "Blog SEO" },
            { href: "/admin/marketing/assets", label: "Asset Studio ✨", title: "IA imágenes con Magnific/Replicate", highlight: true },
            { href: "/admin/marketing/lead-magnets", label: "Recursos / lead magnets" },
          ],
        },
        {
          title: "Promoción & Web",
          items: [
            { href: "/admin/marketing/banners", label: "Banners promocionales" },
            { href: "/admin/marketing/site", label: "Copy (CMS home)" },
            { href: "/admin/marketing/portfolio", label: "Portfolio público" },
            { href: "/admin/marketing/seo", label: "SEO por página" },
          ],
        },
        {
          title: "Conversión",
          items: [
            { href: "/admin/marketing/cotizador", label: "Cotizador (settings)" },
            { href: "/admin/marketing/voice-agent", label: "Carmen (voz) 🎙", title: "Tracking del agente de voz" },
            { href: "/admin/proposals/new", label: "⚡ Propuesta IA", highlight: true },
            { href: "/admin/proposals/ai", label: "✨ Quote Builder", title: "Genera presupuesto desde brief libre", highlight: true },
          ],
        },
      ] satisfies NavSection[],
    });
  }

  // === ANALYTICS ===
  if (role === "CEO" || role === "FACTURACION" || role === "COMERCIAL") {
    const items: NavItem[] = [
      ...(role === "CEO" || role === "FACTURACION"
        ? [
            { href: "/admin/analytics", label: "Ventas + facturación", title: "Dashboard interno" },
            {
              href: "/admin/facturascripts",
              label: "Facturas (ERP) 🧾",
              title: "Estado y reintento de facturas en FacturaScripts (facturas.startidea.tech)",
            },
          ]
        : []),
      ...(isCEOorComercial
        ? [
            {
              href: "/admin/analytics/seo",
              label: "SEO 📊",
              title: "Search Console + GA4 embebido (Looker)",
            },
          ]
        : []),
    ];
    if (items.length > 0) nav.push({ label: "Analytics", items });
  }

  // === ADMIN (solo CEO) ===
  if (role === "CEO") {
    nav.push({
      label: "Admin",
      items: [
        { href: "/admin/suppliers", label: "Proveedores 🏭", title: "Contacto, condiciones comerciales y estado del catálogo por proveedor" },
        { href: "/admin/users", label: "Usuarios" },
        { href: "/admin/coupons", label: "Cupones" },
        { href: "/admin/integrations", label: "Integraciones", title: "Metricool, Magnific, Replicate, Meta Ads, etc." },
        { href: "/admin/system/crons", label: "Crons ⏱", title: "Estado de los crons del VPS · disparar manualmente" },
      ],
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
