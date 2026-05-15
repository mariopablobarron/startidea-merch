import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { LogoutButton } from "@/components/admin/LogoutButton";

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
              {session.role === "CEO" && (
                <>
                  <Link href="/admin/users" className="text-ink/60 hover:text-accent">
                    Usuarios
                  </Link>
                  <Link href="/admin/coupons" className="text-ink/60 hover:text-accent">
                    Cupones
                  </Link>
                  <Link
                    href="/admin/integrations"
                    className="text-ink/60 hover:text-accent"
                    title="Conectar Metricool, Meta Ads, Google Ads, LinkedIn Ads"
                  >
                    Integraciones
                  </Link>
                </>
              )}
              {(session.role === "CEO" || session.role === "COMERCIAL") && (
                <>
                  <Link
                    href="/admin/products"
                    className="text-ink/60 hover:text-accent"
                    title="Editar productos: precio, descripción, destacar"
                  >
                    Productos
                  </Link>
                  <Link
                    href="/admin/products/auto-describe"
                    className="text-ink/60 hover:text-accent"
                    title="Auto-generar descripciones con IA para productos sin descripción"
                  >
                    IA descripciones ✨
                  </Link>
                  <Link
                    href="/admin/marketing/content"
                    className="text-ink/60 hover:text-accent"
                    title="Content Studio — IA copy + workflow aprobación"
                  >
                    Content ✨
                  </Link>
                  <Link
                    href="/admin/marketing/site"
                    className="text-ink/60 hover:text-accent"
                    title="CMS · editar copy de la home"
                  >
                    Copy
                  </Link>
                  <Link
                    href="/admin/marketing/banners"
                    className="text-ink/60 hover:text-accent"
                    title="Banners promocionales"
                  >
                    Banners
                  </Link>
                  <Link
                    href="/admin/marketing/portfolio"
                    className="text-ink/60 hover:text-accent"
                    title="Trabajos realizados (portfolio público)"
                  >
                    Portfolio
                  </Link>
                  <Link
                    href="/admin/marketing/assets"
                    className="text-ink/60 hover:text-accent"
                    title="Asset Studio · IA imágenes con Magnific (upscale, fondos, mystic)"
                  >
                    Assets ✨
                  </Link>
                  <Link
                    href="/admin/marketing/broadcasts"
                    className="text-ink/60 hover:text-accent"
                    title="Email broadcasts"
                  >
                    Emails
                  </Link>
                  <Link
                    href="/admin/marketing/blog"
                    className="text-ink/60 hover:text-accent"
                    title="Blog SEO long-form"
                  >
                    Blog
                  </Link>
                  <Link
                    href="/admin/marketing/lead-magnets"
                    className="text-ink/60 hover:text-accent"
                    title="Lead magnets / PDFs descargables"
                  >
                    Recursos
                  </Link>
                  <Link
                    href="/admin/marketing/seo"
                    className="text-ink/60 hover:text-accent"
                    title="Editor SEO por página"
                  >
                    SEO
                  </Link>
                  <Link
                    href="/admin/marketing/cotizador"
                    className="text-ink/60 hover:text-accent"
                    title="Configurar formulario de cotización"
                  >
                    Cotizador
                  </Link>
                  <Link
                    href="/admin/recomendador"
                    className="text-ink/60 hover:text-accent"
                    title="Consultas al recomendador IA"
                  >
                    IA queries
                  </Link>
                  <Link href="/admin/proposals/new" className="text-accent hover:text-accent-dark">
                    ⚡ Nueva propuesta IA
                  </Link>
                  <Link href="/admin/proposals/ai" className="text-accent hover:text-accent-dark" title="Genera presupuesto desde brief libre del cliente">
                    ✨ Quote Builder IA
                  </Link>
                </>
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

