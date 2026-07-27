# OPERATIONS · startidea-merch

> Runbook operativo de TodoMerchandising. Fuente de verdad para infra,
> deploy, secrets, observabilidad y recuperación. Si entra en conflicto
> con memoria local de Claude o notas viejas, **este doc gana**.

Actualizado: 2026-06-04

---

## 1. Arquitectura en producción

```
GitHub                Hostinger VPS (72.61.195.108)         Internet
                                                                ↑
push main ──► CI ───► VPS Direct Deploy SSH ──► /root/deploy-startidea-merch.sh
                                               │
                                               ├─ git pull
                                               ├─ docker compose build
                                               └─ docker compose up -d app
                                                       │
                                       ┌───────────────┴───────────────┐
                                       │                               │
                                docker container                 docker container
                                  merch-app                          merch-db
                                 (Next.js 15)                    (postgres:16-alpine)
                                       │                               │
                                       └────── network merch_net ──────┘

DNS: merchandising.startidea.es → 72.61.195.108 (A record en Hostinger)
TLS: Coolify proxy maneja Let's Encrypt en el VPS (otros apps comparten host)
```

## 2. Repositorio y ramas

- Repo: `mariopablobarron/startidea-merch` (GitHub)
- Branch único de desarrollo: **main**
- No usamos PRs ni branches paralelos. Commits feature consecutivos.
- Cada push a main dispara 3 workflows:
  - **CI** (typecheck + lint + build sin deploy)
  - **Security audit**
  - **Deploy a producción** ← el único que toca el VPS

⚠️ **CI verde ≠ deploy verde** — los deploys pueden fallar silenciosamente
(timeouts SSH, blips de red). Validar siempre los 3 workflows tras push:

```bash
gh run list --limit 3 --json conclusion,name,headSha
```

## 3. Deploy a producción

### Flujo normal

```bash
git push origin main
# Espera ~2-3 min, luego:
gh run list --workflow="Deploy a producción (merchandising.startidea.es)" --limit 1
```

### Si el deploy falla

1. `gh run view <runId> --log-failed | tail -40` para ver causa
2. Causas comunes:
   - **Exit code 1 en <10s** → blip SSH (VPS caído o bajo presión). Re-push con
     un commit vacío o `gh workflow run "Deploy a producción..."` para reintentar.
   - **Timeout build 15m** → load del VPS alto. Esperar 5min, reintentar.
   - **Build error real** → leer log completo, fix, re-push.
3. Si la imagen Docker ya se construyó pero el switch falló: SSH al VPS y
   `cd /docker/startidea-merch && docker compose up -d app` manualmente.

### Smoke test post-deploy

```bash
python3 -c "
import urllib.request
for p in ['/', '/admin', '/admin/insights', '/catalogo', '/recomendador']:
    r = urllib.request.urlopen('https://merchandising.startidea.es'+p, timeout=15)
    print(f'{r.status}  {p}')
"
```

## 4. Secrets y env vars

### Estructura

- **GitHub Actions** (`Settings > Secrets`): solo `VPS_SSH_KEY` (clave restringida
  con `command="..."` en authorized_keys del VPS — solo ejecuta el script de deploy).
- **VPS `/docker/startidea-merch/.env`**: todas las credenciales runtime.
  El `docker-compose.yml` tiene `env_file: .env`, así que toda var nueva
  añadida al `.env` llega al container con `docker compose up -d app`.
- **NO usamos Coolify** para gestionar este `.env` aunque otras apps del VPS
  sí. El `.env` se edita por SSH directo.

### Lista de env vars críticas

