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

  // Tareas recientes (últimas 30)
  const tasks = await prisma.magnificTask.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

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
              IA imágenes con Magnific: upscale, eliminar fondos, generar creatividades
              y expandir formato para redes. Tareas asíncronas se actualizan automáticamente.
            </p>
          </div>
          <Link
            href="/admin/integrations/magnific"
            className="rounded-full border border-line bg-bone px-4 py-1.5 text-xs hover:border-accent"
          >
            ⚙ Config Magnific
          </Link>
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

        <AssetStudio enabled={isEnabled && hasKey} initialTasks={tasks.map(t => ({
          id: t.id,
          type: t.type,
          status: t.status,
          inputUrl: t.inputUrl,
          outputUrl: t.outputUrl,
          previewUrl: t.previewUrl,
          prompt: t.prompt,
          error: t.error,
          createdAt: t.createdAt.toISOString(),
        }))} />
      </div>
    </main>
  );
}
