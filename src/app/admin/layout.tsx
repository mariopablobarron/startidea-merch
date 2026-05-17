import type { Metadata } from "next";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { NavDropdown } from "@/components/admin/NavDropdown";

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  // Permitir login sin sesión
  return (
    <div className="min-h-screen bg-bone-soft">
      {session && (
        <div className="sticky top-0 z-30 border-b border-line bg-bone/85 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-8xl items-center justify-between px-6 text-xs lg:px-8">
            <nav className="flex items-center gap-4">
              <Link href="/admin" className="font-semibold text-ink hover:text-accent">
                Panel
              </Link>
              <Link href="/admin/cart-quotes" className="text-ink/60 hover:text-accent">
                Carritos
              </Link>
              <Link
                href="/admin/cart-quotes/abandoned"
                className="text-ink/60 hover:text-accent"
                title="Carritos abandonados — enviar recordatorios"
              >
                Abandonados
              </Link>
              <Link href="/admin/orders" className="text-ink/60 hover:text-accent">
                Pedidos
              </Link>
              <Link
                href="/admin/mockup-requests"
                className="text-ink/60 hover:text-accent"
                title="Peticiones de mockup técnico (Capa D · respuesta en 4h)"
              >
                Mockups 🎨
              </Link>
              <Link
                href="/admin/clientes"
                className="text-ink/60 hover:text-accent"
                title="CRM clientes — LTV, segmentos, notas"
              >
                Clientes
              </Link>
              <Link
                href="/admin/stock"
                className="text-ink/60 hover:text-accent"
                title="Alertas de stock + reposición"
              >
                Stock
              </Link>
              {(session.role === "CEO" || session.role === "FACTURACION") && (
                <Link href="/admin/analytics" className="text-ink/60 hover:text-accent">
                  Analytics
                </Link>
              )}
              {(session.role === "CEO" || session.role === "COMERCIAL") && (
                <Link
                  href="/admin/analytics/seo"
                  className="text-ink/60 hover:text-accent"
                  title="Dashboard Search Console + GA4 embebido (Looker Studio)"
                >
                  SEO 📊
                </Link>
              )}
              {(session.role === "CEO" || session.role === "COMERCIAL") && (
                <>
                  <NavDropdown
                    label="Catálogo"
                    items={[
                      { href: "/admin/products", label: "Productos", title: "Editar productos: precio, descripción, destacar" },
                      { href: "/admin/products/auto-describe", label: "IA descripciones ✨", title: "Auto-generar descripciones con IA para productos sin descripción" },
                      { href: "/admin/recomendador", label: "Consultas IA", title: "Historial de consultas al recomendador" },
                    ]}
                  />
                  <NavDropdown
                    label="Marketing"
                    items={[
                      { href: "/admin/marketing/content", label: "Content Studio ✨", title: "Content Studio — IA copy + workflow aprobación" },
                      { href: "/admin/marketing/site", label: "Copy (CMS home)" },
                      { href: "/admin/marketing/banners", label: "Banners promocionales" },
                      { href: "/admin/marketing/portfolio", label: "Portfolio", title: "Trabajos realizados (portfolio público)" },
                      { href: "/admin/marketing/assets", label: "Asset Studio ✨", title: "IA imágenes con Magnific/Replicate" },
                      { href: "/admin/marketing/broadcasts", label: "Emails (broadcasts)" },
                      { href: "/admin/marketing/blog", label: "Blog SEO" },
                      { href: "/admin/marketing/lead-magnets", label: "Recursos / lead magnets" },
                      { href: "/admin/marketing/partners", label: "Partners 🤝", title: "Programa de afiliados — aprobar solicitudes" },
                      { href: "/admin/marketing/outbound", label: "CRM outbound", title: "Pipeline manual de leads (LinkedIn, eventos)" },
                      { href: "/admin/marketing/voice-agent", label: "Alma (voz) 🎙", title: "Tracking del agente de voz (ElevenLabs)" },
                      { href: "/admin/marketing/seo", label: "SEO por página" },
                      { href: "/admin/marketing/cotizador", label: "Cotizador (settings)" },
                    ]}
                  />
                  <Link href="/admin/proposals/new" className="text-accent hover:text-accent-dark">
                    ⚡ Propuesta IA
                  </Link>
                  <Link
                    href="/admin/proposals/ai"
                    className="text-accent hover:text-accent-dark"
                    title="Genera presupuesto desde brief libre del cliente"
                  >
                    ✨ Quote Builder
                  </Link>
                </>
              )}
              {session.role === "CEO" && (
                <NavDropdown
                  label="Admin"
                  items={[
                    { href: "/admin/users", label: "Usuarios" },
                    { href: "/admin/coupons", label: "Cupones" },
                    { href: "/admin/integrations", label: "Integraciones", title: "Metricool, Magnific, Replicate, Meta Ads, etc." },
                    { href: "/admin/system/crons", label: "Crons ⏱", title: "Estado de los crons del VPS · disparar manualmente · histórico" },
                  ]}
                />
              )}
            </nav>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_COLOR[session.role] || ""}`}
              >
                {ROLE_LABELS[session.role] || session.role}
              </span>
              <Link
                href="/admin/cuenta"
                className="text-ink/70 hover:text-accent"
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
    </div>
  );
}

