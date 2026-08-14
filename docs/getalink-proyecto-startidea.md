# Ficha de proyecto Getalink · TodoMerchandising

> Datos listos para dar de alta el proyecto en <https://app.getalink.com/proyectos> (o vía el MCP
> `getalink`, ver [`getalink-mcp.md`](./getalink-mcp.md)). Aquí solo está el **brief**: qué dominio,
> qué URLs se empujan y con qué anchors. Ninguna compra se ejecuta desde el repo.

## 1 · Dominio del proyecto — decidir antes de crear nada

| Opción | Dominio | Cuándo tiene sentido |
|---|---|---|
| **A (recomendada)** | `merchandising.startidea.es` | Es el dominio que sirve este repo y el que tiene que rankear para "merchandising corporativo", "regalos publicitarios", etc. Los enlaces llegan directos a la URL que convierte |
| B | `startidea.es` | Solo si el objetivo es la autoridad de marca del dominio raíz. El trasvase al subdominio es indirecto y más lento |
| C | Ambos | Dos proyectos separados en Getalink, con presupuesto y anchors distintos. Más caro, útil solo si se trabaja también la web corporativa |

**Pendiente de Mario**: confirmar A, B o C. El resto de la ficha asume **A**.

## 2 · Datos de alta

| Campo | Valor |
|---|---|
| Nombre del proyecto | TodoMerchandising (Startidea Malaga SL) |
| URL | `https://merchandising.startidea.es` |
| País / idioma | España / español |
| Tipo | E-commerce B2B · merchandising corporativo personalizado |
| Temáticas de medio objetivo | Marketing y publicidad · Empresa y negocios · RRHH y empleo · Sostenibilidad/RSC · Eventos · Tecnología |
| Propuesta diferencial (para el brief a redactores) | Merchandising corporativo con impacto social real: cada pedido genera trabajo digno en Centros Especiales de Empleo y empresas locales |

## 3 · URLs objetivo priorizadas

Prioridad = valor comercial × capacidad de la página para absorber un enlace editorial.

| Prio | URL | Intención de búsqueda que persigue |
|---|---|---|
| 1 | `/` | merchandising corporativo, regalos publicitarios personalizados |
| 1 | `/catalogo` | comprar merchandising personalizado para empresas |
| 2 | `/sectores/rrhh` | welcome pack empleados, regalos onboarding |
| 2 | `/sectores/rsc` | merchandising sostenible / con impacto social |
| 2 | `/sectores/eventos` | merchandising para ferias y congresos |
| 3 | `/sectores/tech` | merchandising para startups y empresas tech |
| 3 | `/sectores/aapp` | merchandising para administraciones públicas, licitaciones |
| 3 | `/sectores/retail` | merchandising para retail y punto de venta |
| 2 | `/recursos/merchandising-sostenible-empresas` | guía informacional — imán natural de enlaces |
| 2 | `/recursos/merchandising-producido-espana` | producción nacional, plazos y trazabilidad |
| 3 | `/recursos/merchandising-centro-especial-empleo` | ángulo RSC/CEE, encaja en medios de empleo e inclusión |
| 3 | `/recursos/calendario-regalos-corporativos` | estacional (Navidad, ferias) — enlazar 2-3 meses antes |
| 3 | `/recursos/guia-pantone-serigrafia-corporativa` | técnico, encaja en medios de diseño |
| 4 | `/blog/<post>` | apoyo temático del post que se esté empujando |

No enlazar: `/clientes` (portal privado, `noindex`), `/admin/*`, `/carrito`, `/cesta`, `/pay`,
`/cotizar`, `/afiliado`, `/proof`, `/share`.

## 4 · Anchors

Reparto sano para no disparar sobre-optimización: **~50 % marca/URL, ~30 % genérico/long-tail,
~20 % exacto**.

- **Marca**: TodoMerchandising · Startidea · merchandising.startidea.es
- **Genérico / long-tail**: "empresas de merchandising corporativo en España", "cómo elegir el
  regalo de empresa", "proveedores de merchandising con impacto social", "regalos de empresa
  sostenibles", "en esta guía"
- **Exacto (con cuentagotas)**: "merchandising corporativo", "regalos publicitarios
  personalizados", "merchandising sostenible para empresas", "welcome pack empleados"

Nunca usar como anchor ni mencionar en el contenido patrocinado a los proveedores
(MidOcean, Cifra, Makito): es información interna, igual que en el resto del site.

## 5 · Criterios de compra

- Medios en **español y con tráfico real en España**; descartar redes de PBN y medios sin
  histórico.
- Preferencia por medios de **empresa, marketing, RRHH, sostenibilidad y economía local**
  (Málaga/Andalucía suma para el ángulo local).
- Ritmo prudente: pocos enlaces al mes y variando URL objetivo y anchor, no todo a home.
- Guardar de cada compra: medio, URL publicada, URL objetivo, anchor, fecha y coste — para poder
  medir después contra Search Console.

## 6 · Qué falta para ejecutarlo

El alta del proyecto no se puede hacer desde una sesión no interactiva de Claude Code: el
servidor MCP de Getalink exige credencial y aquí no hay ninguna. Con la credencial puesta
(`GETALINK_API_KEY` o `/mcp` → *Authenticate*), el flujo es: listar herramientas del servidor,
crear el proyecto con los datos de §2 y cargar las URLs objetivo de §3.
