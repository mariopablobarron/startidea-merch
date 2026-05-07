# Activación de Stripe — startidea-merch

Estado actual (2026-05-07): código de pagos completo, **sin claves configuradas** y **proyecto sin desplegar en VPS**. Esta guía deja el flujo listo para producción.

## 1. Cuenta de Stripe

Mario debe hacerlo personalmente (las reglas de seguridad impiden que Claude cree cuentas):

1. Ir a `https://dashboard.stripe.com/register`.
2. Datos de la empresa: **STARTIDEA MALAGA SL**, CIF `B19583632`, dirección `C/ Conde Cifuentes 33, 18005 Granada`.
3. Verificar email + 2FA obligatorio.
4. **Activar la cuenta** (KYC): subir CIF, justificante bancario y datos del representante. Stripe puede tardar 24-48h en habilitar el modo `live`.

> Si Startidea ya tiene cuenta Stripe (revisa `mariopablobarron@gmail.com` o `mario@startidea.es`), reutilízala — basta con crear productos separados para "Merchandising".

## 2. Claves API (modo TEST primero)

Dashboard → **Developers → API keys**. Copiar:

| Variable .env             | Valor               | Origen dashboard          |
| ------------------------- | ------------------- | ------------------------- |
| `STRIPE_SECRET_KEY`       | `sk_test_51...`     | API keys → Secret key     |
| `STRIPE_WEBHOOK_SECRET`   | `whsec_...`         | Webhooks (paso 3, abajo)  |

Pegarlas en `/Users/STARTIDEA/startidea-merch/.env` (líneas marcadas como pendientes).

> No hace falta `STRIPE_PUBLISHABLE_KEY` en este proyecto — Stripe Checkout redirige al dominio de Stripe y Express Checkout usa Payment Element con `clientSecret` (no `pk_`). El código de [`/src/lib/stripe.ts`](../src/lib/stripe.ts) solo usa `SECRET`.

## 3. Webhook endpoint

Dashboard → **Developers → Webhooks → Add endpoint**.

- **URL**: `https://merchandising.hubstartidea.es/api/webhooks/stripe`
- **Description**: `merch — production` (o `merch — test`)
- **Events to send** (los que el código maneja en [`route.ts`](../src/app/api/webhooks/stripe/route.ts)):
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`

Tras crearlo, copiar **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

> El dominio aún NO existe en DNS. El webhook se puede crear ahora pero no recibirá eventos hasta que el VPS esté arriba. Para test local antes de desplegar usar **Stripe CLI** (paso 5).

## 4. Stripe Tax (España + UE)

Cuando la cuenta esté activa:

1. Dashboard → **Tax → Get started**.
2. Tax registrations → añadir España (origin: Granada, IVA general 21%).
3. Si vendes a otros países UE, añadir cada registro (OSS) o configurar **automatic tax** confiando en Stripe.
4. Cuando esté funcional cambiar en `.env`:
   ```
   STRIPE_TAX_ENABLED="true"
   ```
5. El código en [`checkout/route.ts:40`](../src/app/api/pay/[token]/checkout/route.ts) ya respeta este flag.

## 5. Test local con Stripe CLI

Antes de desplegar al VPS, validar el flow end-to-end localmente:

```bash
# Instalar (Mac)
brew install stripe/stripe-cli/stripe

# Login (abre navegador, autoriza al CLI)
stripe login

# Levantar postgres + app local
cd /Users/STARTIDEA/startidea-merch
docker compose up -d db
pnpm install
pnpm prisma migrate dev   # primera vez crea schema
pnpm dev   # http://localhost:3000

# En otra terminal, redirigir webhooks de Stripe a tu localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# → muestra "Ready! Your webhook signing secret is whsec_..."
# Copiar ESE whsec a STRIPE_WEBHOOK_SECRET (es DIFERENTE al del dashboard,
# es solo para CLI). Reiniciar pnpm dev tras pegarlo.

# Disparar evento de prueba
stripe trigger checkout.session.completed
```

Tarjetas de prueba habituales (modo test):
- `4242 4242 4242 4242` — Visa, sin 3DS
- `4000 0025 0000 3155` — Visa, requiere 3DS
- `4000 0000 0000 9995` — declinada

## 6. Paso a `live`

Cuando todo funcione en test:

1. En Stripe Dashboard, switch toggle "Test mode" → off.
2. Generar nuevo `sk_live_...` en API keys.
3. Crear nuevo webhook endpoint en modo live (mismo URL, mismos eventos) → nuevo `whsec_...`.
4. Actualizar `.env` del VPS:
   ```
   STRIPE_MODE="live"
   STRIPE_SECRET_KEY="sk_live_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   ```
5. `docker compose up -d --force-recreate app` (recordar: `restart` no recarga `env_file`).

## 7. Datos fiscales del recibo

En `webhooks/stripe/route.ts:144` y `:215` el footer del email usa:

```
STARTIDEA MALAGA SL · CIF B19583632
```

Si la cuenta Stripe se abre con otra entidad legal (ej. autónomo, otra SL), revisar y editar.

---

## Resumen de pendientes en el lado humano

- [ ] Mario: crear/localizar cuenta Stripe de Startidea
- [ ] Mario: completar KYC para habilitar `live`
- [ ] Mario: pegar `sk_test_...` y `whsec_...` en `.env`
- [ ] Mario: configurar Stripe Tax (España + UE relevantes)
- [ ] (Claude): test local end-to-end con `stripe listen`
- [ ] (Claude): desplegar al VPS — ver `docs/deploy-vps.md`
- [ ] Mario: switch a `live` cuando esté validado
