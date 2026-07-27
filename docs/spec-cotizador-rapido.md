# Spec — Cotizador rápido admin (`/admin/cotizar`)

> Objetivo (Mario, 2026-06-23): la compañera de administración teclea **una
> referencia** (la nuestra `STM-XXX` o la del proveedor `MO-XXX`/Makito/Cifra),
> ve **nuestro coste** y el **PVP con margen + plazos**, y **genera un
> presupuesto** para enviar al cliente. Todo desde la web, con apoyo del
> recomendador IA.
>
> Estado: **diseño cerrado, pendiente de construir** (bloqueado por corte del
> clasificador de la plataforma el 23-jun; no es el código). Construir en
> worktree aislado + `next build` verde + deploy (autodeploy endurecido).

## Piezas a REUTILIZAR (ya existen, verificadas leyendo el código)

- **Precios:** `src/lib/product-pricing.ts`
  - `computeClientPricing({product, override, providerNetTiers, activePromos})` →
    devuelve tiers cliente (con margen aplicado), `fromPriceCents`, etc.
  - `clientFromPriceCents(netCents, override)` y `applyMargin(net)` (×1,6 global,
    o `marginPct`/`customFromPriceCents` del `ProductOverride`).
  - Los `PriceTier` son **NETOS** (coste proveedor). PVP = `applyMargin(neto)`.
- **Marcaje (UNIFICADO, agnóstico de proveedor):** `src/lib/supplier-marking-rules.ts`
  - `getAvailableMarkingRules({ supplier, markingTechniqueHint })` → técnicas dispo.
  - `quoteMarkingForRule({ supplier, techniqueCode, productId, productUnitPriceCents, qty })`
    → `{ techniqueCode, techniqueLabel, markupPct, unitMarkupCents, setupCents, totalMarkingCents }`.
    Es NETO (coste de marcaje). Se llama con el **proveedor real del producto**.
- **Cotizador Cifra (plantilla de UX + lógica):** `src/app/admin/suppliers/cifra/quote/page.tsx`
  + `src/app/api/admin/suppliers/cifra/quote/route.ts`. Generalizar a todos los proveedores.
- **Documento cliente:** sistema de **Propuestas** (modelo `Proposal` + generador PDF +
  numeración + mailer + `POST /api/proposal/send` + `/[number]/pdf`).
  ⚠️ PENDIENTE de leer al construir: campos exactos de `Proposal`, firma del generador
  de PDF y cómo crear una propuesta programáticamente (grep `proposal` en `src/lib` y
  `src/app/api`). Es el único punto sin mapear.
- **IA / alternativas:** recomendador (`/api/.../proposals/generate` o `/recommend`,
  búsqueda semántica de catálogo) → botón "productos parecidos".
- **Auth admin:** `authenticateAdminRequest(req)` (cookie); roles CEO/COMERCIAL.
- **Rate-limit:** `src/lib/rate-limit.ts` (no crítico aquí, es admin).

## Ficheros a CREAR

### 1. `src/app/api/admin/cotizar/route.ts`
- `POST` `{ ref, qty, techniqueCode?, marginPctOverride? }`.
- **Lookup** (todos los proveedores) — distinguir ref nuestra vs proveedor con un OR:
  ```ts
  const ref = body.ref.trim();
  const product = await prisma.product.findFirst({
    where: { OR: [
      { internalRef: ref }, { sku: ref }, { slug: ref }, { supplierRef: ref },
    ], active: true },
    select: { id, slug, name, supplier, supplierRef, internalRef, fromPriceCents,
              markingTechniqueHint, markingSizeHint /*, leadTime si existe*/ },
  });
  ```
  Si no hay → 404 "no encontrado / pedir cotización manual".
- **Coste neto** por cantidad: `PriceTier` de la variante (mayor `minQty <= qty`),
  igual que el cotizador Cifra (líneas 71-78 de su route).
- **Técnicas** (si no hay `techniqueCode`): `getAvailableMarkingRules({ supplier: product.supplier, markingTechniqueHint })`.
- **Cotización** (con `techniqueCode`): `quoteMarkingForRule({ supplier: product.supplier, ... })`.
- **PVP**: cargar `ProductOverride` del producto → `override`; PVP del producto =
  `clientFromPriceCents(netUnit, override)`; PVP marcaje = `applyMargin(marking.totalMarkingCents)`
  (o margen override). Devolver **coste y PVP por separado** + IVA (`withIva` de `src/lib/iva.ts`).
- Respuesta: `{ product (con internalRef, NUNCA supplierRef al cliente), qty,
  costeUnit, costeTotal, marking, pvpUnit, pvpTotal, ivaCents, totalConIva, margenPct }`.

### 2. `src/app/admin/cotizar/page.tsx`
- Clonar la UX de `cifra/quote/page.tsx` (limpia). Input: **ref** + **cantidad** + (técnica).
- Mostrar **doble columna**: *Nuestro coste* (neto producto + marcaje) y *PVP cliente*
  (con margen + IVA), con el **margen editable** (default ×1,6).
- Plazos editables (producción + envío) + validez + notas.
- Botón **"Generar presupuesto"** → crea `Proposal` y abre/descarga el PDF.
- Botón **"Enviar al cliente"** → `POST /api/proposal/send` (email).
- Botón **"Alternativas IA"** → recomendador.

### 3. Nav admin
- Añadir item en `src/app/admin/layout.tsx`, sección Marketing o Catálogo:
  `{ href: "/admin/cotizar", label: "Cotización rápida 💸", title: "Presupuesto al momento por cualquier referencia" }`.

## Reglas duras
- **Nunca exponer proveedor al cliente**: el documento muestra solo `internalRef` (STM-XXX)
  y PVP; jamás `supplierRef` (MO-XXX), coste, ni el nombre del proveedor. (regla `rule_no_supplier_exposure`).
- **IVA**: precios base sin IVA; el documento muestra **base + 21% + total con IVA**
  (`src/lib/iva.ts`: `withIva`, `ivaPart`). Coherente con el cobro Stripe.
- **No tocar** los ficheros del refactor de pricing de la sesión paralela
  (`product-pricing.ts`/`promotions-core.ts` están committeados y estables → solo importar, no editar).
- Si el producto no tiene tarifa real → mostrar "pedir cotización manual" (como el watchdog de tarifas).

## Build & deploy
1. Worktree desde `origin/main` + symlink `node_modules`.
2. Leer modelo `Proposal` + generador PDF (único punto pendiente) y enchufar.
3. `pnpm build` verde (NO solo `tsc` — recordar el bug del export en route files).
4. Commit staging estricto + push + verificar deploy (marcador + endpoints).
