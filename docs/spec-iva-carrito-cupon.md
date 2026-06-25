# Spec — IVA en carrito + cupón aplicado al cobro

> Para la sesión que está refactorizando el motor de precios/promociones
> (`pricing.ts`, `promotions.ts`, `CartPage.tsx`, `quote/calculate`, `product-pricing.ts`).
> Origen: decisión de Mario 2026-06-17 + caza de bugs (`incident_iva_cobro_20260617`).
> El cobro Stripe con IVA y el desglose en `/pay` YA están hechos (commit `76d3882`);
> faltan estas dos piezas, que viven en el motor de precios que estás tocando.

## Contexto fiscal (decisión de Mario)
Los precios del catálogo/cotizador son **BASE, sin IVA**. Siempre se muestra "+ IVA"
y, al cobrar/cerrar carrito, se añade el **21%**. Ya existe la fuente única:

```ts
// src/lib/iva.ts (NO dupliques el 0.21)
import { IVA_RATE, withIva, ivaPart } from "@/lib/iva";
// withIva(baseCents) -> base + 21%   ·   ivaPart(baseCents) -> solo el IVA
```

## Tarea 1 — Desglose de IVA en el carrito (CartPage)
En el resumen del carrito mostrar, igual que ya hace `src/app/pay/[token]/page.tsx`:
- **Subtotal (sin IVA)** = suma de líneas (base)
- **IVA 21%** = `ivaPart(subtotal)`
- **Total con IVA** = `withIva(subtotal)`  ← el importe que se cobra
- El botón "Pagar ahora" debe mostrar el total **con IVA**.

Hoy el carrito muestra el total sin etiquetar IVA (bug #7 de la caza) → incoherente
con el PDF y con `/pay`.

## Tarea 2 — Cupón aplicado al cobro (bug #3, CRÍTICO)
Hoy en pago directo el cupón se ve en el carrito (p.ej. 90 €) pero **el cobro usa
`acceptedTotalCents` sin el descuento** (cobra 100 €). Causa: el cupón NO se persiste
server-side en `src/app/api/cart-quote/route.ts` (`total = sum(items)`, sin descuento).

Fix:
1. El cliente envía el código de cupón en el POST de `/api/cart-quote`.
2. El server **valida el cupón** y aplica el descuento a la **base** (antes del IVA).
3. `acceptedTotalCents` = base **ya con descuento**. El cobro (`withIva`) parte de ahí.
4. Orden correcto: `base → −descuento cupón → +21% IVA`.
5. Además (bug #13): el cupón **porcentual** debe recalcularse al cambiar la cantidad
   (hoy se queda con el descuento fijo del importe inicial).

⚠️ Hasta que esto esté: **no cobrar con cupón** (cobra de más).

## Otros bugs de la caza que caen en tu zona (fold si puedes)
- **#5** factura de depósito: las líneas no cuadran con base/total (`clientes/invoice/[paymentId]`).
- **#8** comisión de afiliado calculada sobre el depósito y no sobre el total del pedido
  (`webhooks/stripe`): usar `acceptedTotalCents`, no el importe del depósito.
- **#14/#15** descuadres de 1 céntimo en el desglose por redondeos independientes
  (`quote/calculate`): redondear una vez el total y derivar las partes, o aceptar el céntimo.

## Verificación
- Carrito y `/pay` muestran el MISMO desglose y total.
- Pago directo con cupón: el importe cobrado = `withIva(base − descuento)`, igual que el botón.
- Ejemplo: base 1.000 €, cupón −10% → base 900 € → cobro `withIva(90000)=108900` = 1.089 €.
