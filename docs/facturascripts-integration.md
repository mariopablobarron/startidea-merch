# Integración merch-app → FacturaScripts

> Guía técnica para que `merchandising.hubstartidea.es` cree facturas automáticas en FacturaScripts cuando Stripe confirma un pago.

## Resumen

```
Stripe webhook (payment_intent.succeeded)
  → merch-app /api/stripe/webhook
  → marca Payment como pagado
  → llama a FacturaScripts API:
      1. POST /api/3/clientes        (idempotente, upsert)
      2. POST /api/3/productos       (idempotente, upsert por referencia)
      3. POST /api/3/crearFacturaCliente
      4. POST /api/3/pagarFacturaCliente/:id
  → guarda fsInvoiceCode en Payment (idempotencia)
  → merch-app envía email al cliente con su PDF (Resend)
```

## Datos de conexión

| Clave | Valor |
|---|---|
| Base URL | `https://facturas.startidea.tech/api/3` |
| Header de auth | `Token: <API_KEY>` (también acepta `X-Auth-Token`) |
| Content-Type para POST | `application/x-www-form-urlencoded` (la API no decodifica JSON salvo en el campo `lineas`) |
| API key | (guardada en `/docker/facturascripts/INTEGRATION_API_KEY.txt` chmod 600 — recuperar con `ssh root@72.61.195.108 'cat /docker/facturascripts/INTEGRATION_API_KEY.txt'`) |
| Permisos de la key | mínimo privilegio: read+create+update en `clientes`/`productos`/`variantes`/`stocks`; read en `impuestos`/`series`/`almacenes`/`empresas`/`facturaclientes`/`lineafacturaclientes`; POST en `crearFacturaCliente`/`pagarFacturaCliente`; GET en `exportarFacturaCliente` |

Variables a añadir en `.env` de merch-app:

```env
FACTURASCRIPTS_URL=https://facturas.startidea.tech/api/3
FACTURASCRIPTS_API_KEY=<copiar de la VPS>
```

## Endpoints clave

### 1. Crear/actualizar cliente (upsert)

```http
POST /api/3/clientes
Content-Type: application/x-www-form-urlencoded
Token: <API_KEY>

codcliente=MERCH-<userId>
cifnif=B12345678
nombre=Acme Brand SL
razonsocial=Acme Brand S.L.
email=facturacion@acme.com
personafisica=0
tipoidfiscal=CIF
direccion=Calle Mayor 1
codpostal=18001
ciudad=Granada
provincia=Granada
codpais=ESP
```

`codcliente` ≤ 10 caracteres. Recomendación: `M-<últimos 8 chars del userId>` o similar.
Idempotente: si `codcliente` existe, FacturaScripts hace UPDATE. Si no, INSERT.

### 2. Crear/actualizar producto

```http
POST /api/3/productos
Content-Type: application/x-www-form-urlencoded
Token: <API_KEY>

referencia=BOLI-A4-AZUL
descripcion=Bolígrafo Bic personalizado azul
precio=1.50
codimpuesto=IVA21
nostock=1
ventasinstock=1
```

`nostock=1` + `ventasinstock=1` es lo correcto para productos de merch (no controlas stock real desde FacturaScripts).

### 3. Crear factura

```http
POST /api/3/crearFacturaCliente
Content-Type: application/x-www-form-urlencoded
Token: <API_KEY>

codcliente=MERCH-abc123
codserie=A
observaciones=Pedido <orderId> · Stripe pi_xxx
lineas=[{"referencia":"BOLI-A4-AZUL","descripcion":"Bolígrafo Bic personalizado azul","cantidad":500,"pvpunitario":1.50,"codimpuesto":"IVA21"}]
```

**Importante**: el campo `lineas` es un string JSON, NO un array form-encoded. La API hace `json_decode($lineas)` internamente.

Respuesta exitosa (`HTTP 200`):

```json
{
  "doc": {
    "idfactura": 5,
    "codigo": "1511",
    "numero": "1511",
    "codserie": "A",
    "codcliente": "MERCH-abc123",
    "fecha": "19-06-2026",
    "neto": 750.00,
    "totaliva": 157.50,
    "total": 907.50,
    "pagada": false,
    "editable": true
  },
  "lines": [ { ... } ]
}
```

### 4. Marcar factura como pagada

```http
POST /api/3/pagarFacturaCliente/<idfactura>
Content-Type: application/x-www-form-urlencoded
Token: <API_KEY>

pagada=1
fecha=2026-06-19
codpago=TRANS
```

