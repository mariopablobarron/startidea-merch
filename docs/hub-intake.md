# Réplica de formularios al HUB

Las altas humanas de `quote-request`, `quote-request-product` y
`newsletter-subscribe` crean una fila `HubIntakeOutbox` en la misma transacción
que su registro origen. Después se intenta entregar al HUB; un error de red o
del HUB no invalida el alta y queda reprogramado con backoff.

Variables:

- `HUB_INTAKE_URL`: opcional, por defecto `https://hub.startidea.tech`.
- `HUB_INTAKE_SECRET`: bearer compartido con el endpoint de intake del HUB.
- `CRON_SECRET`: protege `POST /api/cron/hub-intake-outbox` mediante el patrón
  nativo (`x-cron-secret` o `?secret=`).

Programa el cron cada 5-15 minutos. Procesa hasta 50 filas vencidas por llamada.
La tabla conserva reintentos y un lease temporal (`lockedAt`/`lockToken`) para
que el cron y el intento inmediato no entreguen la misma fila simultáneamente.
El payload normalizado nunca supera 32 KiB y no replica IP, user-agent, archivos
ni credenciales.
La normalización aplica los máximos del contrato HUB antes del `INSERT`; un
`submissionId` o `form` inválido se rechaza para no romper la idempotencia.
Antes de activar el cron, despliega la migración Prisma con el mecanismo normal
del proyecto (`pnpm prisma migrate deploy`).
