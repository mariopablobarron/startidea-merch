import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/admin-auth";
import {
  assertExpectedCifraHtmlSlugPlan,
  buildCifraHtmlSlugPlan,
  CIFRA_HTML_SLUG_MIGRATION_KEY,
  EXPECTED_CIFRA_HTML_OLD_SLUGS,
  type CifraHtmlSlugPlanItem,
} from "@/lib/cifra-html-slug-migration";
import { acquireCronLockLease, releaseCronLockLease } from "@/lib/cron-lock";
import { prisma } from "@/lib/prisma";
import { meiliEnabled, reindexAllProducts } from "@/lib/search/meili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOCK_KEY = "supplier-sync:cifra";

type SlugPlanDb = Pick<Prisma.TransactionClient, "product" | "productSlugRedirect">;

type MigrationManifest = {
  runId: string;
  status: "DB_APPLIED" | "COMPLETED" | "COMPLETED_WITH_WARNINGS";
  appliedBy: string;
  appliedAt: string;
  completedAt?: string;
  items: CifraHtmlSlugPlanItem[];
  cacheInvalidated?: boolean;
  searchIndex?: "disabled" | "reindexed" | "failed";
  indexedProducts?: number;
  warnings?: string[];
  referenceUpdates: CanonicalReferenceUpdates;
};

type CanonicalReferenceUpdate = { id: string; oldSlug: string; newSlug: string };
type CanonicalReferenceUpdates = {
  analyticsEvents: CanonicalReferenceUpdate[];
  cartQuoteItems: CanonicalReferenceUpdate[];
  orderProofs: CanonicalReferenceUpdate[];
  contentPieces: CanonicalReferenceUpdate[];
  portfolioItems: CanonicalReferenceUpdate[];
};

async function migrateCanonicalSlugReferences(
  tx: Prisma.TransactionClient,
  plan: ReadonlyArray<CifraHtmlSlugPlanItem>,
): Promise<CanonicalReferenceUpdates> {
  const updates: CanonicalReferenceUpdates = {
    analyticsEvents: [],
    cartQuoteItems: [],
    orderProofs: [],
    contentPieces: [],
    portfolioItems: [],
  };

  for (const item of plan) {
    const [analytics, cartItems, proofs, content, portfolio] = await Promise.all([
      tx.analyticsEvent.updateManyAndReturn({
        where: { productSlug: item.oldSlug },
        data: { productSlug: item.newSlug },
        select: { id: true },
      }),
      tx.cartQuoteItem.updateManyAndReturn({
        where: { productSlug: item.oldSlug },
        data: { productSlug: item.newSlug },
        select: { id: true },
      }),
      tx.orderProof.updateManyAndReturn({
        where: { productSlug: item.oldSlug },
        data: { productSlug: item.newSlug },
        select: { id: true },
      }),
      tx.contentPiece.updateManyAndReturn({
        where: { productSlug: item.oldSlug },
        data: { productSlug: item.newSlug },
        select: { id: true },
      }),
      tx.portfolioItem.updateManyAndReturn({
        where: { productSlug: item.oldSlug },
        data: { productSlug: item.newSlug },
        select: { id: true },
      }),
    ]);
    const entry = (id: string): CanonicalReferenceUpdate => ({
      id,
      oldSlug: item.oldSlug,
      newSlug: item.newSlug,
    });
    updates.analyticsEvents.push(...analytics.map((row) => entry(row.id)));
    updates.cartQuoteItems.push(...cartItems.map((row) => entry(row.id)));
    updates.orderProofs.push(...proofs.map((row) => entry(row.id)));
    updates.contentPieces.push(...content.map((row) => entry(row.id)));
    updates.portfolioItems.push(...portfolio.map((row) => entry(row.id)));
  }
  return updates;
}

async function loadPlan(db: SlugPlanDb): Promise<CifraHtmlSlugPlanItem[]> {
  const [products, redirects] = await Promise.all([
    db.product.findMany({
      orderBy: [{ supplierRef: "asc" }, { id: "asc" }],
      select: {
        id: true,
        supplier: true,
        supplierRef: true,
        internalRef: true,
        active: true,
        name: true,
        slug: true,
      },
    }),
    db.productSlugRedirect.findMany({ select: { oldSlug: true } }),
  ]);
  return buildCifraHtmlSlugPlan(products, redirects.map((redirect) => redirect.oldSlug));
}

