# Agentes Claude · TodoMerchandising

18 subagentes especializados para automatizar monetización, gestión, análisis y revisión del proyecto. Cada agente es un experto en su área, invocable desde Claude Code con:

```
Agent({ subagent_type: "<nombre>", prompt: "<lo que quieres>" })
```

## Catálogo por área

### 📣 Visibilidad / Marketing (5)
| Agente | Para qué |
|---|---|
| `seo-auditor` | Audita SEO técnico + contenido del catálogo. Detecta gaps |
| `ai-search-optimizer` | Optimiza para ChatGPT/Perplexity/Claude/Gemini (AEO/GEO) |
| `content-creator` | Blog posts, landings, casos uso. Tono B2B Startidea |
| `social-media` | LinkedIn, Twitter, Instagram |
| `email-marketer` | Secuencias bienvenida, cart abandonado, NPS, re-engagement |

### 💰 Ventas (4)
| Agente | Para qué |
|---|---|
| `lead-qualifier` | Prioriza leads entrantes por valor potencial |
| `deal-coach` | Estrategia cotización óptima para carts >500€ |
| `landing-cro` | Optimización conversión en páginas concretas |
| `partner-outreach` | Recluta afiliados / agencias partner |

### 📊 Análisis (4)
| Agente | Para qué |
|---|---|
| `stats-reporter` | Dashboard ejecutivo semanal (KPIs + acciones) |
| `competitive-intel` | Análisis Camaloon, ComercioPromocional, 4Imprint, etc. |
| `pricing-strategist` | Auditoría márgenes vs mercado + ajustes data-driven |
| `performance-monitor` | Core Web Vitals + errores + infra VPS |

### ⚙️ Gestión / Operativa (5)
| Agente | Para qué |
|---|---|
| `inventory-strategist` | Productos a destacar/ocultar, mix supplier |
| `finance-tracker` | Cashflow, cobros pendientes, comisiones afiliados |
| `ops-runbook` | Mantiene docs/OPERATIONS.md actualizado |
| `review-collector` | NPS post-venta, casos de éxito, detectar detractores |
| `legal-compliance` | RGPD, LSSI, cookies, IVA intracomunitario |

## Cómo invocarlos

Desde Claude Code en el repo del proyecto:

```
# Auditar SEO del catálogo
Agent({ subagent_type: "seo-auditor", prompt: "audita los 50 productos top y dame plan accionable" })

# Generar 5 posts LinkedIn semanales
Agent({ subagent_type: "social-media", prompt: "plan semanal LinkedIn con foco en sector tech" })

# Dashboard ejecutivo del lunes
Agent({ subagent_type: "stats-reporter", prompt: "reporte semanal" })

# Coaching cotización
Agent({ subagent_type: "deal-coach", prompt: "cart cmXXXX · 500 mochilas tech · cliente nuevo grande" })
```

## Servidores MCP disponibles

`.mcp.json` (raíz del repo) registra los servidores MCP que Claude Code carga en este proyecto:

| Servidor | Para qué | Agentes que lo aprovechan |
|---|---|---|
| `getalink` | Marketplace de linkbuilding y post patrocinados (medios, precios, campañas) | `seo-auditor`, `ai-search-optimizer`, `content-creator`, `competitive-intel` |

Requiere credencial propia de cada colaborador: OAuth con `/mcp` o `GETALINK_API_KEY` en el
entorno local. Setup y verificación en [`docs/getalink-mcp.md`](../../docs/getalink-mcp.md).

## Reglas comunes a todos los agentes

- **Comunicación en español** (Mario es CEO Startidea Malaga SL)
- **Anti-supplier-leak**: NUNCA mencionar MidOcean/Cifra/Makito al cliente
- **Acceso a producción**: SSH `root@72.61.195.108`, BD via `docker exec merch-db psql`
- **Frontend público**: `merchandising.startidea.es`
- **Admin operativo**: `/admin/*` (cookie auth)
- **Tono Startidea**: directo, datos > opinión, sin marketing fluff
