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
              <Link href="/admin/orders" className="text-ink/60 hover:text-accent">
                Pedidos
              </Link>
              {(session.role === "CEO" || session.role === "FACTURACION") && (
                <Link href="/admin/analytics" className="text-ink/60 hover:text-accent">
                  Analytics
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
                </>
              )}
              {(session.role === "CEO" || session.role === "COMERCIAL") && (
                <Link href="/admin/proposals/new" className="text-accent hover:text-accent-dark">
                  ⚡ Nueva propuesta IA
                </Link>
              )}
            </nav>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ROLE_COLOR[session.role] || ""}`}>
                {ROLE_LABELS[session.role] || session.role}
              </span>
              <span className="text-ink/70">{session.name}</span>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