| Var | Para qué | Sin ella |
|---|---|---|
| `DATABASE_URL` | conexión Postgres | app no arranca |
| `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_TO_INTERNAL` | emails de propuestas + digest | propuestas no salen |
| `OPENROUTER_API_KEY` | recomendador IA (Claude Sonnet 4.5) | recomendador roto |
| `ADMIN_SECRET` | autenticación legacy header `X-Admin-Secret` | admin sin cookie no entra |
| `CRON_SECRET` | endpoints `/api/cron/*` | crons rechazan llamadas |
| `MIDOCEAN_API_KEY` | sync MidOcean | sync no actualiza |
| `MAKITO_API_EMAIL`, `MAKITO_API_PASSWORD`, `MAKITO_FEED_TOKEN` | API legacy + feeds XML Makito | sync masivo Makito roto |
| `MAKITO_B2B_SANDBOX_CLIENT_ID/SECRET` | API B2B oficial sandbox (no procesa pedidos) | `/admin/suppliers/makito` no testea sandbox |
| `MAKITO_B2B_PROD_CLIENT_ID/SECRET` | API B2B oficial producción (procesa pedidos reales) | no se pueden enviar pedidos automáticos |
| `DASHBOARD_SHARE_SECRET` | HMAC firmado URLs compartibles dashboard | usaría `NEXTAUTH_SECRET` fallback (aceptable) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | alertas críticas | sin notificaciones |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + VAPID privadas | web push admin | matriz notif sin push browser |

Plantilla completa en `.env.example` (vacío de valores reales, nunca commitear el `.env`).

### Añadir nueva var al VPS

```bash
ssh root@72.61.195.108
cd /docker/startidea-merch
nano .env        # añade `NUEVA_VAR=valor`
docker compose up -d app    # ~5s recarga sin perder estado de BD
```

### Higiene del WORKDIR del VPS

Patrón histórico: cuando se rotaba un secret, se hacía `cp .env .env.bak.<ts>.pre-X`
en el mismo `/docker/startidea-merch/`. Esto genera basura que delata qué se
ha rotado y deja historial de secrets accesible vía SSH al VPS. Resolver:

```bash
# Dry-run: ver qué se movería sin tocar nada
ssh root@72.61.195.108 'cd /docker/startidea-merch && ./scripts/cleanup-vps-backups.sh'

# Aplicar de verdad — mueve a /root/.backups/startidea-merch/ con perms 700/600
ssh root@72.61.195.108 'cd /docker/startidea-merch && ./scripts/cleanup-vps-backups.sh --apply'
```

Patrón nuevo recomendado para futuras rotaciones:
- Backup **fuera** del WORKDIR: `cp .env /root/.backups/startidea-merch/.env.bak.$(date +%s).pre-X`
- Permisos restrictivos: `chmod 600 /root/.backups/startidea-merch/.env.bak.*`
- Retención automática: el script de cleanup limpia >30 días.

### Overrides de producción — patrón `docker-compose.prod.yml`

Convención (a partir de 2026-06-03):

- **`docker-compose.yml`** — base, igual en local y producción
- **`docker-compose.prod.yml`** — overrides explícitos de producción,
  versionado. Solo se aplica si lo pasas con flag: `-f docker-compose.prod.yml`
- **`docker-compose.override.yml`** — PROHIBIDO. Está en `.gitignore`
  y se aplica automáticamente sin avisar. Genera deuda invisible.