function inventoryProblem(plan: ReadonlyArray<CifraHtmlSlugPlanItem>): string | null {
  try {
    assertExpectedCifraHtmlSlugPlan(plan);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function parseManifest(value: unknown): MigrationManifest {
  if (!value || typeof value !== "object") throw new Error("Manifest de migración inválido");
  const manifest = value as Partial<MigrationManifest>;
  if (
    typeof manifest.runId !== "string" ||
    typeof manifest.appliedBy !== "string" ||
    !Array.isArray(manifest.items) ||
    manifest.items.length !== EXPECTED_CIFRA_HTML_OLD_SLUGS.length ||
    !manifest.referenceUpdates ||
    !["DB_APPLIED", "COMPLETED", "COMPLETED_WITH_WARNINGS"].includes(manifest.status ?? "")
  ) {
    throw new Error("Manifest de migración inválido");
  }
  assertExpectedCifraHtmlSlugPlan(manifest.items);
  return manifest as MigrationManifest;
}

async function assertAppliedState(
  tx: Prisma.TransactionClient,
  manifest: MigrationManifest,
): Promise<void> {
  for (const item of manifest.items) {
    const [product, redirect] = await Promise.all([
      tx.product.findUnique({ where: { id: item.productId }, select: { slug: true } }),
      tx.productSlugRedirect.findUnique({
        where: { oldSlug: item.oldSlug },
        select: { productId: true },
      }),
    ]);
    if (product?.slug !== item.newSlug || redirect?.productId !== item.productId) {
      throw new Error(`Manifest no coincide con el estado aplicado para ${item.oldSlug}`);
    }
  }
}

async function applyTransaction(appliedBy: string): Promise<{
  manifest: MigrationManifest;
  alreadyApplied: boolean;
}> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Replanificar DENTRO de la transacción: un dry-run antiguo nunca es
          // autoridad para escribir si el catálogo cambió entretanto.
          const plan = await loadPlan(tx);
          assertExpectedCifraHtmlSlugPlan(plan);
          const previousRun = await tx.adminSetting.findUnique({
            where: { key: CIFRA_HTML_SLUG_MIGRATION_KEY },
            select: { value: true },
          });
          if (plan.length === 0) {
            if (!previousRun) {
              throw new Error(
                "Inventario sin candidatos y sin manifest; estado no auditable, revisión manual obligatoria",
              );
            }
            const manifest = parseManifest(previousRun.value);
            await assertAppliedState(tx, manifest);
            return { manifest, alreadyApplied: true };
          }
          if (previousRun) {
            throw new Error("Existe un manifest previo pero aún quedan candidatos; revisión manual obligatoria");
          }

          for (const item of plan) {
            const [currentProduct, oldRedirect, targetRedirect, targetProduct] = await Promise.all([
              tx.product.findUnique({
                where: { id: item.productId },
                select: { slug: true, supplier: true, active: true },
              }),
              tx.productSlugRedirect.findUnique({
                where: { oldSlug: item.oldSlug },
                select: { productId: true },
              }),
              tx.productSlugRedirect.findUnique({
                where: { oldSlug: item.newSlug },
                select: { productId: true },
              }),
              tx.product.findUnique({
                where: { slug: item.newSlug },
                select: { id: true },
              }),
            ]);

            if (
              !currentProduct ||
              currentProduct.slug !== item.oldSlug ||
              currentProduct.supplier !== "cifra" ||
              !currentProduct.active
            ) {
              throw new Error(`Plan obsoleto para ${item.productId}: el producto ya no coincide`);
            }
            if (oldRedirect) {
              throw new Error(`El slug histórico ${item.oldSlug} ya pertenece a un redirect`);
            }
            if (targetRedirect) {
              throw new Error(`El destino ${item.newSlug} está reservado como redirect histórico`);
            }
            if (targetProduct && targetProduct.id !== item.productId) {
              throw new Error(`El destino ${item.newSlug} ya pertenece a otro producto`);
            }

            // Create-only: una URL histórica nunca cambia de propietario.
            await tx.productSlugRedirect.create({
              data: { oldSlug: item.oldSlug, productId: item.productId },
            });
            const updated = await tx.product.updateMany({
              where: { id: item.productId, slug: item.oldSlug },
              data: { slug: item.newSlug },
            });
            if (updated.count !== 1) {
              throw new Error(`No se pudo actualizar ${item.productId}; transacción revertida`);
            }
          }

          const referenceUpdates = await migrateCanonicalSlugReferences(tx, plan);

          const manifest: MigrationManifest = {
            runId: randomUUID(),
            status: "DB_APPLIED",
            appliedBy,
            appliedAt: new Date().toISOString(),
            items: plan,
            referenceUpdates,
          };
          await tx.adminSetting.create({
            data: {
              key: CIFRA_HTML_SLUG_MIGRATION_KEY,
              value: manifest as unknown as Prisma.InputJsonValue,
            },
          });
          return { manifest, alreadyApplied: false };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 120_000,
        },
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("No se pudo completar la transacción serializable");
}