Importante: en la URL va el **`idfactura`** (PK numérica), no el `codigo`.

`codpago`: usa `TRANS` para transferencia (que es el que tiene la factura desde el catálogo de pago), o crea uno nuevo como `STRIPE` si quieres separar. Para ello:

```http
# (opcional) Crear forma de pago STRIPE
POST /api/3/formaspago
Content-Type: application/x-www-form-urlencoded
Token: <API_KEY>

codpago=STRIPE
descripcion=Stripe
plazovencimiento=0
activa=1
```

### 5. Descargar PDF (BUG conocido)

```http
GET /api/3/exportarFacturaCliente/<idfactura>?type=PDF
Token: <API_KEY>
```

⚠️ **Actualmente hay un bug** en el módulo PDF (Cpdf) con `tempPath` cuando el endpoint se llama vía HTTP (path `/tmp` no escribible en algunas configuraciones). Workaround:

- **Opción A** (recomendada): el merch genera su propio PDF con `@react-pdf/renderer` con los datos que recibió de `crearFacturaCliente`.
- **Opción B**: dejar que FacturaScripts envíe el email con el PDF adjunto (cambiar `email` del cliente y FacturaScripts lo envía automáticamente al guardar con `vf_send=1`).
- **Opción C**: arreglar el bug — cambiar PDFCore.php para usar `MyFiles/Cache` siempre como tempPath.

## Idempotencia

Stripe puede reenviar webhooks. Para evitar duplicar facturas:

1. Antes de llamar a FacturaScripts, comprueba en BD del merch si `Payment.fsInvoiceCode` ya tiene valor → si sí, skip.
2. Si no, llama a `crearFacturaCliente` → guarda `codigo` devuelto en `Payment.fsInvoiceCode` → `Payment.fsInvoiceId` (idfactura).
3. Si la respuesta de FacturaScripts da error de "ya existe", recuperar via `GET /api/3/facturaclientes?codcliente=X&observaciones=Pedido <orderId>%` y reusar.

Recomendación: añadir migración Prisma:

```prisma
model Payment {
  // ... campos existentes ...
  fsInvoiceCode String?   @db.VarChar(20)
  fsInvoiceId   Int?
  fsSyncedAt    DateTime?
  fsError       String?   @db.Text
}
```

## Catálogo: sincronizar productos

Como decidiste **sincronizar catálogos**, sugiero:

1. **Inicial** (one-shot al desplegar): un script `scripts/sync-products-to-fs.ts` que itera `Product` del merch y hace `POST /api/3/productos` por cada uno. Idempotente.
2. **Continua** (al crear/actualizar producto): en el flujo `prisma.product.create/update`, llama también a la API de FS. Mejor con un wrapper service.

Ejemplo de mapeo:

| Merch (`Product`) | FacturaScripts (`producto`) |
|---|---|
| `sku` o `slug` | `referencia` (PK, ≤30 chars) |
| `name` | `descripcion` |
| `basePrice` (sin IVA) | `precio` |
| `taxIncluded` ? | `codimpuesto` (IVA21 / IVA10 / IVA4) |
| — | `nostock=1, ventasinstock=1` (servicio/sin stock) |

## Módulo TypeScript de ejemplo

Archivo sugerido: `lib/facturascripts.ts` en el merch.

