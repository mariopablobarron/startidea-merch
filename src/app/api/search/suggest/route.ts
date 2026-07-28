import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proxyImageUrl } from "@/lib/proxy-image";
import { notifyAdmins } from "@/lib/notify-admin";
import { getNotificationRules } from "@/lib/notification-rules";
import { publicRef } from "@/lib/internal-ref";
import { suggestProductsSafe } from "@/lib/search/meili";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Autocompletado del nav. Devuelve top productos por coincidencia de nombre + categorías.
 * GET /api/search/suggest?q=cami
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ products: [], categories: [] }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  // Antes de hacer la búsqueda, comprobar si hay alias admin para esta query.
  // Si existe → devolver redirectTo y dejar que el cliente navegue.
  const queryLower = q.toLowerCase();
  const alias = await prisma.searchAlias.findUnique({
    where: { queryLower },
    select: { redirectTo: true, active: true },
  });
  if (alias?.active && alias.redirectTo) {
    void prisma.searchAlias
      .update({
        where: { queryLower },
        data: { hitCount: { increment: 1 } },
      })
      .catch((e) =>
        console.error("[search-suggest] increment hitCount alias falló:", e instanceof Error ? e.message : e),
      );
    return NextResponse.json(
      { redirectTo: alias.redirectTo, products: [], categories: [] },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  }

  // Motor principal: Meilisearch (tolerancia a erratas + ranking). Si no está
  // disponible (null) caemos al contains de Prisma de siempre — la búsqueda
  // nunca se rompe por caerse el buscador.
  const [meiliHits, categories] = await Promise.all([
    suggestProductsSafe(q, 8),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      take: 5,
      select: { slug: true, name: true, level: true, parent: { select: { name: true } } },
    }),
  ]);

  const products =
    meiliHits !== null
      ? meiliHits.map((h) => ({
          slug: h.slug,
          name: h.name,
          ref: h.ref, // ya es la STM pública (ver buildProductSearchDocument)
          imageUrl: h.imageUrl, // ya proxificada al indexar
          category: h.categoryPath || null,
        }))
      : (
          await prisma.product.findMany({
            where: {
              active: true,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                // Búsqueda por NUESTRA ref (STM-XXXXXX), nunca por la del proveedor.
                { internalRef: { contains: q, mode: "insensitive" } },
              ],
            },
            orderBy: [{ name: "asc" }],
            take: 8,
            select: {
              id: true,
              slug: true,
              name: true,
              internalRef: true,
              primaryImageUrl: true,
              category: { select: { name: true } },
            },
          })
        ).map((p) => ({
          slug: p.slug,
          name: p.name,
          ref: publicRef(p), // NUNCA supplierRef en endpoint público
          imageUrl: proxyImageUrl(p.primaryImageUrl), // nunca URL cruda de proveedor
          category: p.category?.name ?? null,
        }));

  // Log query para detectar demanda no cubierta. Solo cuando la búsqueda
  // tiene 3+ caracteres (filtra ruido) y no se repite del MISMO IP en
  // <30s (filtra typeahead que dispara con cada tecla).
  if (q.length >= 3) {
    void (async () => {
      try {
        const xff = req.headers.get("x-forwarded-for");
        const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
        const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
        const queryLower = q.toLowerCase();
        const totalResults = products.length + categories.length;

        // Dedup: si el mismo IP buscó la misma query en últimos 30s, no logear.
        if (ip) {
          const recent = await prisma.searchQuery.findFirst({
            where: {
              ip,
              queryLower,
              createdAt: { gte: new Date(Date.now() - 30_000) },
            },
            select: { id: true },
          });
          if (recent) return;
        }

        await prisma.searchQuery.create({
          data: { query: q, queryLower, resultsCount: totalResults, ip, ua },
        });

        // Si esta query (sin resultados) acumula ≥threshold hits en últimas 24h
        // y no se ha notificado en 48h, dispara push admin "demanda no cubierta".
        // Threshold y enable configurables desde /admin/insights/notifications.
        if (totalResults === 0) {
          const rules = await getNotificationRules();
          const rule = rules.search_no_results;
          if (!rule.enabled) return;
          const threshold = rule.threshold ?? 5;
          const hitsLast24h = await prisma.searchQuery.count({
            where: {
              queryLower,
              resultsCount: 0,
              createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
            },
          });
          if (hitsLast24h >= threshold) {
            // Dedup con SearchAlias.description como marca: si no hay alias,
            // creamos uno inactivo como flag de "ya notificado en 48h".
            const flagKey = `_notified_${queryLower}`;
            const recent = await prisma.searchAlias.findUnique({
              where: { queryLower: flagKey },
              select: { updatedAt: true },
            });
            const notifiedRecently =
              recent && Date.now() - recent.updatedAt.getTime() < 48 * 3600_000;
            if (!notifiedRecently) {
              await prisma.searchAlias.upsert({
                where: { queryLower: flagKey },
                create: {
                  queryLower: flagKey,
                  redirectTo: "/admin/insights#busquedas",
                  description: `Notificación enviada por demanda sin cubrir`,
                  active: false,
                },
                update: { updatedAt: new Date() },
              });
              void notifyAdmins(
                {
                  title: `💎 Demanda no cubierta: «${q}»`,
                  body: `${hitsLast24h} búsquedas en 24h y 0 resultados`,
                  url: "/admin/insights#busquedas",
                  tag: `search-${queryLower}`,
                },
                { event: "search_no_results" },
              ).catch((e) =>
                console.error("[search-suggest] notifyAdmins demanda no cubierta falló:", e instanceof Error ? e.message : e),
              );
            }
          }
        }
      } catch (e) {
        // Silencioso, no bloquea la búsqueda
        console.error("[search-suggest] log de búsqueda falló:", e instanceof Error ? e.message : e);
      }
    })();
  }

  return NextResponse.json(
    {
      products,
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        path: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
