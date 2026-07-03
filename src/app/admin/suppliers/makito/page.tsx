/**
 * /admin/suppliers/makito — panel de control para la integración B2B.
 *
 * No hay acceso público — solo aparece bajo `/admin/suppliers/` y el
 * nombre del proveedor SOLO se muestra aquí, nunca en la app pública.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import {
  getMakitoB2BMode,
  getRateBucketStatus,
} from "@/lib/suppliers/makito-b2b";
import { MakitoB2BClient } from "./MakitoB2BClient";

export const metadata: Metadata = {
  title: "Proveedor Makito · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function MakitoSupplierPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const mode = await getMakitoB2BMode();
  const sandboxLoaded =
    !!process.env.MAKITO_B2B_SANDBOX_CLIENT_ID &&
    !!process.env.MAKITO_B2B_SANDBOX_CLIENT_SECRET;
  const productionLoaded =
    !!process.env.MAKITO_B2B_PROD_CLIENT_ID &&
    !!process.env.MAKITO_B2B_PROD_CLIENT_SECRET;
  const rate = getRateBucketStatus();

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
          <span>Makito</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Integración Makito API B2B
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Cliente HTTP con auth JWT + token bucket (100 capacidad, recarga
          25/min). Las credenciales viven solo en{" "}
          <code>/docker/startidea-merch/.env</code> del VPS, jamás en el repo.
          El nombre Makito no aparece en ningún sitio público.
        </p>

        {/* Estado de credenciales en VPS */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Credenciales cargadas
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div
              className={`rounded-2xl border p-4 ${
                sandboxLoaded
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/60">
                Sandbox
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {sandboxLoaded ? "✓ MAKITO_B2B_SANDBOX_* presentes" : "◯ no configurado"}
              </p>
              <p className="mt-1 text-[11px] text-ink/55">
                Pedidos enviados aquí NO se procesan.
              </p>
            </div>
            <div
              className={`rounded-2xl border p-4 ${
                productionLoaded
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-amber-200 bg-amber-50/40"
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink/60">
                Producción
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {productionLoaded ? "✓ MAKITO_B2B_PROD_* presentes" : "◯ no configurado"}
              </p>
              <p className="mt-1 text-[11px] text-ink/55">
                Pedidos enviados aquí SÍ se procesan.
              </p>
            </div>
          </div>
        </section>

        <MakitoB2BClient
          initialMode={mode}
          sandboxLoaded={sandboxLoaded}
          productionLoaded={productionLoaded}
        />

        {/* Estado del rate limiter */}
        <section className="mt-8">
          <h2 className="font-display text-base font-semibold text-ink">
            Estado del token bucket
          </h2>
          <div className="mt-3 rounded-2xl border border-line bg-bone p-4">
            <p className="text-sm text-ink/80">
              <span className="font-mono font-semibold">{rate.tokens}</span>{" "}
              / {rate.capacity} tokens disponibles · recarga{" "}
              {rate.refillPerMinute}/min
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bone-soft">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${(rate.tokens / rate.capacity) * 100}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink/55">
              Si el bucket se vacía, las llamadas esperan en cola hasta tener
              tokens — no devolvemos 429 al usuario interno.
            </p>
          </div>
        </section>

        {/* Setup instructions */}
        {(!sandboxLoaded || !productionLoaded) && (
          <section className="mt-8 rounded-3xl border border-amber-200 bg-amber-50/40 p-5">
            <h2 className="font-display text-base font-semibold text-amber-900">
              Falta configurar credenciales en el VPS
            </h2>
            <p className="mt-2 text-sm text-amber-900/85">
              SSH a <code>root@72.61.195.108</code>, edita
              <code> /docker/startidea-merch/.env</code> y añade las 4
              variables. Luego <code>docker compose up -d app</code> recarga el
              container en segundos sin perder estado.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink/95 p-4 font-mono text-[11px] leading-relaxed text-bone/90">
{`# Sandbox (pedidos no se procesan)
MAKITO_B2B_SANDBOX_CLIENT_ID=<sandbox client id>
MAKITO_B2B_SANDBOX_CLIENT_SECRET=<sandbox client secret>

# Producción (pedidos sí se procesan)
MAKITO_B2B_PROD_CLIENT_ID=<production client id>
MAKITO_B2B_PROD_CLIENT_SECRET=<production client secret>`}
            </pre>
          </section>
        )}
      </div>
    </>
  );
}
