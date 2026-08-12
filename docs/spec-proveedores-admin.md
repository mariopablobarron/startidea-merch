# Módulo unificado de Proveedores — propuesta de alcance

> Estado: **borrador para revisión de Mario**. No implementado. Ningún código de este
> documento se ha tocado — es la base para decidir qué construir y en qué orden.
>
> Origen: petición de Mario 2026-08-11, tras el incidente de PROP-2026-0006 (propuesta
> por debajo de coste por tarifa de marcaje Cifra desactualizada). Pidió un módulo de
> Proveedores en el admin con datos de contacto, envíos, API, precios, imágenes y
> catálogos — todo editable.

## 0. Lo que YA existe (no reconstruir)

Cada proveedor vive hoy en piezas sueltas, sin landing común:

| Proveedor | Sync catálogo | Precio producto | Tarifa marcaje | Panel admin |
|---|---|---|---|---|
| MidOcean | ✅ diario 01:30 UTC | ✅ PriceTier real | ✅ estructurada (sync semanal lunes) | `/admin/suppliers/midocean` |
| Makito | ✅ diario 04:00 UTC | ✅ PriceTier real | ✅ enrich diario, **sin UI** | `/admin/suppliers/makito` |
| Cifra | ✅ diario 03:00 UTC | ✅ PriceTier real | ✅ **tarifa por tramos editable** (hoy, commit `73f5518`) | `/admin/suppliers/cifra` + `quote/` + `marking-rates/` |
| Adivin | ❌ no existe cliente/sync | manual únicamente | ❌ ninguna | ❌ no existe página |

Imágenes: ya resueltas vía `MediaAsset` + proxy `/api/m/<hash>` (oculta el CDN del
proveedor al público). Overrides de producto (precio, destacar, ocultar, imágenes
extra) ya editables en `/admin/products`.

**Conclusión**: la pieza de "precios" del módulo ya está en marcha (Cifra hecha hoy,
patrón replicable a Makito). Lo que falta de verdad es todo lo demás.

## 1. Lo que NO existe (gap real)

1. Sin entidad `Supplier` en BD — solo un enum disperso (`SupplierCode`).
2. Sin datos de contacto comercial (nombre, teléfono, email de pedidos).
3. Sin condiciones comerciales (plazos de pago, mínimo de pedido, descuento por volumen).
4. Sin portes/shipping persistido — hoy es un campo manual (`portesCents`) tecleado
   por Mario en cada cotización, sin default por proveedor.
5. Sin plazo de entrega (lead time) en ningún modelo.
6. Credenciales API solo en `.env` — rotar una key exige editar `.env` + redeploy,
   sin auditoría de quién cambió qué.
7. Sin landing `/admin/suppliers` — cada proveedor es una ruta suelta.
8. Sin margen configurable por proveedor (hoy es global 1,6×, override solo por producto).
9. `adivin` existe en el enum de BD pero no tiene sync, cliente ni tipos — o se
   implementa de verdad o se retira del enum para no generar falsa expectativa.
10. Marking rates sin paridad: Cifra tiene UI, Makito y MidOcean no la necesitan
    igual (o no la tienen), Adivin nada — falta decidir un patrón común.

## 2. Propuesta de fases

### Fase A — Entidad Supplier + landing (base para todo lo demás)
- Modelo `Supplier` en Prisma: `code (SupplierCode) @id, name, active, contactName?,
  contactEmail?, contactPhone?, paymentTerms?, minOrderCents?, leadTimeDays?,
  notes?`.
- Semilla con los 4 proveedores actuales (datos de contacto: los que Mario tenga a
  mano, el resto en blanco para rellenar desde el admin).
- `/admin/suppliers` — landing con tarjeta por proveedor (estado sync, última
  sincronización, nº productos activos, enlace a sus sub-páginas).
- CRUD simple de los campos de contacto/condiciones comerciales sobre `Supplier`.

### Fase B — Portes y condiciones editables desde cotización
- `Supplier.defaultShippingCents` (portes por defecto) — el cotizador (`/admin/cotizar`)
  lo pre-rellena en vez del "8" hardcoded actual, editable por cotización como hoy.
- Opcional: tabla de tramos de portes por peso/volumen si Mario lo necesita (a
  confirmar con él — puede que sea overkill para el volumen actual de pedidos).

### Fase C — Credenciales en BD (editable sin redeploy)
- Reusar el patrón que ya existe para marketing (`IntegrationConfig`) o crear
  `SupplierCredential` — decidir en la fase si se comparte modelo o se separa
  (los proveedores de catálogo tienen forma distinta: token/user+pass/OAuth).
- UI para rotar API key/token por proveedor, con test de conexión inmediato
  (ya existe el botón "Probar conexión" en cada panel — reusar ese patrón).
- **Riesgo a decidir con Mario**: mover credenciales de proveedor de `.env` a BD
  es un cambio de superficie de seguridad (secrets en Postgres en vez de en el
  entorno del contenedor) — necesita su visto bueno explícito antes de tocarlo.

### Fase D — Marking rates para Makito (paridad con Cifra)
- Extender el patrón `SupplierMarkingRule` con tramos (ya construido para Cifra
  hoy) a Makito, con UI equivalente a `/admin/suppliers/cifra/marking-rates`.
- MidOcean no necesita esto (ya tiene tarifa estructurada por sync).

### Fase E — Adivin: decisión previa
- Antes de construir nada: ¿Adivin sigue activo como proveedor? Si sí, necesita
  cliente/sync igual que los otros 3 (hoy no tiene ninguno). Si es marginal,
  se puede dejar fuera del módulo y gestionar sus ~59 productos a mano como
  hasta ahora.

## 3. Lo que este documento NO decide todavía

- Si el margen por proveedor (punto 8) merece la pena frente al margen por
  producto que ya existe — a valorar con datos reales de qué proveedores
  necesitan margen distinto.
- Si vale la pena una tabla de portes por tramo de peso, o basta con un
  valor por defecto simple (Fase B, opción simple vs opción con tramos).
- Prioridad relativa entre fases — propongo A→B→C→D, con E resuelto antes de
  A (para no diseñar el modelo `Supplier` sin saber si Adivin entra o no).

## 4. Siguiente paso

Este documento es para que Mario marque qué fases quiere y en qué orden — no se
implementa nada hasta confirmación explícita, fase a fase.
