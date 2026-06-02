/**
 * /admin/insights/experiments — listado + resultados A/B.
 *
 * No incluye editor inline (los experiments se crean por API o desde
 * scripts). El listado muestra: status, variantes, eventos por
 * variante, conv%, ganador con significance.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { prisma } from "@/lib/prisma";
import { getExperimentStats } from "@/lib/experiments";
import { ExperimentsClient } from "./ExperimentsClient";

export const metadata: Metadata = {
  title: "Experiments A/B · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const list = await prisma.experiment.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  const stats = await Promise.all(
    list.map((e) => getExperimentStats(e.slug).then((s) => ({ exp: e, stats: s }))),
  );

  return (
    <AdminChrome>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <span>Experiments A/B</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">Experiments A/B</h1>
        <p className="mt-1 text-sm text-ink/60">
          Tests A/B activos en el catálogo y recomendador. Asignación
          determinística por hash del visitor. Significance con z-test simple
          requiere ≥30 views por variante.
        </p>

        <ExperimentsClient
          initial={stats.map(({ exp, stats }) => ({
            id: exp.id,
            slug: exp.slug,
            name: exp.name,
            description: exp.description,
            active: exp.active,
            variants: exp.variants,
            stats,
          }))}
        />
      </div>
    </AdminChrome>
  );
}
