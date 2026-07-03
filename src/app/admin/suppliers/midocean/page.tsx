/**
 * /admin/suppliers/midocean — panel admin del proveedor MidOcean.
 *
 * Igual patrón que /admin/suppliers/makito:
 *  - Estado de credenciales en env
 *  - Toggle live-orders (sandbox/producción) persistido en AdminSetting
 *  - Botón "Probar conexión" → ping al gateway
 *
 * El nombre del proveedor SOLO aparece aquí, jamás en la UI pública.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { describeMidoceanLiveOrders } from "@/lib/suppliers/midocean-mode";
import { MidoceanClient } from "./MidoceanClient";

export const metadata: Metadata = {
  title: "Proveedor MidOcean · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function MidoceanSupplierPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const apiKeyLoaded = !!process.env.MIDOCEAN_API_KEY;
  const customerNumberLoaded = !!process.env.MIDOCEAN_CUSTOMER_NUMBER;
  const baseUrl = process.env.MIDOCEAN_API_BASE || "https://api.midocean.com";
  const liveOrders = await describeMidoceanLiveOrders();

  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <span>Proveedores</span>
          <span>/</span>
          <span>MidOcean</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Integración MidOcean Gateway
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Cliente HTTP con auth via <code>x-Gateway-APIKey</code>. Endpoints
          de catálogo, stock, precios y pedidos. Base URL:{" "}
          <code className="text-[11px]">{baseUrl}</code>
        </p>

        {/* Estado credenciales */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Credenciales cargadas
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div
              className={`rounded-2xl border p-4 ${
                apiKeyLoaded
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/60">
                API Key
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {apiKeyLoaded
                  ? "✓ MIDOCEAN_API_KEY presente"
                  : "◯ no configurada"}
              </p>
              <p className="mt-1 text-[11px] text-ink/55">
                Header <code>x-Gateway-APIKey</code> en cada request.
              </p>
            </div>
            <div
              className={`rounded-2xl border p-4 ${
                customerNumberLoaded
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/60">
                Customer Number
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {customerNumberLoaded
                  ? "✓ MIDOCEAN_CUSTOMER_NUMBER presente"
                  : "◯ no configurado"}
              </p>
              <p className="mt-1 text-[11px] text-ink/55">
                Necesario para crear pedidos. Opcional para sync catálogo.
              </p>
            </div>
          </div>
        </section>

        <MidoceanClient
          initialLive={liveOrders.active}
          initialSource={liveOrders.source}
          initialFromBd={liveOrders.fromBd}
          initialFromEnv={liveOrders.fromEnv}
          apiKeyLoaded={apiKeyLoaded}
        />

        {/* Setup faltante */}
        {!apiKeyLoaded && (
          <section className="mt-8 rounded-3xl border border-amber-200 bg-amber-50/40 p-5">
            <h2 className="font-display text-base font-semibold text-amber-900">
              Falta configurar credenciales en el VPS
            </h2>
            <p className="mt-2 text-sm text-amber-900/85">
              SSH a <code>root@72.61.195.108</code>, edita{" "}
              <code>/docker/startidea-merch/.env</code> y añade las variables.
              Luego <code>docker compose up -d app</code> recarga el container.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink/95 p-4 font-mono text-[11px] leading-relaxed text-bone/90">
{`MIDOCEAN_API_KEY=<api key del portal>
MIDOCEAN_CUSTOMER_NUMBER=<número de cliente, ej. 80869510>
MIDOCEAN_API_BASE=https://api.midocean.com`}
            </pre>
          </section>
        )}
      </div>
    </>
  );
}