El `scripts/deploy.sh` aplica ambos archivos siempre:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build app
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate app
```

### El volumen Postgres legacy (importante)

En `docker-compose.prod.yml` está documentado el caso del volumen
`cmogzf1ah0000p2a4juw84ecxmerch_pgdata_v2` (nombre que dejó Coolify cuando
se desplegaba con él). Toda la BD vive ahí. **NO eliminar sin migración
explícita** (dump + restore + cambio de nombre).

## 5. Base de datos (Postgres)

- Container: `merch-db` (postgres:16-alpine, network `merch_net`)
- ⚠️ **Cuidado**: en el VPS hay OTRO Postgres en la red Coolify (`172.16.48.49`).
  La app usa el `db:5432` interno por nombre de servicio Docker. No confundir
  los dos al hacer diagnóstico.
- Backups: cron del host a Telegram (ver `/etc/cron.d/mentor-db-backup` o similar)
- Migraciones: `pnpm db:migrate` (corre `prisma migrate deploy`)
- Schema source: `prisma/schema.prisma`

### Restaurar de backup

1. Detener app: `docker compose stop app`
2. Descargar dump desde Telegram (mensaje del bot con `.sql.gz`)
3. `zcat dump.sql.gz | docker exec -i merch-db psql -U merch merch`
4. `docker compose up -d app`

## 6. Crons y procesos periódicos

### En GitHub Actions

| Workflow | Cuando | Qué hace |
|---|---|---|
| `metric-snapshot.yml` | cada hora | snapshots de KPIs para anomaly + deltas |
| `product-view-rollup.yml` | diario 03:00 UTC | rolling de viewCount30d |
| `auto-resolve-errors.yml` | diario 04:15 UTC | cierra ErrorEvent ≥30d sin nuevas |
| `insights-digest.yml` | lunes 08:00 UTC | email digest semanal + PDF |
| `insights-digest-monthly.yml` | día 1 09:00 UTC | comparativa M-vs-M por email |
| `ai-usage-alert.yml` | diario 10:00 UTC | push si coste IA del día previo > umbral |
| `cron-watchdog.yml` | diario 11:00 UTC | avisa si crons trackeados llevan >umbral sin run o último falló |
| `lighthouse-ci.yml` | diario | Core Web Vitals |
| `health-ping.yml` | cada 10 min | uptime ping monitor externo |

Endpoints invocados llevan header `x-cron-secret: $CRON_SECRET`.

### Observabilidad de los crons

Los crons decorados con `wrapCronHandler()` (de `src/lib/cron-tracking.ts`)
guardan sus últimas 20 ejecuciones en `AdminSetting.cron_runs_*` (sin
migración Prisma). Visible en:

- **`/admin/insights/crons`** — tabla por cron con timestamps, duración,
  status, tasa de éxito, último OK / último fallo
- Chip "⏰ Crons" en `/admin/insights`

Integrados hasta ahora (6/8 activos en GH Actions):
- `ai-usage-alert`
- `auto-resolve-errors`
- `metric-snapshot`
- `product-view-rollup`
- `insights-digest` (weekly)
- `insights-digest-monthly`

Pendientes de integrar (otros 15 crons sin tracking aún):
abandoned-cart-drip, backup-db, cifra-sync,
embeddings-sync, improve-descriptions, makito-marking-enrich, makito-sync,
midocean-print-pricelist-sync, midocean-sync, post-order-drip,
publish-scheduled, refresh-tracking, review-invite, stock-alert,
webhook-retry.

Para añadir más: importar `wrapCronHandler` y reemplazar
`export async function POST` por `export const POST = wrapCronHandler("name", async (req) => {...})`.

### En el VPS

- Backups Postgres (cron host)
- Watchdog uptime (cron host, alerta Telegram)

## 7. Observabilidad

### Errores

- **Client-side**: `GlobalErrorTracker` componente (carga en root layout) captura
  `window.onerror` + `unhandledrejection`. POST a `/api/admin/errors` con dedup.
- **Server-side**: `captureError(err, { context })` en `src/lib/insights/capture-error.ts`.
  Se llama explícitamente en lugares clave (no es global).
- **Panel**: `/admin/insights/errors` listado + `/admin/insights/errors/[id]` detalle
  con stack trace, metadata, similares por firma agrupadora.
- **Cooldown push**: si llegan muchos errores seguidos, se cap un push browser /hora
  (`PUSH_COOLDOWN_MS` en `capture-error.ts`).

### Anomalías

- Cron horario `metric-snapshot.yml` toma snapshot de KPIs en `MetricSnapshot`.
- Comparación baseline 7d vs reciente 3d.
- ≥30% caída en views → crítico
- ≥50% spike en errores → oportunidad de revisión
- ≥25% caída en propuestas → warning
- Push admin con cooldown 24h por anomalía individual.

### Notificaciones

- Push web admin: VAPID + `PushSubscription` table.
- Slack/Discord: webhook URL en `AdminSetting.slack_webhook_url`.
- **Matriz por evento** en `/admin/insights/notifications`: cada evento
  (`proposal_received`, `search_no_results`, `recommender_query`,
  `carmen_session`, `stock_critical`) tiene toggle push/Slack independientes.

## 8. Integraciones de proveedores

Los 3 proveedores tienen panel unificado en `/admin/suppliers/<code>`:
- Estado de credenciales en env (verde/ámbar)
- Botón "Probar conexión" → endpoint ligero del proveedor
- Toggle de modo (sandbox↔producción o live↔simulación) persistido en
  `AdminSetting`, alternable sin redeploy
- Sub-herramientas específicas según el proveedor

### MidOcean (`api.midocean.com`)

- API REST con header `x-Gateway-APIKey`
- Sync activo: productos, stock, precios
- 2.403 productos en BD
- Cliente: `src/lib/suppliers/midocean.ts` (sync) + `midocean-orders.ts` (POST orders)
- Panel: `/admin/suppliers/midocean`
- **Toggle live orders sin redeploy** vía `AdminSetting.midocean_live_orders`
  (sobreescribe el env `MIDOCEAN_LIVE_ORDERS`). Helper:
  `src/lib/suppliers/midocean-mode.ts` con cache 60s.
- Env críticas: `MIDOCEAN_API_KEY`, `MIDOCEAN_CUSTOMER_NUMBER`, `MIDOCEAN_API_BASE`

### Makito legacy (`data.makito.es`)

- API REST con email/password (Laravel Sanctum)
- Feeds XML con token URL
- 4.450 productos en BD
- Cliente: `src/lib/suppliers/makito.ts`
- Sigue convivieron con la API B2B nueva (canales independientes)

### Makito API B2B oficial (`apis.makito.es`) — NUEVO

- Cliente: `src/lib/suppliers/makito-b2b.ts`
- Auth JWT vía POST `/access/auth/login`
- Rate limit propio del proveedor: 100 capacidad / 25 per minute (`src/lib/suppliers/token-bucket.ts`)
- Modo activo (sandbox|production) persistido en `AdminSetting.makito_b2b_mode`
- Panel: `/admin/suppliers/makito` con toggle sandbox↔prod sin redeploy
- Endpoints disponibles: `/catalog/files`, `/stock/files`, `/price-list/files`,
  `/orders`, `/orders/countries`, `/orders/regions`, `/orders/colors`
- Estado:
  · **Fase 1 completa** (auth + rate limiter + test endpoint)
  · **Fase 2 discovery** (panel admin descubre formato de /catalog/files,
    /stock/files, /price-list/files, /print-config/files sin tocar BD)
  · Fase 3 (parser + UPSERT real) pendiente — diseño tras ver shape Fase 2
  · Fase 4 (pedidos via POST /orders) pendiente

### Cifra (`api.cifrashop.com`)

- API REST con token UUID en path: `/products/<TOKEN>`
- 2.497 productos en BD
- Cliente: `src/lib/suppliers/cifra.ts` (fetch + ping + diagnoseProducts)
- Panel: `/admin/suppliers/cifra` + subpáginas `/quote` y `/marking-rates`
- **Stock = 0% en producción** (problema conocido). Para diagnosticar:
  abre `/admin/suppliers/cifra` y pulsa "🔬 Diagnosticar stock" — descarga
  catálogo entero y reporta % con stock + muestra de 5 productos. Si todos
  `quantity = 0`, el problema viene del proveedor (token caducado o cambio
  de formato).
- Env: `CIFRA_API_TOKEN`, `CIFRA_API_BASE`, `CIFRA_LANG`

### Reglas de seguridad de proveedores

- 🔒 `rule_no_supplier_exposure`: NUNCA mencionamos a MidOcean/Makito/Cifra
  en copy público. UI muestra solo `internalRef` (STM-XXX), nunca
  `supplierRef` (MO-XXX).
- 🔒 Imágenes proxy via `/api/m/<hash>` — nunca `cdn1.midocean.com`,
  `imgresources.makito.es` ni `publicatalogue.com` directo.
- 🔒 Credenciales solo en `/docker/startidea-merch/.env` del VPS, jamás en repo.

## 9. Dashboard compartible read-only

- URL: `/share/dashboard/<token>`
- Token: HMAC SHA-256 firmado, formato `scope.expiry.signature`
- Scopes: `summary` (solo KPIs) y `full` (+ top productos + categorías)
- TTL: 1-180 días configurable
- Secret: `DASHBOARD_SHARE_SECRET` (con fallback a `NEXTAUTH_SECRET`)
- Generador: botón "🔗 Compartir" en `/admin/insights`
- Verificación: `verifyShareToken()` con `crypto.timingSafeEqual`
- NO incluye: acciones, alias, errores, integraciones, secrets

## 10. PDF ejecutivo

- Endpoint: `/api/admin/insights/export-pdf`
- Generador: `@react-pdf/renderer` server-side
- Adjunto en email digest semanal (`insights-digest.yml`)
- Botón "📄 PDF ejecutivo ↓" en `/admin/insights`

## 11. Tests

```bash
pnpm test            # run all
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage v8
```

Cobertura actual (mínima, módulos críticos):
- `dashboard-share.test.ts` — HMAC sign/verify, expiry, tampering
- `compare.test.ts` — deltaPct edge cases, presets de rangos
- `token-bucket.test.ts` — rate limiter, refill, capacity cap

CI no corre tests aún (TODO: añadir step `pnpm test` a `ci.yml`).

## 12. Comparación de periodos

- Página: `/admin/insights/compare?preset=30d`
- Presets: 7d, 30d, 90d, month_to_date, previous_month
- Métricas exactas (timestamp): búsquedas, recommender, propuestas, errores
- Métrica aproximada: productos vistos únicos (lastViewedAt en rango)
- Semáforo invertido para errores (deltaPct positivo = rojo)

## 13. Acciones one-click sugerencias

- Endpoint: `/api/admin/insights/apply-suggestion`
- Switch sobre `actionId` → ejecuta + log en `SuggestionActionLog`
- Snooze: `SuggestionSnooze` por suggestion id + duración
- UI: cards en `/admin/insights#sugerencias`

