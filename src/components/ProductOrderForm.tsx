"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { displayPositionId } from "@/lib/marking-position-display";
import {
  defaultTiersFromBase,
  formatMoney,
  orderTotalCents,
  pickTier,
  type PriceTier,
} from "@/lib/pricing";
import { addItem, type CartItemMarking } from "@/lib/cart-storage";
import { trackProductEvent } from "@/lib/track-client";
import { trackEvent } from "@/lib/track";
import { trackAddToCart } from "@/lib/ads-events";
import { spellConfetti } from "@/lib/spells/confetti";
import { AnimatedPrice } from "@/lib/spells/animated-price";
import { MarkingTechniqueTooltip } from "./MarkingTechniqueTooltip";
import { ExtraMarkingsPanel, type ExtraMarking } from "./ExtraMarkingsPanel";
import { useProductColor } from "./product-color-context";
import type { ColorOption } from "@/lib/variant-grouping";

/**
 * Formulario unificado de pedido en ficha de producto.
 * Reemplaza la antigua trilogía PriceTierTable + QuantityConfigurator +
 * MarkingCalculator que mostraba precios contradictorios y duplicaba lógica.
 *
 * Flujo:
 *   1. Selector de cantidad (radio cards con badges Popular / Mejor precio)
 *   2. Toggle "¿Personalizar con tu logo?" Sí/No
 *      - Si Sí: selector técnica + posición + colores + complejidad → llama
 *        /api/quote/calculate (precio real con marcaje)
 *      - Si No: usa tiers locales (precio base sin marcaje)
 *   3. Total estimado en grande + desglose unidad
 *   4. Botones: "Añadir al pedido" + "Configurar y cotizar"
 *
 * Una sola fuente de verdad de precios. Sin contradicciones entre módulos.
 */

type Position = {
  id: string;
  positionId: string;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  techniques: {
    techniqueId: string;
    techniqueCode: string;
    techniqueName: string;
    maxColors: number | null;
  }[];
};

type CalcResponse =
  | {
      ok: true;
      quantity: number;
      product: { priceSource: "provider" | "estimate" };
      marking: { techniqueName: string; warning?: string } | null;
      pricing: {
        unitClient: { cents: number; formatted: string };
        totalClient: { cents: number; formatted: string };
      };
      disclaimer: string;
    }
  | { error: string };

const QTYS = [10, 25, 50, 100, 250, 500];
const MANIPULATIONS = [
  { code: "Z", label: "Muy sencillo (1 color)" },
  { code: "A", label: "Sencillo (1-2 colores)" },
  { code: "B", label: "Medio (3+ colores)" },
  { code: "C", label: "Complejo (degradados)" },
];