async function finishPostCommit(manifest: MigrationManifest): Promise<MigrationManifest> {
  // Cierra la ventana de carrera con tráfico web: una fila pudo crearse con el
  // oldSlug mientras la transacción principal aún no era visible. Tras su
  // commit, los boundaries ya resuelven el redirect y guardan el canónico.
  const manifestWithReferences = await prisma.$transaction(
    async (tx) => {
      const lateReferenceUpdates = await migrateCanonicalSlugReferences(tx, manifest.items);
      const referenceUpdates = Object.fromEntries(
        Object.entries(manifest.referenceUpdates).map(([key, previous]) => {
          const late = lateReferenceUpdates[key as keyof CanonicalReferenceUpdates];
          const unique = new Map(
            [...previous, ...late].map((entry) => [`${entry.id}:${entry.oldSlug}`, entry]),
          );
          return [key, [...unique.values()]];
        }),
      ) as CanonicalReferenceUpdates;
      const reconciled = { ...manifest, referenceUpdates };
      await tx.adminSetting.update({
        where: { key: CIFRA_HTML_SLUG_MIGRATION_KEY },
        data: { value: reconciled as unknown as Prisma.InputJsonValue },
      });
      return reconciled;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  const warnings: string[] = [];
  let cacheInvalidated = false;
  let searchIndex: MigrationManifest["searchIndex"] = meiliEnabled() ? "failed" : "disabled";
  let indexedProducts: number | undefined;

  try {
    revalidatePath("/catalogo");
    revalidatePath("/sitemap.xml");
    for (const item of manifestWithReferences.items) {
      revalidatePath(`/catalogo/${item.oldSlug}`);
      revalidatePath(`/catalogo/${item.newSlug}`);
    }
    cacheInvalidated = true;
  } catch (error) {
    warnings.push(`cache: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (meiliEnabled()) {
    try {
      const result = await reindexAllProducts();
      indexedProducts = result.indexed;
      searchIndex = "reindexed";
    } catch (error) {
      warnings.push(`meili: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const { warnings: _previousWarnings, ...manifestWithoutWarnings } = manifestWithReferences;
  const completed: MigrationManifest = {
    ...manifestWithoutWarnings,
    status: warnings.length === 0 ? "COMPLETED" : "COMPLETED_WITH_WARNINGS",
    completedAt: new Date().toISOString(),
    cacheInvalidated,
    searchIndex,
    ...(indexedProducts === undefined ? {} : { indexedProducts }),
    ...(warnings.length === 0 ? {} : { warnings }),
  };
  await prisma.adminSetting.update({
    where: { key: CIFRA_HTML_SLUG_MIGRATION_KEY },
    data: { value: completed as unknown as Prisma.InputJsonValue },
  });
  return completed;
}

/** Dry-run autenticado. Nunca escribe ni toma el lock del sync. */
export async function GET(req: Request) {
  const auth = await requireRole(req, "OPERACIONES");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const [plan, previousRun] = await Promise.all([
    loadPlan(prisma),
    prisma.adminSetting.findUnique({
      where: { key: CIFRA_HTML_SLUG_MIGRATION_KEY },
      select: { value: true },
    }),
  ]);
  const problem = inventoryProblem(plan);
  return NextResponse.json({
    dryRun: true,
    expectedAffected: EXPECTED_CIFRA_HTML_OLD_SLUGS.length,
    affected: plan.length,
    safeToApply: problem === null && (plan.length > 0 || Boolean(previousRun)),
    problem,
    previousRun: previousRun?.value ?? null,
    preview: plan,
  });
}

/** Aplica los 17 cambios y destinos auditados bajo el mismo lock que el sync Cifra. */
export async function POST(req: Request) {
  const auth = await requireRole(req, "OPERACIONES");
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const lockToken = await acquireCronLockLease(LOCK_KEY, 45 * 60 * 1000);
  if (!lockToken) {
    return NextResponse.json(
      { ok: false, error: "Hay un sync Cifra o una migración en curso" },
      { status: 409 },
    );
  }

  try {
    const result = await applyTransaction(auth.session.email);
    if (result.alreadyApplied && result.manifest.status === "COMPLETED") {
      return NextResponse.json({
        ok: true,
        affected: 0,
        alreadyApplied: true,
        resumedPostCommit: false,
        manifest: result.manifest,
      });
    }
    const manifest = await finishPostCommit(result.manifest);
    return NextResponse.json({
      ok: manifest.status === "COMPLETED",
      affected: result.alreadyApplied ? 0 : manifest.items.length,
      alreadyApplied: result.alreadyApplied,
      resumedPostCommit: result.alreadyApplied,
      manifest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const conflict = /inventario|obsoleto|reservado|pertenece|manifest/i.test(message);
    return NextResponse.json({ ok: false, error: message }, { status: conflict ? 409 : 500 });
  } finally {
    await releaseCronLockLease(LOCK_KEY, lockToken);
  }
}