## 14. Páginas críticas y dependencias

| Página | Necesita | Si rompe |
|---|---|---|
| `/admin/insights` | BD + helpers `getCatalogHealth/Funnel/...` | dashboard vacío |
| `/admin/suppliers/makito` | env MAKITO_B2B_* presentes | test conexión 400 |
| `/share/dashboard/[token]` | `DASHBOARD_SHARE_SECRET` consistente | 404 en URLs viejas |
| `/admin/insights/errors/[id]` | ErrorEvent en BD | 404 esperado |
| `/recomendador` | OPENROUTER_API_KEY | recomendador roto |

## 15. Runbook de emergencia

### La web entera devuelve 502 / 503

1. SSH al VPS: `ssh root@72.61.195.108`
2. `docker compose ps` — ver estado merch-app y merch-db
3. `docker compose logs --tail=200 app` — ver últimos errores
4. Si la app está parada: `docker compose up -d app`
5. Si la BD está parada: `docker compose up -d db && sleep 5 && docker compose up -d app`
6. Si nada arranca: ver `htop` y `df -h` — VPS bajo presión o disco lleno
7. Telegram al equipo si pasa de 5 min

### Deploy quedó pillado / a medias

1. `gh run view <runId> --log` → ver dónde se cayó
2. SSH al VPS, `docker compose ps` para ver si la app vieja sigue corriendo
3. Si la imagen nueva ya se construyó: `docker compose up -d app`
4. Si no: `cd /docker/startidea-merch && git pull && docker compose build app && docker compose up -d app`