export function ProductOrderForm({
  productSlug,
  productRef,
  productName,
  primaryImageUrl,
  tiers,
  baseCentsForEstimate,
  orderFixedPromo,
  positions,
  colorOptions,
}: {
  productSlug: string;
  productRef: string;
  productName: string;
  primaryImageUrl?: string | null;
  tiers?: PriceTier[];
  baseCentsForEstimate?: number;
  // Descuento FIXED a nivel de PEDIDO (se resta UNA vez del subtotal, no por
  // unidad). PERCENT no llega aquí: ya va horneado en el precio de cada tier.
  orderFixedPromo?: {
    value: number;
    name: string;
    badgeText: string | null;
    badgeColor: string | null;
  } | null;
  positions: Position[];
  /** Colores+tallas del producto (para el pedido multi-talla). */
  colorOptions?: ColorOption[];
}) {
  // Variante de color elegida en la galería (Context compartido con la ficha)
  const { selected: selectedColor } = useProductColor();

  // Fuente única de tramos locales (para el modo SIN marcaje)
  const localTiers: PriceTier[] = useMemo(() => {
    if (tiers && tiers.length > 0) return tiers;
    return baseCentsForEstimate ? defaultTiersFromBase(baseCentsForEstimate) : [];
  }, [tiers, baseCentsForEstimate]);

  // Memoizado a propósito: este array alimenta las dependencias del efecto de
  // cálculo. Sin useMemo se recreaba en CADA render, el efecto se re-disparaba
  // aunque no hubiera cambiado nada y el precio parpadeaba sin parar.
  const positionsAvailable = useMemo(
    () => positions.filter((p) => p.techniques.length > 0),
    [positions],
  );
  const canMark = positionsAvailable.length > 0;

  // Estado
  const [qty, setQty] = useState<number>(25);
  const [customQty, setCustomQty] = useState<string>("");
  const usingCustom = customQty.trim() !== "";

  // ── Pedido MULTI-TALLA (matriz talla×cantidad, textil B2B) ──
  // El precio unitario se decide por la TIRADA TOTAL: 100 uds repartidas
  // S/M/L/XL pagan el tramo de 100, no 4× el tramo de 25. Por eso la suma de
  // la matriz se convierte en finalQty y TODO el cálculo existente (tramos,
  // marcaje vía API, promos) funciona sin cambios.
  const activeColorOpt = useMemo(() => {
    if (!colorOptions || colorOptions.length === 0) return undefined;
    if (colorOptions.length === 1) return colorOptions[0];
    return colorOptions.find((o) => o.colorName === selectedColor?.colorName);
  }, [colorOptions, selectedColor?.colorName]);
  const matrixSizes = activeColorOpt?.sizes ?? [];
  const canMultiSize = matrixSizes.length > 1;
  const [multiSize, setMultiSize] = useState(false);
  const [sizesQty, setSizesQty] = useState<Record<string, number>>({});
  // Cambiar de color reinicia la matriz (los SKUs por talla son otros)
  useEffect(() => {
    setSizesQty({});
  }, [activeColorOpt?.key]);
  const matrixTotal = Object.values(sizesQty).reduce((s, n) => s + (n || 0), 0);
  const matrixActive = multiSize && canMultiSize && !!activeColorOpt;

  const finalQty = matrixActive
    ? Math.max(1, matrixTotal)
    : usingCustom
      ? Math.max(1, parseInt(customQty, 10) || 0)
      : qty;

  const [withMarking, setWithMarking] = useState<boolean>(canMark);
  const [positionIdx, setPositionIdx] = useState(0);
  const [techIdx, setTechIdx] = useState(0);
  const [colours, setColours] = useState(1);
  const [manipulation, setManipulation] = useState("A");
  // Marcas extra (textil con pecho + manga + espalda)
  const [extraMarkings, setExtraMarkings] = useState<ExtraMarking[]>([]);

  // Logo cliente
  const [logo, setLogo] = useState<{ url: string; filename: string; size: number } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  const [mockupLoading, setMockupLoading] = useState(false);

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/uploads/customer-logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setLogoError(data.error || "Error subiendo");
        return;
      }
      setLogo({ url: data.url, filename: data.filename, size: data.size });
      // Generar mockup automáticamente con el logo subido
      if (withMarking && position) {
        setMockupLoading(true);
        const fd2 = new FormData();
        fd2.append("logo", file);
        fd2.append("productSlug", productSlug);
        fd2.append("positionId", position.positionId);
        const mockRes = await fetch("/api/mockup/generate", { method: "POST", body: fd2 });
        if (mockRes.ok) {
          const blob = await mockRes.blob();
          if (mockupUrl) URL.revokeObjectURL(mockupUrl);
          setMockupUrl(URL.createObjectURL(blob));
        }
        setMockupLoading(false);
      }
    } finally {
      setLogoUploading(false);
    }
  }

  function clearLogo() {
    setLogo(null);
    if (mockupUrl) URL.revokeObjectURL(mockupUrl);
    setMockupUrl(null);
    setLogoError(null);
  }

  const position = positionsAvailable[positionIdx];
  const technique = position?.techniques[techIdx];
  const maxColors = technique?.maxColors ?? 1;
  const printAreaCm2 = useMemo(() => {
    if (!position?.maxWidthMm || !position?.maxHeightMm) return undefined;
    return (position.maxWidthMm / 10) * (position.maxHeightMm / 10);
  }, [position]);

  // Cálculo con API (solo si marcaje ON)
  const [calc, setCalc] = useState<CalcResponse | null>(null);
  const [loadingCalc, setLoadingCalc] = useState(false);

  useEffect(() => {
    if (!withMarking || !position || !technique) {
      setCalc(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingCalc(true);
      try {
        // Construir array de marcas: primera (principal) + extras
        const markingsPayload = [
          {
            positionId: position.positionId,
            techniqueCode: technique.techniqueCode,
            numberOfColours: Math.min(colours, maxColors),
            printAreaCm2,
            manipulationCode: manipulation,
          },
          ...extraMarkings
            .map((em) => {
              const p = positionsAvailable[em.positionIdx];
              const t = p?.techniques[em.techIdx];
              if (!p || !t) return null;
              const areaCm2 = p.maxWidthMm && p.maxHeightMm
                ? (p.maxWidthMm / 10) * (p.maxHeightMm / 10)
                : undefined;
              return {
                positionId: p.positionId,
                techniqueCode: t.techniqueCode,
                numberOfColours: Math.min(em.colours, t.maxColors ?? 1),
                printAreaCm2: areaCm2,
              };
            })
            .filter(Boolean),
        ];
        const res = await fetch("/api/quote/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productSlug,
            quantity: finalQty,
            markings: markingsPayload,
          }),
          signal: ctrl.signal,
        });
        const data: CalcResponse = await res.json();
        setCalc(data);
      } catch (e) {
        // Petición abortada por una más reciente: no es un error, y sobre todo
        // NO debe apagar el indicador de carga ni pisar el precio con un
        // resultado viejo (dos respuestas fuera de orden hacían saltar la cifra).
        if ((e as Error)?.name === "AbortError") return;
      } finally {
        if (!ctrl.signal.aborted) setLoadingCalc(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // Dependencias por IDENTIFICADOR, no por objeto: `position` y `technique`
    // se derivan de positionsAvailable en cada render, así que incluirlos
    // re-disparaba el efecto constantemente. Sus valores relevantes ya están
    // aquí como primitivas. El lint pide los objetos: NO se los damos a
    // propósito — devolverlos reintroduce el parpadeo del precio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    withMarking,
    productSlug,
    finalQty,
    position?.positionId,
    technique?.techniqueCode,
    colours,
    manipulation,
    printAreaCm2,
    maxColors,
    extraMarkings,
    positionsAvailable,
  ]);

  // Precio calculado
  const localTier = pickTier(localTiers, finalQty);
  const apiOk = calc && "ok" in calc && calc.ok;

  // Subtotal sin marcaje = precio unitario (con PERCENT ya horneado) × cantidad.
  // El FIXED de pedido se aplica UNA sola vez sobre ese subtotal (orderTotalCents),
  // nunca por unidad → un "−5€" descuenta 5€ del pedido, no 5€ × cantidad.
  const lineSubtotalCents = localTier ? localTier.unitPriceCents * finalQty : null;
  const unitCents = withMarking
    ? apiOk
      ? calc.pricing.unitClient.cents
      : null
    : localTier?.unitPriceCents ?? null;
  const totalCents = withMarking
    ? apiOk
      ? calc.pricing.totalClient.cents
      : null
    : lineSubtotalCents != null
      ? orderTotalCents(lineSubtotalCents, orderFixedPromo)
      : null;

  // Feedback "añadido al carrito"
  const [addedAt, setAddedAt] = useState<number | null>(null);

  // Solicitud de presupuesto formal por email (crea un BORRADOR de propuesta
  // que el admin revisa y envía con 1 clic). Vía pública desde la ficha.
  const [showQuoteReq, setShowQuoteReq] = useState(false);
  const [qrEmail, setQrEmail] = useState("");
  const [qrName, setQrName] = useState("");
  const [qrState, setQrState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [qrError, setQrError] = useState<string | null>(null);

  // Mobile sticky CTA: visible cuando los botones primarios salen de viewport.
  // La ficha de producto en mobile tiene ~7.500 px de scroll y obliga a Marina
  // a hacer scroll-up para encontrar "Añadir al pedido". El sticky resuelve
  // ese punto de fricción detectado en el audit Marina.
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [actionsInView, setActionsInView] = useState(true);
  useEffect(() => {
    const el = actionsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setActionsInView(entry.isIntersecting),
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!addedAt) return;
    const t = setTimeout(() => setAddedAt(null), 2500);
    return () => clearTimeout(t);
  }, [addedAt]);
  const recentlyAdded = addedAt != null && Date.now() - addedAt < 2500;

  function onAddToCart(e?: React.MouseEvent<HTMLButtonElement>) {
    // Multi-talla sin cantidades: nada que añadir
    if (matrixActive && matrixTotal <= 0) return;

    // Spell A1 — confetti desde el botón pulsado (desktop o sticky mobile)
    const btn = e?.currentTarget;
    if (btn instanceof HTMLElement) spellConfetti(btn, { count: 70 });

    trackEvent({
      type: "addToCart",
      productSlug,
      payload: {
        qty: finalQty,
        technique: withMarking ? technique?.techniqueCode : null,
        totalCents,
      },
    });
    // Eventos ads (Meta + Google + LinkedIn)
    trackAddToCart({
      value: totalCents ? totalCents / 100 : undefined,
      currency: "EUR",
      contentId: productRef,
      contentName: productName,
    });
    // Construir array de marcas: primera + extras
    const allMarkings: CartItemMarking[] = withMarking && position && technique
      ? [
          {
            positionId: position.positionId,
            positionLabel: displayPositionId(position.positionId),
            techniqueCode: technique.techniqueCode,
            techniqueName: technique.techniqueName,
            numberOfColors: Math.min(colours, maxColors),
            manipulationCode: manipulation,
            // Área de la posición: el recálculo server-side del checkout la
            // necesita para elegir el MISMO tramo de tarifa que vio la ficha.
            printAreaCm2: printAreaCm2 ?? null,
          },
          ...extraMarkings
            .map<CartItemMarking | null>((em) => {
              const p = positionsAvailable[em.positionIdx];
              const t = p?.techniques[em.techIdx];
              if (!p || !t) return null;
              const areaCm2 = p.maxWidthMm && p.maxHeightMm
                ? (p.maxWidthMm / 10) * (p.maxHeightMm / 10)
                : null;
              return {
                positionId: p.positionId,
                positionLabel: displayPositionId(p.positionId),
                techniqueCode: t.techniqueCode,
                techniqueName: t.techniqueName,
                numberOfColors: Math.min(em.colours, t.maxColors ?? 1),
                printAreaCm2: areaCm2,
              };
            })
            .filter((m): m is CartItemMarking => m !== null),
        ]
      : [];

    // Multi-talla: una línea de carrito POR TALLA, todas al precio unitario
    // del tramo de la tirada total (unitCents ya se calculó con finalQty=suma).
    if (matrixActive && activeColorOpt) {
      for (const s of matrixSizes) {
        const q = sizesQty[s.sku] ?? 0;
        if (q <= 0) continue;
        addItem({
          productSlug,
          productRef,
          productName,
          primaryImageUrl: activeColorOpt.imageUrl ?? primaryImageUrl,
          variantSku: s.sku,
          colorName: activeColorOpt.colorName,
          size: s.size,
          quantity: q,
          markingTechniqueCode: allMarkings[0]?.techniqueCode ?? null,
          markingTechniqueName: allMarkings[0]?.techniqueName ?? null,
          markingPositionId: allMarkings[0]?.positionId ?? null,
          markingColours: allMarkings[0]?.numberOfColors ?? null,
          markingComplexity: withMarking ? manipulation : null,
          markings: allMarkings.length > 0 ? allMarkings : undefined,
          unitPriceClientCents: unitCents,
          totalClientCents: unitCents != null ? unitCents * q : null,
          customerLogoUrl: withMarking ? logo?.url ?? null : null,
          customerLogoFilename: withMarking ? logo?.filename ?? null : null,
          customerLogoSize: withMarking ? logo?.size ?? null : null,
        });
      }
      trackProductEvent({ slug: productSlug }, "cart_add");
      setAddedAt(Date.now());
      return;
    }

    addItem({
      productSlug,
      productRef,
      productName,
      // Si el cliente eligió una variante de color, usamos su imagen y datos
      primaryImageUrl: selectedColor?.imageUrl ?? primaryImageUrl,
      variantSku: selectedColor?.sku ?? null,
      colorName: selectedColor?.colorName ?? null,
      size: selectedColor?.size ?? null,
      quantity: finalQty,
      // Shape plano (compatibilidad): primer marcaje
      markingTechniqueCode: allMarkings[0]?.techniqueCode ?? null,
      markingTechniqueName: allMarkings[0]?.techniqueName ?? null,
      markingPositionId: allMarkings[0]?.positionId ?? null,
      markingColours: allMarkings[0]?.numberOfColors ?? null,
      markingComplexity: withMarking ? manipulation : null,
      // Nuevo array completo
      markings: allMarkings.length > 0 ? allMarkings : undefined,
      unitPriceClientCents: unitCents,
      totalClientCents: totalCents,
      customerLogoUrl: withMarking ? logo?.url ?? null : null,
      customerLogoFilename: withMarking ? logo?.filename ?? null : null,
      customerLogoSize: withMarking ? logo?.size ?? null : null,
    });
    // Tracking: incrementa cartAddCount en ProductView (fire-and-forget)
    trackProductEvent({ slug: productSlug }, "cart_add");
    setAddedAt(Date.now());
  }

  function onCotizar() {
    const markingTxt =
      withMarking && technique && position
        ? ` · ${technique.techniqueName} en ${displayPositionId(position.positionId)}${
            colours > 1 ? ` · ${colours} colores` : ""
          }`
        : " · sin marcaje";
    const colorTxt =
      matrixActive && activeColorOpt
        ? ` · ${activeColorOpt.colorName ?? ""} tallas ${matrixSizes
            .filter((s) => (sizesQty[s.sku] ?? 0) > 0)
            .map((s) => `${s.size}:${sizesQty[s.sku]}`)
            .join(" ")}`
        : selectedColor?.colorName
          ? ` · ${selectedColor.colorName}${selectedColor.size ? ` talla ${selectedColor.size}` : ""}`
          : "";
    const detail = `${productName} (ref. ${productRef}) · ${finalQty} uds${colorTxt}${markingTxt}`;
    try {
      sessionStorage.setItem("merch:prefill", detail);
      sessionStorage.setItem("merch:prefill-ref", productRef);
      sessionStorage.setItem("merch:prefill-slug", productSlug);
      sessionStorage.setItem("merch:prefill-qty", String(finalQty));
    } catch {}
    window.location.href = "/#cotizar";
  }

  async function submitQuoteRequest() {
    if (!qrEmail.trim()) return;
    setQrState("sending");
    setQrError(null);
    try {
      const res = await fetch("/api/quote-request-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: productSlug,
          qty: finalQty,
          email: qrEmail.trim(),
          name: qrName.trim() || undefined,
          ...(withMarking && technique
            ? {
                techniqueCode: technique.techniqueCode,
                numberOfColours: Math.min(colours, maxColors),
                printAreaCm2,
                manipulationCode: manipulation,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setQrError(data.error || "No se pudo enviar. Inténtalo de nuevo.");
        setQrState("error");
        return;
      }
      setQrState("sent");
    } catch {
      setQrError("Error de red");
      setQrState("error");
    }
  }

  return (
    <div className="mt-6 rounded-3xl border border-line bg-bone p-5 lg:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
        Pedir cotización
      </p>
      <h2 className="mt-1 font-display text-xl font-semibold text-ink">
        Configura tu pedido
      </h2>

      {/* 1. Cantidad */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
          ① Cantidad
        </p>

        {/* Toggle multi-talla: solo en textil con talla y color activo */}
        {canMultiSize && activeColorOpt && (
          <button
            type="button"
            onClick={() => setMultiSize((v) => !v)}
            aria-pressed={multiSize}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              multiSize
                ? "border-accent bg-accent/5 text-accent"
                : "border-line bg-bone-soft text-ink/70 hover:border-accent/50"
            }`}
          >
            {multiSize ? "✓" : "▦"} Repartir por tallas
            {activeColorOpt.colorName ? ` · ${activeColorOpt.colorName}` : ""}
          </button>
        )}

        {/* Matriz talla×cantidad (sustituye a los presets cuando está activa) */}
        {matrixActive && activeColorOpt && (
          <div className="mt-2 rounded-xl border border-line bg-bone-soft p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(() => {
                const colorHasStock = matrixSizes.some((s) => s.stockQty > 0);
                return matrixSizes.map((s) => {
                  const outOfStock = colorHasStock && s.stockQty <= 0;
                  return (
                    <label
                      key={s.sku}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                        outOfStock ? "border-line/60 opacity-40" : "border-line bg-bone"
                      }`}
                      title={outOfStock ? "Sin stock en esta talla" : undefined}
                    >
                      <span
                        className={`font-semibold ${
                          outOfStock ? "text-ink/40 line-through" : "text-ink"
                        }`}
                      >
                        {s.size}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1_000_000}
                        disabled={outOfStock}
                        placeholder="0"
                        value={sizesQty[s.sku] || ""}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setSizesQty((prev) => ({
                            ...prev,
                            [s.sku]: Number.isFinite(n) && n > 0 ? n : 0,
                          }));
                        }}
                        className="w-20 rounded-lg border border-line bg-bone-soft px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
                      />
                    </label>
                  );
                });
              })()}
            </div>
            <p className="mt-3 flex items-center justify-between text-xs text-ink/60">
              <span>
                Total: <strong className="tabular-nums text-ink">{matrixTotal}</strong> uds
              </span>
              <span>
                {matrixTotal > 0
                  ? `precio unitario del tramo de ${matrixTotal} uds`
                  : "pon cantidades por talla"}
              </span>
            </p>
          </div>
        )}

        {!matrixActive && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {QTYS.map((q) => {
            const t = pickTier(localTiers, q);
            if (!t) return null;
            const checked = !usingCustom && qty === q;
            return (
              <li key={q}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomQty("");
                    setQty(q);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    checked
                      ? "border-accent bg-accent/5"
                      : "border-line bg-bone-soft hover:border-accent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio checked={checked} />
                    <span className="font-medium text-ink">{q} uds</span>
                    {t.badge === "POPULAR" && (
                      <Badge color="accent">Popular</Badge>
                    )}
                    {t.badge === "MAS_ECONOMICO" && (
                      <Badge color="social">Mejor precio</Badge>
                    )}
                  </span>
                  <span className="text-xs font-medium tabular-nums text-ink/60">
                    {formatMoney(t.unitPriceCents).formatted}
                    <span className="text-[10px] text-ink/40">/ud</span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="sm:col-span-2">
            <label
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                usingCustom
                  ? "border-accent bg-accent/5"
                  : "border-line bg-bone-soft hover:border-accent"
              }`}
            >
              <span className="flex items-center gap-2">
                <Radio checked={usingCustom} />
                <span className="font-medium text-ink">Otra cantidad</span>
              </span>
              <input
                type="number"
                min={1}
                max={1_000_000}
                placeholder="ej. 175"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                className="w-28 rounded-lg border border-line bg-bone px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-accent"
              />
            </label>
          </li>
        </ul>
        )}
      </div>

      {/* 2. Toggle marcaje */}
      {canMark && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            ② ¿Personalizar con tu logo?
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWithMarking(true)}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                withMarking
                  ? "border-accent bg-accent text-bone shadow"
                  : "border-line bg-bone-soft text-ink/70 hover:border-accent"
              }`}
            >
              <span className="block font-semibold">Sí, con marcaje</span>
              <span className="block text-[11px] opacity-80">
                Logo aplicado, técnica que elijas
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWithMarking(false)}
              className={`rounded-xl border px-4 py-2.5 text-sm transition ${
                !withMarking
                  ? "border-ink bg-ink text-bone shadow"
                  : "border-line bg-bone-soft text-ink/70 hover:border-accent"
              }`}
            >
              <span className="block font-semibold">No, solo producto</span>
              <span className="block text-[11px] opacity-80">
                Producto base sin personalizar
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Opciones de marcaje (si SI) */}
      {canMark && withMarking && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-bone-soft p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink/50">
            Opciones de marcaje
          </p>
          {/* Elegir marcaje era cuatro desplegables anidados: había que abrir cada
              uno para saber qué había dentro, y en móvil cada uno lanza el picker
              nativo. Medido sobre el catálogo: el 43% de los productos tiene UNA
              sola zona (un desplegable de una única opción) y el 97% tiene 6
              técnicas o menos, así que casi siempre caben a la vista. Se muestran
              como opciones visibles y solo se degrada a <select> cuando de verdad
              hay demasiadas. */}
          <div className="grid gap-4">
            {/* ── Zona ── */}
            {positionsAvailable.length === 1 ? (
              <p className="text-xs text-ink/60">
                Se marca en{" "}
                <strong className="font-semibold text-ink">
                  {displayPositionId(positionsAvailable[0].positionId)}
                </strong>
                {positionsAvailable[0].maxWidthMm && positionsAvailable[0].maxHeightMm
                  ? ` · área máxima ${positionsAvailable[0].maxWidthMm}×${positionsAvailable[0].maxHeightMm} mm`
                  : ""}
              </p>
            ) : positionsAvailable.length <= 5 ? (
              <OptionGroup label="Zona del marcaje">
                {positionsAvailable.map((p, i) => (
                  <ChoiceChip
                    key={p.id}
                    selected={i === positionIdx}
                    onClick={() => {
                      setPositionIdx(i);
                      setTechIdx(0);
                    }}
                    sub={
                      p.maxWidthMm && p.maxHeightMm
                        ? `${p.maxWidthMm}×${p.maxHeightMm} mm`
                        : undefined
                    }
                  >
                    {displayPositionId(p.positionId)}
                  </ChoiceChip>
                ))}
              </OptionGroup>
            ) : (
              <Field label="Zona del marcaje">
                <select
                  value={positionIdx}
                  onChange={(e) => {
                    setPositionIdx(parseInt(e.target.value, 10));
                    setTechIdx(0);
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-line bg-bone px-2.5 text-sm outline-none focus:border-accent"
                >
                  {positionsAvailable.map((p, i) => (
                    <option key={p.id} value={i}>
                      {displayPositionId(p.positionId)}
                      {p.maxWidthMm && p.maxHeightMm
                        ? ` · ${p.maxWidthMm}×${p.maxHeightMm}mm`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* ── Técnica ── */}
            {(position?.techniques.length ?? 0) > 1 &&
              ((position?.techniques.length ?? 0) <= 6 ? (
                <OptionGroup
                  label="Técnica"
                  hint={technique && <MarkingTechniqueTooltip name={technique.techniqueName} />}
                >
                  {position?.techniques.map((t, i) => (
                    <ChoiceChip
                      key={t.techniqueId}
                      selected={i === techIdx}
                      onClick={() => setTechIdx(i)}
                    >
                      {t.techniqueName}
                    </ChoiceChip>
                  ))}
                </OptionGroup>
              ) : (
                <Field
                  label="Técnica"
                  hint={technique && <MarkingTechniqueTooltip name={technique.techniqueName} />}
                >
                  <select
                    value={techIdx}
                    onChange={(e) => setTechIdx(parseInt(e.target.value, 10))}
                    className="min-h-[44px] w-full rounded-lg border border-line bg-bone px-2.5 text-sm outline-none focus:border-accent"
                  >
                    {position?.techniques.map((t, i) => (
                      <option key={t.techniqueId} value={i}>
                        {t.techniqueName}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            {position?.techniques.length === 1 && technique && (
              <p className="text-xs text-ink/60">
                Técnica: <strong className="font-semibold text-ink">{technique.techniqueName}</strong>{" "}
                <MarkingTechniqueTooltip name={technique.techniqueName} />
              </p>
            )}

            {/* ── Nº de tintas ── */}
            {maxColors > 1 ? (
              <OptionGroup label={`Nº de tintas del logo · máx. ${maxColors}`}>
                {Array.from({ length: maxColors }, (_, i) => i + 1).map((n) => (
                  <ChoiceChip key={n} selected={n === colours} onClick={() => setColours(n)} compact>
                    {n}
                  </ChoiceChip>
                ))}
              </OptionGroup>
            ) : (
              <p className="text-xs text-ink/60">
                Esta técnica se aplica a <strong className="font-semibold text-ink">1 tinta</strong>.
              </p>
            )}

            {/* ── Complejidad ── */}
            <OptionGroup label="Complejidad del arte">
              {MANIPULATIONS.map((m) => (
                <ChoiceChip
                  key={m.code}
                  selected={m.code === manipulation}
                  onClick={() => setManipulation(m.code)}
                >
                  {m.label}
                </ChoiceChip>
              ))}
            </OptionGroup>
            <p className="-mt-2 text-[11px] text-ink/45">
              Se refiere al detalle del dibujo que nos envíes, no a las tintas que has elegido
              arriba. Si dudas, déjalo como está: lo ajustamos al revisar tu logo.
            </p>
          </div>
          {calc && "error" in calc && (
            <p className="text-[11px] text-accent-deep">⚠ {calc.error}</p>
          )}
          {apiOk && calc.marking?.warning && (
            <p className="text-[11px] text-accent-deep">⚠ {calc.marking.warning}</p>
          )}

          {/* Multi-marca: textil con pecho + manga + espalda */}
          <ExtraMarkingsPanel
            positionsAvailable={positionsAvailable}
            extraMarkings={extraMarkings}
            onChange={setExtraMarkings}
          />

          {/* Upload logo + mockup preview */}
          <div className="mt-3 rounded-xl border border-accent/20 bg-accent-wash/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-accent-deep">
                  Tu logo
                </p>
                <p className="mt-0.5 text-[11px] text-ink/60">
                  Lo necesitamos para preparar el mockup oficial.
                </p>
              </div>
              {logo && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="text-[10px] text-ink/50 hover:text-accent"
                >
                  Quitar
                </button>
              )}
            </div>

            {!logo ? (
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent/30 bg-bone px-3 py-3 text-center transition hover:border-accent">
                <svg className="h-5 w-5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-xs font-medium text-ink">
                  {logoUploading ? "Subiendo…" : "Subir logo (PNG, JPG, SVG, PDF)"}
                </span>
                <span className="text-[10px] text-ink/50">Máx 5 MB · fondo transparente recomendado</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
                  onChange={onLogoChange}
                  disabled={logoUploading}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-bone p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo.url}
                    alt={logo.filename}
                    className="h-10 w-10 flex-shrink-0 rounded object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{logo.filename}</p>
                    <p className="text-[10px] text-ink/50">
                      {(logo.size / 1024).toFixed(1)} KB · ✓ subido
                    </p>
                  </div>
                </div>
                {(mockupLoading || mockupUrl) && (
                  <div className="rounded-lg bg-bone p-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-ink/50">
                      Mockup preview
                    </p>
                    {mockupLoading ? (
                      <p className="mt-1 text-center text-xs text-ink/50">Generando…</p>
                    ) : (
                      mockupUrl && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={mockupUrl}
                            alt="Mockup preview"
                            className="mt-1 w-full rounded"
                          />
                          <p className="mt-1 text-[10px] text-ink/40">
                            Mockup orientativo. El oficial te lo enviamos antes de producir.
                          </p>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {logoError && (
              <p className="mt-2 text-[11px] text-accent-deep">⚠ {logoError}</p>
            )}
          </div>
        </div>
      )}

      {/* 4. Total estimado */}
      <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">
            Total · {finalQty.toLocaleString("es-ES")} uds
            {withMarking ? " · con marcaje" : " · sin marcaje"}
          </p>
          {/* Mientras recalcula NO se borra la cifra: se atenúa. Sustituirla por
              "…" la hacía desaparecer y, al ser mucho más estrecho, además
              saltaba el ancho de la línea en cada recálculo. Solo se muestra el
              placeholder cuando todavía no hay ningún precio que enseñar. */}
          <p
            className={`mt-1 font-display text-3xl font-semibold tabular-nums text-ink transition-opacity duration-200 ${
              loadingCalc ? "opacity-50" : "opacity-100"
            }`}
            aria-busy={loadingCalc}
          >
            {totalCents == null && loadingCalc ? (
              "…"
            ) : (
              <AnimatedPrice cents={totalCents} format={(c) => formatMoney(c).formatted} />
            )}
          </p>
          {!withMarking &&
            orderFixedPromo &&
            lineSubtotalCents != null &&
            totalCents != null &&
            lineSubtotalCents > totalCents && (
              <p className="mt-1 text-xs font-medium text-social">
                −{formatMoney(lineSubtotalCents - totalCents).formatted} · {orderFixedPromo.name}
              </p>
            )}
        </div>
        {unitCents != null && (
          <p className="text-xs text-ink/50">
            {formatMoney(unitCents).formatted}
            <span className="opacity-60"> /ud</span>
          </p>
        )}
      </div>

      {/* 5. Botones */}
      <div ref={actionsRef} className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={onCotizar}
          className="w-full rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-bone shadow-lg transition hover:bg-accent"
        >
          Configurar y cotizar
        </button>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={!totalCents}
          className={`w-full rounded-full border px-6 py-3 text-sm font-medium transition disabled:opacity-40 ${
            recentlyAdded
              ? "border-social bg-social/10 text-social"
              : "border-line bg-bone-soft text-ink hover:border-accent"
          }`}
        >
          {recentlyAdded ? "✓ Añadido al pedido" : "+ Añadir al pedido"}
        </button>

        {/* Solicitar presupuesto formal por email (lo revisamos y enviamos) */}
        {qrState === "sent" ? (
          <div className="rounded-2xl border border-social/40 bg-social/10 p-4 text-sm">
            <p className="font-semibold text-social">✓ Solicitud enviada</p>
            <p className="mt-0.5 text-[13px] text-ink/70">
              Te preparamos el presupuesto cerrado y te lo enviamos por email en menos de 24&nbsp;h laborables.
            </p>
          </div>
        ) : !showQuoteReq ? (
          <button
            type="button"
            onClick={() => setShowQuoteReq(true)}
            className="w-full rounded-full border border-line bg-bone-soft px-6 py-3 text-sm font-medium text-ink transition hover:border-accent"
          >
            ✉️ Solicitar presupuesto por email
          </button>
        ) : (
          <div className="rounded-2xl border border-accent/30 bg-accent-wash/40 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-accent-deep">
              Te enviamos el presupuesto
            </p>
            <p className="mt-0.5 text-[12px] text-ink/60">
              Para {finalQty.toLocaleString("es-ES")} uds
              {withMarking && technique ? ` · ${technique.techniqueName}` : ""}. Lo revisamos y te lo
              enviamos cerrado.
            </p>
            <div className="mt-3 grid gap-2">
              <input
                type="email"
                value={qrEmail}
                onChange={(e) => setQrEmail(e.target.value)}
                placeholder="Tu email *"
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <input
                value={qrName}
                onChange={(e) => setQrName(e.target.value)}
                placeholder="Nombre / empresa (opcional)"
                className="w-full rounded-lg border border-line bg-bone px-3 py-2 text-sm outline-none focus:border-accent"
              />
              {qrError && <p className="text-[12px] text-accent-deep">⚠ {qrError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitQuoteRequest}
                  disabled={qrState === "sending" || !qrEmail.trim()}
                  className="flex-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bone shadow transition hover:bg-accent-dark disabled:opacity-40"
                >
                  {qrState === "sending" ? "Enviando…" : "Enviar solicitud"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuoteReq(false)}
                  className="rounded-full border border-line px-4 py-2.5 text-sm text-ink/60 hover:border-ink/30"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky CTA mobile — solo visible cuando los botones principales
          quedan fuera de la viewport. Resuelve el scroll de 7.500 px en
          mobile (fricción detectada en audit). */}
      {!actionsInView && totalCents != null && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bone/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-wider text-ink/50">
                {finalQty.toLocaleString("es-ES")} uds {withMarking ? "· con marcaje" : ""}
              </p>
              <p className="font-display text-lg font-semibold tabular-nums text-ink">
                <AnimatedPrice cents={totalCents} format={(c) => formatMoney(c).formatted} />
              </p>
            </div>
            <button
              type="button"
              onClick={onAddToCart}
              className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                recentlyAdded
                  ? "bg-social/15 text-social"
                  : "bg-accent text-bone hover:bg-accent-dark"
              }`}
            >
              {recentlyAdded ? "✓ Añadido" : "+ Añadir"}
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-ink/50">
        {withMarking
          ? "ⓘ "
          : "ⓘ "}
        {apiOk && calc.disclaimer
          ? calc.disclaimer
          : "Precios orientativos calculados a partir de tarifas medias del sector. La cotización final incluye marcaje, plazo y transporte, y se ajusta a tarifa oficial."}
      </p>
    </div>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
        checked ? "border-accent" : "border-line-dark"
      }`}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  );
}

function Badge({ color, children }: { color: "accent" | "social"; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
        color === "accent" ? "bg-accent/15 text-accent" : "bg-social/15 text-social"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Grupo de opciones visibles. Reutiliza la misma etiqueta que `Field` para que
 * un grupo de chips y un desplegable se lean igual cuando conviven (productos
 * con muchas zonas o técnicas siguen usando `<select>`).
 */
function OptionGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label}>
      <span className="flex items-center text-[11px] font-medium uppercase tracking-wider text-ink/50">
        {label}
        {hint}
      </span>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * Opción táctil. `min-h-[44px]` no es decorativo: es el objetivo táctil mínimo
 * que ya se aplicó al footer por accesibilidad, y aquí importa más porque estos
 * controles deciden el precio. `compact` es para las tintas, que son un dígito
 * y necesitan ancho de botón, no de etiqueta.
 */
function ChoiceChip({
  selected,
  onClick,
  children,
  sub,
  compact,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[44px] rounded-xl border text-left text-sm transition-colors ${
        compact ? "min-w-[44px] px-3 text-center tabular-nums" : "px-3.5"
      } py-2 ${
        selected
          ? "border-accent bg-accent/10 font-semibold text-ink"
          : "border-line bg-bone text-ink/75 hover:border-accent/60"
      }`}
    >
      {children}
      {sub && <span className="mt-0.5 block text-[11px] font-normal text-ink/50">{sub}</span>}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center text-[11px] font-medium uppercase tracking-wider text-ink/50">
        {label}
        {hint}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
