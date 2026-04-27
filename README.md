# startidea-merch · todomerchandising

Web de merchandising corporativo con impacto social para Startidea.
Subdominio: `merchandising.startidea.es`.

Marca: **todomerchandising** (logo propio).
Una iniciativa de **Startidea**.

---

## Estado actual — F0 (landing + cotización)

- Home con hero, manifiesto social, proceso, categorías y formulario de cotización.
- API `/api/quote-request` que persiste en Postgres y envía 2 emails (interno + autoresponse) vía Resend.
- API `/api/health` para healthcheck de Coolify.
- Schema Prisma con `QuoteRequest`, `QuoteNote`, `Partner`.

## Roadmap

- **F1** — Sync MidOcean + Makito → catálogo navegable (`/c/*`, `/p/*`).
- **F2** — Cotizador interactivo en ficha (cantidad × marcaje × colores × zonas).
- **F3** — Cuenta cliente, checkout (Stripe + Bizum), generación de PO al proveedor.
- **F4** — Capa social: filtro impacto, sello CEE, dashboard de horas generadas.
- **F5** — Configurador visual del logo sobre mockup.

---

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind 3
- PostgreSQL + Prisma 6
- Resend (emails transaccionales)
- Despliegue: Docker (`output: "standalone"`) en Coolify

## Desarrollo local

```bash
pnpm install
cp .env.example .env
# rellena DATABASE_URL local, RESEND_API_KEY (opcional en F0)
pnpm prisma migrate dev --name init
pnpm dev
```

## Despliegue en Coolify

1. **Crear app** en Coolify → tipo **Dockerfile**, repo `startidea-merch`, branch `main`.
2. **Postgres**: añadir servicio `Postgres 16`, copiar `DATABASE_URL`.
3. **Variables de entorno** (envolver en `'…'` los valores con `<>` o espacios — bug Coolify v3):
   - `DATABASE_URL`
   - `RESEND_API_KEY`
   - `RESEND_FROM='TodoMerchandising <hola@merchandising.startidea.es>'`
   - `RESEND_TO_INTERNAL=mariopablobarron@gmail.com`
   - `NEXT_PUBLIC_SITE_URL=https://merchandising.startidea.es`
   - `ADMIN_SECRET`, `CRON_SECRET` (cualquier string fuerte; sin uso en F0)
4. **Healthcheck**: `GET /api/health`.
5. **Dominio**: `merchandising.startidea.es` (DNS A → IP del VPS).
6. **Deploy**: Force Redeploy.
7. **Migración inicial**: en el contenedor o vía pre-deploy hook → `pnpm prisma migrate deploy`.

## Estructura

```
src/
  app/
    api/
      health/route.ts
      quote-request/route.ts
    layout.tsx
    page.tsx
    globals.css
  components/
    Nav.tsx Hero.tsx Marquee.tsx Impact.tsx
    Process.tsx Categories.tsx
    QuoteForm.tsx QuoteSection.tsx Footer.tsx
  lib/
    prisma.ts cn.ts resend.ts
prisma/
  schema.prisma
```

## Pendiente para producción real

- [ ] Logo `todomerchandising` SVG → `public/logo.svg` y reemplazar texto en Nav/Footer
- [ ] Datos fiscales reales en Footer + páginas legales (`/aviso-legal`, `/privacidad`, `/cookies`)
- [ ] Lista real de CEE/colaboradores en `Partner` + sección dedicada
- [ ] Credenciales MidOcean + Makito en envs cuando arranque F1
- [ ] DNS `merchandising.startidea.es` apuntando al VPS de Coolify
