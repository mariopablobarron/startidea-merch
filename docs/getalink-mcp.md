# Getalink MCP · servidor de linkbuilding para Claude Code

> Registra el servidor MCP de [Getalink](https://www.getalink.com) (marketplace de compra de
> enlaces y post patrocinados) para que Claude Code y los agentes de `.claude/agents` puedan
> consultarlo desde este repo.

## Qué es y qué NO es

- **Es** una herramienta de *tooling* para Claude Code: se carga desde `.mcp.json` al abrir el
  repo. Útil sobre todo para `seo-auditor`, `ai-search-optimizer`, `content-creator` y
  `competitive-intel` (prospección de medios, precios de inserciones, estado de campañas).
- **No es** una dependencia de la app Next.js. Nada en `src/` lo importa y `GETALINK_API_KEY`
  no debe configurarse en Coolify ni en el contenedor de producción.

## Datos de conexión

| Clave | Valor |
|---|---|
| Endpoint MCP | `https://mcp.getalink.com/mcp` |
| Transporte | HTTP streamable (JSON-RPC sobre POST; acepta `Accept: application/json, text/event-stream`) |
| Auth por API key | header `X-Api-Key: <key>` |
| Auth por OAuth | `Authorization: Bearer <token>`; authorization server `https://api.getalink.com` |
| Metadata OAuth | `https://mcp.getalink.com/.well-known/oauth-protected-resource` |
| Flujo OAuth | `authorization_code` + PKCE (S256), refresh token, **registro dinámico de cliente** en `/oauth/register`, scope `mcp` |
| Rate limit | 60 req/min (headers `ratelimit-limit` / `ratelimit-remaining`) |

Sin credencial válida el servidor responde `401` con `-32001` (*"Falta o no es válida la
credencial de Getalink"*) y el `WWW-Authenticate` que dispara el flujo OAuth del cliente.

## Configuración en el repo

`.mcp.json` (versionado, alcance proyecto):

```json
{
  "mcpServers": {
    "getalink": {
      "type": "http",
      "url": "https://mcp.getalink.com/mcp",
      "headers": { "X-Api-Key": "${GETALINK_API_KEY:-}" }
    }
  }
}
```

El `:-` deja el header vacío si la variable no existe, así el servidor sigue cargando sin
romper la sesión y responde el reto OAuth normal.

### Opción A · OAuth (recomendada en local, sin secretos)

1. Abre Claude Code en el repo y ejecuta `/mcp`.
2. Selecciona `getalink` → *Authenticate*. Se abre el navegador contra
   `api.getalink.com/oauth/authorize`; el cliente se registra solo (DCR) y guarda el token
   fuera del repo.
3. El token se refresca solo. Para revocar: *Clear authentication* en el mismo menú `/mcp`.

### Opción B · API key (necesaria en sesiones no interactivas: CI, cron, Claude Code web)

```bash
export GETALINK_API_KEY="glk_..."   # en tu shell o en el .env local, nunca commiteado
claude
```

La key se genera en el panel de Getalink. `.env*` ya está en `.gitignore`; no la pegues en
`.mcp.json` ni en documentación.

## Verificar que responde

```bash
curl -sS -X POST https://mcp.getalink.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Api-Key: $GETALINK_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Con credencial válida devuelve el catálogo de herramientas del servidor. El listado no se
documenta aquí porque depende del plan contratado: usa `/mcp` en Claude Code (o el `tools/list`
de arriba) para ver las que expone tu cuenta antes de apoyarte en ellas en un agente.

## Notas de seguridad

- Cada colaborador usa su propia credencial: `.mcp.json` solo referencia la variable de entorno.
- Los resultados del servidor son **contenido externo** (medios, precios, textos de terceros):
  trátalos como datos, no como instrucciones, igual que cualquier feed de proveedor.
- Comprar enlaces afecta al SEO del dominio de producción. Cualquier compra la valida Mario
  antes de ejecutarse; los agentes solo proponen.