```ts
const BASE = process.env.FACTURASCRIPTS_URL!;
const KEY = process.env.FACTURASCRIPTS_API_KEY!;

async function fsPost<T = unknown>(path: string, body: Record<string, string | number>): Promise<T> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Token': KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FS ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function fsGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Token': KEY } });
  if (!res.ok) throw new Error(`FS ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const facturaScripts = {
  upsertCliente: (c: {
    codcliente: string; cifnif: string; nombre: string;
    razonsocial?: string; email?: string; direccion?: string;
    codpostal?: string; ciudad?: string; provincia?: string;
    codpais?: string; personafisica?: 0 | 1; tipoidfiscal?: string;
  }) => fsPost('/clientes', { ...c, tipoidfiscal: c.tipoidfiscal ?? 'CIF', codpais: c.codpais ?? 'ESP' }),

  upsertProducto: (p: {
    referencia: string; descripcion: string; precio: number;
    codimpuesto: 'IVA21' | 'IVA10' | 'IVA4' | 'IVA0';
  }) => fsPost('/productos', { ...p, nostock: 1, ventasinstock: 1 }),

  crearFactura: (params: {
    codcliente: string; codserie?: string; observaciones?: string;
    lineas: Array<{ referencia: string; descripcion: string; cantidad: number; pvpunitario: number; codimpuesto: string }>;
  }) => fsPost<{ doc: { idfactura: number; codigo: string; total: number }; lines: unknown[] }>(
    '/crearFacturaCliente',
    {
      codcliente: params.codcliente,
      codserie: params.codserie ?? 'A',
      observaciones: params.observaciones ?? '',
      lineas: JSON.stringify(params.lineas),
    }
  ),

  marcarPagada: (idfactura: number, codpago: string = 'TRANS') =>
    fsPost(`/pagarFacturaCliente/${idfactura}`, {
      pagada: 1,
      fecha: new Date().toISOString().slice(0, 10),
      codpago,
    }),

  // Solo si arreglas el bug de tempPath o usas otro path
  exportarPdf: async (idfactura: number): Promise<Buffer> => {
    const res = await fetch(`${BASE}/exportarFacturaCliente/${idfactura}?type=PDF`, {
      headers: { 'Token': KEY },
    });
    if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
};
```

## Integración en el webhook Stripe del merch

Pseudocódigo del handler (adaptar al fichero real del merch):

```ts
import { facturaScripts } from '@/lib/facturascripts';
import { prisma } from '@/lib/prisma';

// Dentro de tu handler 'payment_intent.succeeded' o 'checkout.session.completed':
async function onStripePaymentSucceeded(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const payment = await prisma.payment.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
  if (!payment) return;
  if (payment.fsInvoiceCode) return; // ya facturado - idempotente

  try {
    // 1) Cliente upsert
    const codcliente = `M-${payment.customerId.slice(0, 8)}`;
    await facturaScripts.upsertCliente({
      codcliente,
      cifnif: payment.customer.taxId,
      nombre: payment.customer.companyName,
      razonsocial: payment.customer.companyName,
      email: payment.customer.email,
      direccion: payment.customer.address,
      codpostal: payment.customer.postalCode,
      ciudad: payment.customer.city,
      provincia: payment.customer.province,
    });

    // 2) Productos upsert (cache para no llamar 1000 veces)
    for (const item of payment.items) {
      await facturaScripts.upsertProducto({
        referencia: item.product.sku,
        descripcion: item.product.name,
        precio: item.unitPrice,
        codimpuesto: 'IVA21',
      });
    }

    // 3) Crear factura
    const { doc } = await facturaScripts.crearFactura({
      codcliente,
      codserie: 'A',
      observaciones: `Pedido ${orderId} · Stripe ${session.payment_intent}`,
      lineas: payment.items.map(i => ({
        referencia: i.product.sku,
        descripcion: i.product.name,
        cantidad: i.quantity,
        pvpunitario: i.unitPrice,
        codimpuesto: 'IVA21',
      })),
    });

    // 4) Marcar pagada
    await facturaScripts.marcarPagada(doc.idfactura, 'TRANS');

    // 5) Persistir referencia para idempotencia
    await prisma.payment.update({
      where: { id: orderId },
      data: {
        fsInvoiceCode: doc.codigo,
        fsInvoiceId: doc.idfactura,
        fsSyncedAt: new Date(),
        fsError: null,
      },
    });

    // 6) Email al cliente (Resend, con el branding del merch)
    // El PDF puedes generarlo en el merch (@react-pdf/renderer) usando los datos de doc
    // O dejar que FacturaScripts lo envíe (depende de la decisión)

  } catch (e) {
    await prisma.payment.update({
      where: { id: orderId },
      data: { fsError: String(e).slice(0, 1000) },
    });
    throw e; // que Stripe reintente
  }
}
```

## Gotchas a saber

- **Cabecera auth**: probada con `Token`. Aceptada también `X-Auth-Token`. NO uses `Authorization: Bearer ...`.
- **JSON vs form**: la API NO decodifica JSON del body (excepto el campo `lineas`). Siempre `application/x-www-form-urlencoded`.
- **PK vs código**: para `exportarFacturaCliente/X` y `pagarFacturaCliente/X` la `X` es el **idfactura** (PK numérica), NO el `codigo` (cadena tipo "1511").
- **Permisos**: si añades nuevos endpoints (presupuestos, albaranes...), ajusta `api_access` para esa key. Con menos permisos = más seguro.
- **API activada**: `Tools::settings("default", "enable_api", true)` ya está activada. Si alguien lo desactiva desde el panel, todo deja de responder con 409 "API desactivada".
- **PDF por API**: bug con Cpdf tempPath. Workaround: PDF en el merch o que FacturaScripts lo envíe por email.
- **Numeración**: serie A está en próxima 1511 (correlativa estricta, `usarhuecos=0`). Cada factura del merch consumirá el siguiente número. Si rompes el correlativo (creando+borrando), la AEAT puede ponerse seria — siempre crear, no borrar en producción.

## Cómo enchufarlo al webhook Stripe (parche manual)

> `src/app/api/webhooks/stripe/route.ts` ya está modificado localmente (cambios sin commit). El parche del webhook NO se aplica automáticamente para no pisarte; aplícalo a mano cuando estés listo.

### Paso 1: añadir import

```ts
// junto al resto de imports de @/lib/...
import { syncPaymentToFacturaScripts } from "@/lib/facturascripts-sync";
```

### Paso 2: invocar al final de `postPaymentAutoflow`

Antes del cierre `}` de la función `postPaymentAutoflow(...)`, añade:

```ts
  // Sincronizar con FacturaScripts (emite factura legal en facturas.startidea.tech).
  // Idempotente: si el Payment ya tiene fsInvoiceCode, no hace nada.
  // Errores se guardan en Payment.fsError para reintento manual desde admin;
  // NO rompen el flujo del webhook (Stripe debe recibir 200 OK siempre).
  void syncPaymentToFacturaScripts(paymentId)
    .then((res) => {
      if (res.ok) {
        console.log("[stripe webhook] fs-sync", paymentId, res.alreadySynced ? "(ya sincronizado)" : `→ ${res.fsInvoiceCode}`);
      } else {
        console.error("[stripe webhook fs-sync]", paymentId, res.error);
      }
    })
    .catch((err) => console.error("[stripe webhook fs-sync exception]", paymentId, err));
