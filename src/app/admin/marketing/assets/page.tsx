import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-auth";
import { AssetStudio } from "./AssetStudio";

export const metadata: Metadata = {
  title: "Asset Studio · Marketing",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  // Solo CEO + COMERCIAL pueden acceder
  const session = await getAdminSession();
  if (!session) redirect("/admin/login?next=/admin/marketing/assets");
  if (!["CEO", "COMERCIAL"].includes(session.role)) {
    redirect("/admin?error=sin_permiso");
  }

  // Estado integración Magnific
  const integ = await prisma.integrationConfig.findUnique({
    where: { provider: "MAGNIFIC" },
  });
  const isEnabled = integ?.enabled === true;
  const hasKey =
    typeof integ?.config === "object" &&
    integ?.config !== null &&
    "apiKey" in integ.config &&
    Boolean((integ.config as { apiKey?: string }).apiKey);

  // Tareas recientes — combinar Magnific + Replicate (últimas 30 globales)
  const [magnificTasks, replicateTasks, replicateInteg] = await Promise.all([
    prisma.magnificTask.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.replicateTask.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.integrationConfig.findUnique({ where: { provider: "REPLICATE" } }),
  ]);
  const replicateEnabled =
    replicateInteg?.enabled === true &&
    typeof replicateInteg?.config === "object" &&
    replicateInteg?.config !== null &&
    "apiToken" in replicateInteg.config &&
    Boolean((replicateInteg.config as { apiToken?: string }).apiToken);

  // Unificar con provider tag y ordenar
  const allTasks = [
    ...magnificTasks.map((t) => ({
      id: t.id,
      provider: "magnific" as const,
      type: t.type,
      status: t.status,
      inputUrl: t.inputUrl,
      outputUrl: t.outputUrl,
      previewUrl: t.previewUrl,
      prompt: t.prompt,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
    })),
    ...replicateTasks.map((t) => ({
      id: t.id,
      provider: "replicate" as const,
      type: t.type,
      status: t.status,
      inputUrl: t.inputUrl,
      outputUrl: t.outputUrl,
      previewUrl: null,
      prompt: t.prompt,
      error: t.error,
      createdAt: t.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  return (
    <main className="min-h-screen bg-bone-soft p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Marketing · Asset Studio
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
              Asset Studio ✨
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-ink/60">
              IA imágenes con Magnific (premium) y Replicate (económico). Upscale,
              eliminar fondos, generar creatividades. Tareas asíncronas se actualizan
              automáticamente.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/integrations/magnific"
              className="rounded-full border border-line bg-bone px-4 py-1.5 text-xs hover:border-accent"
            >
              ⚙ Magnific
            </Link>
            <Link
              href="/admin/integrations/replicate"
              className="rounded-full border border-line bg-bone px-4 py-1.5 text-xs hover:border-accent"
            >
              ⚙ Replicate
            </Link>
          </div>
        </header>

        {(!isEnabled || !hasKey) && (
          <div className="mb-6 rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink/80">
            <p className="font-semibold">⚠ Magnific no está activa.</p>
            <p className="mt-1 text-xs text-ink/60">
              {!hasKey
                ? "Falta API key. "
                : "La integración está desactivada (master switch). "}
              <Link href="/admin/integrations/magnific" className="text-accent underline">
                Configurar ahora →
              </Link>
            </p>
          </div>
        )}

        <AssetStudio
          enabled={isEnabled && hasKey}
          replicateEnabled={replicateEnabled}
          initialTasks={allTasks}
        />
      </div>
    </main>
  );
}
