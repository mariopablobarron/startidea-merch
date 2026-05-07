# Despliegue VPS — startidea-merch

VPS Hostinger `72.61.195.108` (compartido con resto del portfolio Startidea). Patrón canónico portfolio (ver `~/.claude/memory/infra-startidea.md`). Solo se ejecuta cuando Stripe esté validado en local.

## Pre-requisitos

- `.env` local completo (incluyendo `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`).
- Migraciones Prisma generadas: `pnpm prisma migrate dev --name init` (commitear el directorio resultante en `prisma/migrations/`).
- Build local OK: `pnpm build`.

## 1. DNS

Crear A-record `merchandising.hubstartidea.es → 72.61.195.108` via Hostinger MCP:

```python
mcp__hostinger-mcp__DNS_updateDNSRecordsV1(
  domain="hubstartidea.es",
  overwrite=False,
  zone=[{"name": "merchandising", "type": "A", "ttl": 3600,
         "records": [{"content": "72.61.195.108"}]}]
)
```

Verificar propagación:

```bash
dig +short merchandising.hubstartidea.es @1.1.1.1
# debe devolver 72.61.195.108 en 30-90s
```

## 2. Crear stack en VPS

```bash
ssh root@72.61.195.108

mkdir -p /data/merch-startidea
cd /data/merch-startidea

# Subir el repo (opción A: git clone privado / opción B: rsync desde local)
# Recomendado git para que `git pull` actualice futuras versiones:
git clone git@github.com:mariopablobarron/startidea-merch.git .

# Subir .env (NUNCA via git — desde local):
# (ejecutar desde el Mac de Mario)
scp /Users/STARTIDEA/startidea-merch/.env root@72.61.195.108:/data/merch-startidea/.env
ssh root@72.61.195.108 'chmod 600 /data/merch-startidea/.env'

# Asegurar que la network coolify existe (debería ya):
docker network inspect coolify >/dev/null && echo OK || docker network create coolify
```

**Editar `.env` en el VPS** y cambiar `DATABASE_URL` para que apunte al container interno:

```
DATABASE_URL="postgresql://merch:TnsulDrGdJYxogq5GVTRQil092FD@merch-db:5432/startidea_merch?schema=public"
```

(host `merch-db` en lugar de `localhost`, ya que en docker-compose `db` se llama `merch-db`.)

## 3. Build + up

```bash
cd /data/merch-startidea
docker compose up -d --build
# Build dura 5-8min. Mantiene container viejo durante el build (atómico).

docker compose ps
# Esperar a que merch-app pase a (healthy). Si queda unhealthy:
docker compose logs app --tail=100
```

## 4. Migraciones Prisma en producción

El [`docker-entrypoint.sh`](../docker-entrypoint.sh) **debería** ejecutar `prisma migrate deploy` antes de `node server.js`. Verificar:

```bash
ssh root@72.61.195.108 'cat /data/merch-startidea/docker-entrypoint.sh'
```

Si no lo hace, ejecutar manualmente la primera vez:

```bash
docker compose exec app pnpm prisma migrate deploy
```

## 5. Verificar SSL Let's Encrypt

Traefik (gestionado por Coolify) debe emitir el cert automáticamente al ver el container `healthy` en network `coolify`:

```bash
curl -sI https://merchandising.hubstartidea.es/api/health
# 200 OK con cert válido (ssl_verify_result=0) → todo OK
```

Si falla, revisar logs de coolify-proxy:

```bash
docker logs coolify-proxy --tail=50 | grep merchandising
```

Caveat conocido: si otro stack tiene un router con un Host alias roto, Let's Encrypt rate-limita por identifier. Ver `~/.claude/memory/infra-startidea.md` sección "Let's Encrypt rate limit".

## 6. Probar webhook desde Stripe

Dashboard Stripe → Webhooks → endpoint `merchandising.hubstartidea.es/api/webhooks/stripe` → **Send test event** → `checkout.session.completed`.

En el VPS:

```bash
docker compose logs app --tail=50 | grep stripe
```

Si la firma es válida, devuelve 200. Si dice `Invalid signature`, revisar que `STRIPE_WEBHOOK_SECRET` en `.env` sea el del endpoint de PRODUCCIÓN (no el de Stripe CLI local, son distintos).

## 7. Test end-to-end con tarjeta de prueba

1. Visitar `https://merchandising.hubstartidea.es`.
2. Crear un cart-quote completo desde el frontend.
3. En `/admin` (login con `ADMIN_SECRET`), generar payment-link.
4. Pagar con `4242 4242 4242 4242`.
5. Verificar:
   - Email a `mariopablobarron@gmail.com` con asunto `[Pago recibido]`.
   - Email al cliente con receipt.
   - Notificación Telegram al equipo.
   - `Payment.status = PAID` en BD.
   - `CartQuote.status = CONFIRMED`.

## 8. Crons opcionales

Si se quiere backup diario de BD a Telegram:

```bash
# crontab -e en root del VPS
0 4 * * * curl -sX POST 'https://merchandising.hubstartidea.es/api/cron/backup-db?secret=8Qx9Osl0VEvWmVktSZYZUD2UADqn' >> /var/log/merch-backup.log 2>&1
```

(Reemplazar el secret por el real del `.env`.)

## Rollback

Si tras un deploy algo falla:

```bash
cd /data/merch-startidea
git log --oneline -5   # ver commits recientes
git checkout <hash_anterior>
docker compose up -d --build
```

O para rollback inmediato sin rebuild (si hay imagen previa):

```bash
docker compose up -d --no-build app
```
