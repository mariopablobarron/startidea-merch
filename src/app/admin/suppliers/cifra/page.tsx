/**
 * /admin/suppliers/cifra — panel admin del proveedor Cifra.
 *
 * Subpáginas existentes (quote, marking-rates) siguen funcionando como
 * herramientas operativas; esta es el dashboard de estado de la
 * integración.
 *
 * El nombre del proveedor SOLO aparece aquí. Catálogo público muestra
 * solo internalRef (STM-xxx).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { CifraClient } from "./CifraClient";

export const metadata: Metadata = {
  title: "Proveedor Cifra · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CifraSupplierPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const tokenLoaded = !!process.env.CIFRA_API_TOKEN;
  const baseUrl = process.env.CIFRA_API_BASE || "https://api.cifrashop.com";
  const lang = process.env.CIFRA_LANG || "es";

  return (
    <AdminChrome>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <span>Proveedores</span>
          <span>/</span>
          <span>Cifra</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Integración Cifra Shop
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Cliente HTTP con auth via token UUID en path. Base URL:{" "}
          <code className="text-[11px]">{baseUrl}</code> · idioma:{" "}
          <code className="text-[11px]">{lang}</code>
        </p>

        {/* Sub-herramientas existentes */}
        <section className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/admin/suppliers/cifra/quote"
            className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs hover:border-accent"
          >
            🛒 Cotizar
          </Link>
          <Link
            href="/admin/suppliers/cifra/marking-rates"
            className="rounded-full border border-line bg-bone px-3 py-1.5 text-xs hover:border-accent"
          >
            🎨 Tarifa marcaje
          </Link>
        </section>

        {/* Estado credenciales */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Credenciales cargadas
          </h2>
          <div className="mt-3">
            <div
              className={`rounded-2xl border p-4 ${
                tokenLoaded
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/60">
                API Token
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {tokenLoaded
                  ? "✓ CIFRA_API_TOKEN presente"
                  : "◯ no configurado"}
              </p>
              <p className="mt-1 text-[11px] text-ink/55">
                Token UUID embebido en la URL: <code>/products/&lt;TOKEN&gt;</code>.
                Rotable desde el portal de cifra.es.
              </p>
            </div>
          </div>
        </section>

        <CifraClient tokenLoaded={tokenLoaded} />

        {/* Setup faltante */}
        {!tokenLoaded && (
          <section className="mt-8 rounded-3xl border border-amber-200 bg-amber-50/40 p-5">
            <h2 className="font-display text-base font-semibold text-amber-900">
              Falta configurar credenciales en el VPS
            </h2>
            <p className="mt-2 text-sm text-amber-900/85">
              SSH a <code>root@72.61.195.108</code>, edita{" "}
              <code>/docker/startidea-merch/.env</code> y añade el token.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink/95 p-4 font-mono text-[11px] leading-relaxed text-bone/90">
{`CIFRA_API_TOKEN=<UUID del portal cifra.es>
CIFRA_API_BASE=https://api.cifrashop.com
CIFRA_LANG=es`}
            </pre>
          </section>
        )}
      </div>
    </AdminChrome>
  );
}
