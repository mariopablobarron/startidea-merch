import Link from "next/link";
import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/admin-session";

async function logoutAction() {
  "use server";
  await clearAdminSession();
  redirect("/admin/login");
}

export function AdminChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone">
      <header className="border-b border-line bg-bone-soft">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-display text-base font-semibold">
              todo<span className="text-accent">merchandising</span>
              <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] uppercase tracking-wider text-bone">
                admin
              </span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-ink/70">
              <Link href="/admin/insights" className="font-medium text-ink hover:text-accent">
                Insights
              </Link>
              <Link href="/admin/quotes" className="hover:text-accent">
                Cotizaciones
              </Link>
              <Link href="/admin/propuestas" className="hover:text-accent">
                Propuestas
              </Link>
              <Link href="/admin/products" className="hover:text-accent">
                Productos
              </Link>
            </nav>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-ink/60 underline-offset-4 hover:text-accent hover:underline"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