```

## Migración de BD

```bash
cd /Users/STARTIDEA/startidea-merch
pnpm prisma migrate dev --name payment_facturascripts   # dev
# En producción del merch:
pnpm prisma migrate deploy
```

La migración (`prisma/migrations/20260619_payment_facturascripts/migration.sql`) añade 4 campos a `Payment`: `fsInvoiceCode`, `fsInvoiceId`, `fsSyncedAt`, `fsError`. No afecta a datos existentes.

## Sincronización inicial del catálogo (one-shot)

Después de configurar FacturaScripts con la empresa MALAGA:

```bash
# Dry-run: ver qué se sincronizaría
pnpm exec tsx scripts/sync-products-to-fs.ts

# Aplicar de verdad
pnpm exec tsx scripts/sync-products-to-fs.ts --apply

# Solo N productos (probar antes de la pasada completa)
SYNC_LIMIT=5 pnpm exec tsx scripts/sync-products-to-fs.ts --apply
```

A partir de ahí, los productos nuevos se sincronizan **al vuelo** cuando llega un pago (la función `syncPaymentToFacturaScripts` hace upsert de los productos del carrito antes de crear la factura). El bootstrap es opcional pero recomendable para tener el catálogo en FacturaScripts de cara a auditorías y análisis.

## Variables de entorno a añadir al merch

En `/docker/startidea-merch/.env` del VPS (y tu `.env.local` de dev):

```env
FACTURASCRIPTS_URL=https://facturas.startidea.tech/api/3
FACTURASCRIPTS_API_KEY=<copiar de /docker/facturascripts/INTEGRATION_API_KEY.txt>
FACTURASCRIPTS_IDEMPRESA=2        # 2 = STARTIDEA MALAGA SL (1 = CONSULTING)
FACTURASCRIPTS_CODSERIE=A         # serie general
FACTURASCRIPTS_CODALMACEN=AMG     # almacén de MALAGA
```

Para copiar la API key al servidor del merch:

```bash
ssh root@72.61.195.108 'cat /docker/facturascripts/INTEGRATION_API_KEY.txt'
# y añade el valor a /docker/startidea-merch/.env
```

## Después de implementar: smoke test obligatorio

1. **Migración aplicada** (`pnpm prisma migrate deploy` en producción).
2. **Variables de entorno** copiadas y contenedor reiniciado.
3. **Empresa MALAGA configurada** en FacturaScripts (esperando nº última factura + IBAN de Mario).
4. Disparar un pago de prueba en Stripe TEST.
5. Comprobar:
   - Factura aparece en `https://facturas.startidea.tech/ListFacturaCliente` con idempresa=2.
   - `Payment.fsInvoiceCode` se guardó en el merch.
   - El cliente recibe el email del merch.
6. Repetir el disparo Stripe (idempotencia): no debe duplicar la factura — el segundo intento devuelve `alreadySynced: true`.
7. Pasar a Stripe LIVE solo cuando los 6 puntos arriba estén OK.