### Anomalía push a las 4 AM y nada está mal

1. Ir a `/admin/insights#sugerencias`
2. Snooze 24h la anomalía falsa
3. Revisar baselines en `MetricSnapshot` por si el cron horario falló y dejó
   datos sesgados

### Sospecho que un cron no se está ejecutando

1. `gh run list --workflow=<workflow>.yml --limit 5` (si es GH Actions)
2. SSH y `crontab -l` + `cat /etc/cron.d/*` (si es cron host)
3. Buscar log: `journalctl -u cron --since "1 hour ago"`

### VPS rechaza SSH "broken pipe" tras un incidente

Patrón observado **2026-06-04**: 3 sitios distintos del VPS (`merchandising.startidea.es`,
`startidea.es`, `tresmilmillonesdelatidos.es`) devolvieron **404** simultáneamente
durante ~3 horas. SSH al puerto 22 conecta pero los comandos rechazan con
`Connection reset by peer` / `client_loop: send disconnect: Broken pipe`.
4 deploys consecutivos fallaron en ~2 min con exit code 255.

**Diagnóstico**: VPS saturado (proxy Coolify degradado) — NO es un problema del código.

**Qué hacer**:

1. **NO** hacer `systemctl restart docker` (memoria incidente 2026-05-24: causó load 717).
2. **NO** reintentar push (más deploys saturan más).
3. Verificar alcance: ¿solo un sitio o todos? `curl -I https://hubstartidea.es` para
   ver si OTRO sitio del mismo VPS responde — si sí, problema localizado a un container.
4. Si los 4 sitios + SSH están KO → esperar 10-15 min, la recuperación suele ser natural.
5. Si tras 30 min sigue KO → reboot suave desde panel Hostinger.
6. Tras recuperación, `gh run rerun <id>` de los workflows fallidos para limpiar historial.

**Síntoma típico del cron watchdog en este caso**:
`curl: (28) Failed to connect to merchandising.startidea.es port 443 after 135000 ms`.

## 16. Contactos

- **Owner**: Mario Pablo Barrón ([mariopablobarron@gmail.com](mailto:mariopablobarron@gmail.com), tel +34 ...)
- **Empresa**: Startidea Málaga SL
- **Dominio**: hostinger-mcp (Hostinger DNS)
- **Bug tracker**: este doc + memoria Claude + `/admin/insights/errors`
- **Alertas críticas**: Telegram al admin

---

📝 *Cuando añadas algo nuevo (cron, env var, integración, página crítica),
actualiza esta sección. Si el doc tiene >2 semanas sin tocar y el sistema ha
cambiado, está desactualizado por defecto — léelo con escepticismo.*

---

## 17. Firewall vendor categorizations

`merchandising.startidea.es` fue marcado como "Malicious Websites" por varios
firewalls corporativos en mayo 2026 al ser dominio nuevo. Trabajo de recategorización
en marcha desde finales de mayo.

### Estado actual (2026-06-04)

| Vendor | Estado | Vía que funcionó | Categoría asignada |
|--------|--------|------------------|---------------------|
| **Symantec / BlueCoat WebPulse** (Broadcom) | ✅ recategorizado | Form web `sitereview.bluecoat.com` — submission **#25880941** (2026-06-01) | Business / Shopping |
| **McAfee / Trellix** | ✅ recategorizado | Form web `sitelookup.mcafee.com` (2026-05-30) | Marketing / Merchandising / Business / Shopping |
| **Webroot / BrightCloud** (OpenText) | ✅ recategorizado | Email a `brightcloud-support@opentext.com` — Case **#03251303** (2026-06-01) → resp. de `sleszczynski@opentext.com` | Shopping |
| **Trend Micro Site Safety** | 🟡 pendiente | Form web `global.sitesafety.trendmicro.com` (email `ratingrequest@trendmicro.com` ❌ 554 Invalid-Recipient) | Sugerida: Shopping |
| **Fortinet FortiGuard** | 🟡 pendiente | Form web `fortiguard.com/webfilter` (email `webfilter@fortinet.com` aún sin respuesta) | Sugerida: Shopping (49) / Business (29) |
| **Sophos** | 🟡 pendiente | Form web `secure2.sophos.com/.../web-categorization-request.aspx` (emails `weblabs@sophos.com` ❌ 550 + `support@sophos.com` ❌ auto-rejected) | Sugerida: Shopping |
| **Forcepoint CSI** | 🟡 pendiente | Form web `csi.forcepoint.com` (email `support@forcepoint.com` ❌ "Support service requests cannot be opened by email") | Sugerida: Shopping / Business and Economy |
| **Cisco Talos / Umbrella** | 🟡 pendiente | Form web `talosintelligence.com/reputation_center` (email `talos@cisco.com` ❌ MAILER-DAEMON) | Sugerida: Shopping / Business Services |

### Aprendizajes operativos

- **El canal email NO funciona para 5 de 8 vendors**. Los buzones técnicos rebotan (550/554) o se auto-rechazan ("use support portal"). **Siempre usar form web** como vía primaria. Email solo como respaldo para `brightcloud-support@opentext.com`.
- Mencionar en cada submission las 2 recategorizaciones ya confirmadas (Symantec #25880941, Webroot Case #03251303) acelera la revisión humana del nuevo vendor.
- Drafts re-usables listos para copy-paste: `~/Desktop/firewall-recategorizacion-2026-06-04.md`
- Plazos típicos de propagación: 24h-7d según vendor.

### Cómo medir impacto

Si un cliente reporta bloqueo: pregunta qué firewall usan, mira esta tabla, y le confirmas
si el vendor ya está resuelto. Si el vendor está pendiente, ofrece como prueba temporal el
form web del propio cliente: `csi.forcepoint.com` y `sitereview.bluecoat.com` permiten al
admin del firewall del cliente forzar la recategorización en su tenant.
