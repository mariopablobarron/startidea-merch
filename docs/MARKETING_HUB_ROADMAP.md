# Marketing Hub — Roadmap completo

**Objetivo de negocio**: convertir TodoMerchandising en una máquina B2B de captación,
venta y posicionamiento orgánico/pagado, con todo orquestable desde el panel admin.

**Stack actual ya construido y útil** (no rehacer):

| Pieza | Estado | Uso futuro Marketing Hub |
|---|---|---|
| CMS Copy del Hero | ✅ | Editar copy de landings de campaña |
| Override por producto | ✅ | Productos pillar para campañas |
| Banners promocionales por slot | ✅ | Anclar campañas a banner home/cat |
| Email broadcasts manuales | ✅ | Newsletter mensual / promo / launch |
| Drip automático abandoned cart | ✅ | Funnel base ya activo |
| CRM clientes con LTV/segmentos | ✅ | Audiencias lookalike Meta + LinkedIn |
| Analytics business (revenue, top productos) | ✅ | Atribución básica |
| Portfolio "Trabajos realizados" | ✅ | Material para casos en LinkedIn / Reels |
| Editor SEO por página | ✅ | Optimización landings de campaña |
| Tour guiado | ✅ | Onboarding leads que llegan de paid |

**Por construir** (8 fases, en orden de ROI):

---

## Fase 1 · Content Studio (semana 1-2)

**Objetivo**: que el admin genere piezas completas (copy + creatividad)
en 1 click usando IA, con flujo de aprobación interno.

### Funcionalidades

1. **Generador de copy IA** anclado al manual de marca Startidea:
   - Input: tipo de pieza (LinkedIn post / IG caption / X tweet /
     Email subject / landing H1), tema, producto opcional, sector
   - Output: 3 variaciones por pieza con tono Startidea ("directo,
     sin disfraz"), frase corta, sin jerga.
   - Usa OpenRouter (ya configurado, Claude Sonnet 4.5 o GPT-4).

2. **Generador de creatividades**:
   - Plantillas HTML/SVG renderizadas a PNG con `sharp` (ya instalado).
   - 6 plantillas base: post cuadrado, story 9:16, banner web, header email,
     LinkedIn post horizontal, carrusel 1080×1080.
   - Variables: producto image, nombre, precio desde, color marca, claim.
   - Generación IA: si quiere fondo abstracto magenta, llama a DALL·E 3 /
     Stable Diffusion XL vía Replicate ($0.0023/imagen).

3. **Generador de videos cortos** (avanzado — Fase 1.5):
   - Reels 15-30s de mockup del producto rotando + texto + música stock.
   - Opción A: Remotion (React → mp4) — self-hosted, gratis pero CPU.
   - Opción B: Runway API o Pika API (~$0.05-0.30/segundo).
   - Recomiendo Remotion para empezar (cero coste marginal).

4. **Banco de mockups**:
   - Ya tenemos `MockupGenerator` (sharp + AI overlay logo).
   - Ampliarlo a 12 mockups lifestyle (oficina, evento, persona vistiendo).

5. **Workflow aprobación**:
   - Estados: `DRAFT` → `REVIEW` → `APPROVED` → `SCHEDULED` → `PUBLISHED`.
   - Modelo `ContentPiece` (type, channel, copy, creativeUrl, productSlug,
     status, scheduledAt, publishedAt, channelResponse, createdBy, approvedBy).
   - CEO + COMERCIAL crean DRAFT. CEO aprueba.
   - Versiones por edición (no pisan, snapshot).

6. **Calendario editorial**:
   - Vista mensual con piezas por canal/fecha.
   - Drag-and-drop para reprogramar.
   - Color-code por estado.

### Infraestructura

- Modelo Prisma `ContentPiece` + `ContentVariation`.
- API: `/api/admin/content` CRUD + generate IA endpoint.
- UI: `/admin/marketing/content` (calendar + studio panel).
- Coste: ~€100/mes OpenRouter para 200-300 piezas/mes.

---

## Fase 2 · Integración Metricool (semana 3)

**Objetivo**: programar y publicar piezas aprobadas en Instagram, Facebook,
LinkedIn, X, TikTok, YouTube, Pinterest sin salir del admin.

### Funcionalidades

1. **Conexión Metricool API**:
   - Plan Personal 33€/mes o Equipo 79€/mes.
   - API key en `.env` (`METRICOOL_API_KEY`, `METRICOOL_BLOG_ID`).
   - Endpoint `POST /api/v1/scheduler/posts` para programar.
   - Soporta 9+ redes nativamente.

2. **Sync de cuentas sociales**:
   - Admin → Marketing → "Cuentas conectadas".
   - Toggle por red social (alguna falla → no bloquea otras).

3. **Push de piezas aprobadas**:
   - Job que escucha `ContentPiece.status = APPROVED && scheduledAt <= now()`.
   - Llama a Metricool API con copy + media + canal + hora.
   - Marca `PUBLISHED` con `channelResponse` (ID externo + URL pieza).

4. **Pull de métricas**:
   - Cron diario que sincroniza alcance, engagement, clicks, conversiones
     por pieza desde Metricool.
   - Actualiza tabla `ContentMetric` (pieceId, channel, day, impressions,
     engagements, clicks, conversions).

5. **Atribución a pedidos**:
   - UTM params automáticos por pieza (`?utm_source=ig&utm_campaign=blackfriday-2026&utm_content=piece-id`).
   - Cross-reference con CartQuote.utm para LTV por pieza.

### Coste

- Metricool 33-79€/mes
- 0 coste extra de infraestructura

---

## Fase 3 · Meta Ads (Facebook + Instagram) (semana 4-5)

**Objetivo**: campañas pagadas en Meta gestionadas desde admin, con creatividades
generadas en Fase 1 y audiencias del CRM (Fase 4 Phase 4 ya hecha).

### Funcionalidades

1. **Setup**:
   - App Meta Business + business_management permission.
   - Meta Pixel + Conversions API (server-side, ya tenemos endpoint).
   - Acceso a Marketing API v18+.

2. **Audiencias custom**:
   - Lookalike de clientes con LTV > €1.000 (ya en CRM).
   - Retargeting visitantes 30d con interés (vieron 3+ fichas).
   - Excluir clientes activos (no quemar budget).

3. **Crear/pausar campañas desde admin**:
   - UI: `/admin/marketing/ads/meta`.
   - Objetivo: Leads / Conversions / Tráfico.
   - Budget diario, fecha inicio/fin.
   - 2-3 creatividades A/B por ad-set.

4. **Tracking conversiones**:
   - Eventos: PageView, ViewContent (ficha), AddToCart, Lead (cotización),
     Purchase (pago Stripe).
   - Server-side via Conversions API (más fiable que pixel solo).

### Budget mínimo recomendado

- €30-100/día = €900-3.000/mes para audiencia warm.
- ROAS típico B2B Meta: 2-4x tras optimización.

---

## Fase 4 · Google Ads (semana 6-7) — ⭐ ALTO ROI B2B

**Objetivo**: aparecer en búsquedas de intención alta como
"merchandising corporativo", "regalos empresa", "camisetas
personalizadas empresa madrid". Search Ads >> Display en B2B.

### Funcionalidades

1. **Setup**:
   - Google Ads API + acceso developer token.
   - Conversion tracking unified con GA4 + Conversions Linker.

2. **Keywords B2B prioritarias** (recomendación inicial):
   ```
   Top intent (high CPC ~€2-5):
   - "merchandising corporativo"
   - "regalos empresa personalizados"
   - "camisetas empresa con logo"
   - "merchandising eventos empresa"
   - "proveedor merchandising madrid/barcelona/valencia"

   Mid intent (CPC ~€0.50-2):
   - "regalos para empleados navidad"
   - "kit bienvenida empleados"
   - "merchandising sostenible empresa"
   - "regalos publicitarios baratos"

   Long-tail (CPC ~€0.20-0.80):
   - "termos personalizados empresa precio"
   - "mochilas recicladas con logo empresa"
   - "merchandising centros especiales empleo"
   ```

3. **Landings dedicadas por keyword cluster**:
   - `/empresa/textil-personalizado`
   - `/empresa/regalos-navidad`
   - `/empresa/merchandising-sostenible`
   - `/empresa/eventos-corporativos`
   - Cada landing: H1 keyword-rich + form rápido + testimonios + CTA único.

4. **Bidding strategy**:
   - Empezar Maximize Conversions con cap.
   - Tras 30 conversiones → Target CPA.

### Budget mínimo recomendado

- €50-200/día search = €1.500-6.000/mes.
- ROAS típico B2B Google Search: 3-8x.

---

## Fase 5 · LinkedIn Ads (semana 8-10) — ⭐⭐ #1 PARA B2B

**Objetivo**: LinkedIn es el canal de mayor ROI B2B en España. Targeting
quirúrgico por sector, cargo, tamaño empresa.

### Funcionalidades

1. **Setup**:
   - LinkedIn Campaign Manager.
   - Insight Tag instalado en web (similar a Meta pixel).
   - LinkedIn Marketing API.

2. **Audiencias B2B**:
   - **Por cargo**: Director RRHH, Director Marketing, Head of People, Office Manager, Event Manager, Compras.
   - **Por tamaño empresa**: 50-200 empleados (sweet spot ticket €1k-5k), 200-1000, 1000+.
   - **Por sector**: tech, consultoría, banca, retail, educación, eventos.
   - **Geografía**: España + Portugal + LATAM hispano.

3. **Formatos prioritarios**:
   - **Lead Gen Forms** (B2B clave — captura sin salir de LinkedIn).
   - **Sponsored Content** (carruseles de casos reales `/trabajos`).
   - **InMail patrocinado** (cuando tienes producto premium o launch).

4. **Lead magnets**:
   - "Guía: 7 errores al pedir merchandising corporativo" (PDF).
   - "Calculadora ROI campaña corporate gifts" (web tool).
   - "Plantilla brief de merch para evento" (Google Doc).

5. **Sync leads → CRM**:
   - Webhook LinkedIn Lead Gen Forms → POST /api/leads.
   - Crea CartQuote tipo "LEAD" y notifica Telegram.

### Budget mínimo recomendado

- €100-300/día = €3.000-9.000/mes (LinkedIn es caro).
- ROAS B2B LinkedIn: 3-10x con buena segmentación.

---

## Fase 6 · SEO Automation (semana 11-12)

**Objetivo**: 50+ posts/año generados con IA, optimizados para keywords B2B,
con schema.org y backlinks tracking.

### Funcionalidades

1. **Blog interno + sitemap dinámico**:
   - Modelo `BlogPost` (slug, title, body MD, hero, author, publishedAt,
     tags, schema JSON, status).
   - Ruta `/blog/[slug]` server-rendered con `revalidate=3600`.
   - Sitemap `/sitemap.xml` lista todos los posts publicados.

2. **Generación IA por brief**:
   - Admin define brief: keyword target, intent (informational / transactional),
     longitud (1.500-2.500 palabras), tono.
   - Genera con OpenRouter (Claude Sonnet 4.5 es bueno para long-form).
   - Estructura: H1 + 4-6 H2 + listas + CTA + FAQ schema.

3. **Optimización on-page automática**:
   - Meta title/description sugerido por IA.
   - Internal links a productos y categorías relevantes (lookup semántico
     con embeddings ya tenemos).
   - Schema.org `Article` + `FAQPage` si tiene FAQ.

4. **Keyword tracking**:
   - Integración Google Search Console API (gratis).
   - Cron diario: posiciones top 100 keywords objetivo.
   - Alertas si caen >5 posiciones.

5. **Topics inicial** (templates para empezar):
   - "Qué es el merchandising corporativo y cómo elegirlo"
   - "Guía completa de técnicas de marcaje [serigrafía vs bordado vs DTF]"
   - "10 ideas regalo empresa navidad 2026"
   - "Cómo calcular el ROI de una campaña de regalos corporativos"
   - "Merchandising sostenible: certificados que importan"
   - "Welcome pack empleados: qué incluir y por qué"
   - "Casos: cómo X empresa hizo su evento con Y producto"

### Coste

- ~€50-150/mes OpenRouter (5-10 posts/semana).
- Search Console API: gratis.
- (Opcional) Ahrefs/SEMrush API: €120-450/mes.

---

## Fase 7 · Email Outbound + Webinars (semana 13-14)

**Objetivo**: prospección B2B activa fuera de canales de pago.

### Funcionalidades

1. **Outbound campañas**:
   - Buscador prospectos: enriquecimiento via Apollo.io / Lusha / Findymail API.
   - Plantillas personalizadas por sector con merge tags (firstname, company).
   - Secuencias 3-5 emails con delay 3-7d.
   - Anti-spam: validar emails (NeverBounce/ZeroBounce API) antes de enviar.
   - Compliance RGPD: opt-out con doble lazo y registro de evidencia.

2. **Webinars trimestrales**:
   - "Tendencias merchandising corporativo 2026"
   - "Cómo medir el impacto real de tu campaña corporate gifts"
   - "Producción ética: qué preguntar a tu proveedor"
   - Integración con WebinarJam / Demio / Livestorm (~€39-99/mes).
   - Captura email → CartQuote tipo "WEBINAR_LEAD" + drip post-evento.

### Coste

- €100-300/mes enrichment + email validation.
- €40-100/mes webinar platform.

---

## Fase 8 · Analytics Unificado + Atribución (semana 15-16)

**Objetivo**: ver ROI por canal y campaña en una sola vista.

### Funcionalidades

1. **Dashboard atribución**:
   - Multi-touch attribution: primer touch, último touch, lineal, 40-20-40.
   - UTM tracking ya tenemos. Cruzar con CartQuote.utm + Payment.

2. **Conector Google Analytics 4 API**:
   - Sync diario eventos GA4 → tabla local.
   - Cruzar sessions con cartQuoteId via custom dimension.

3. **ROAS por canal/campaña**:
   - Cost (Meta + Google + LinkedIn APIs) / Revenue (Payment.PAID).
   - Ratio LTV/CAC por canal (clave para escalar).

4. **Alertas automáticas Telegram**:
   - CPA > X € en una campaña → pausar.
   - CTR < Y% en un ad → flag.
   - Conversion rate landing X < Z% → revisar copy.

---

## Stack técnico recomendado

### APIs externas

| Servicio | Coste/mes | Imprescindible |
|---|---|---|
| **Metricool** (programación 9+ redes) | 33-79€ | ✅ |
| **Meta Marketing API** | gratis | ✅ |
| **Google Ads API** | gratis | ✅ |
| **LinkedIn Marketing API** | gratis | ✅ |
| **OpenRouter** (Claude/GPT para copy + posts) | 100-300€ | ✅ |
| **Replicate** (Stable Diffusion XL para creatividades) | 30-100€ | 🟡 |
| **DALL·E 3 vía OpenAI** | 30-80€ | 🟡 (alternativa) |
| **Runway/Pika** (videos cortos) | 30-100€ | 🟢 (Fase 1.5) |
| **Google Search Console API** | gratis | ✅ |
| **GA4 API** | gratis | ✅ |
| **Apollo/Lusha** (enrichment outbound) | 49-149€ | 🟡 |
| **NeverBounce** (email validation) | 8€/10k | 🟡 |
| **Ahrefs / SEMrush** (SEO research) | 120-450€ | 🟢 |
| **WebinarJam/Demio** | 39-99€ | 🟢 |

**Total stack infra mínima**: ~150-500€/mes
**Budget ads recomendado**: 5.000-20.000€/mes (escalable según tracción)

### Modelos Prisma a añadir

```prisma
model ContentPiece {
  id            String   @id @default(cuid())
  type          ContentType  // POST, REEL, STORY, EMAIL, LANDING, AD
  channel       Channel      // IG, FB, LINKEDIN, X, TIKTOK, YOUTUBE, EMAIL, WEB
  status        ContentStatus // DRAFT, REVIEW, APPROVED, SCHEDULED, PUBLISHED
  copy          String   @db.Text
  copyVariations Json?       // alternativas IA
  creativeUrl   String?      // PNG/MP4 final
  productSlug   String?
  campaignId    String?
  campaign      Campaign? @relation(fields: [campaignId], references: [id])
  scheduledAt   DateTime?
  publishedAt   DateTime?
  channelResponse Json?      // ID y URL externos
  metrics       ContentMetric[]
  createdBy     String?
  approvedBy    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Campaign {
  id            String   @id @default(cuid())
  name          String
  objective     String   // leads, conversions, traffic, awareness
  channels      String[] // [meta, google, linkedin, email]
  budgetCents   Int?
  startsAt      DateTime
  endsAt        DateTime?
  status        CampaignStatus  // PLANNED, ACTIVE, PAUSED, ENDED
  pieces        ContentPiece[]
  adAccountIds  Json?    // {meta: "act_xxx", google: "123", linkedin: "456"}
  utmCampaign   String   @unique
  metrics       CampaignMetric[]
  createdAt     DateTime @default(now())
}

model ContentMetric {
  id         String   @id @default(cuid())
  piece      ContentPiece @relation(fields: [pieceId], references: [id])
  pieceId    String
  channel    String
  day        DateTime @db.Date
  impressions Int @default(0)
  reach      Int @default(0)
  engagements Int @default(0)
  clicks     Int @default(0)
  conversions Int @default(0)
  spendCents Int @default(0)
  @@unique([pieceId, channel, day])
}

model BlogPost {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  excerpt     String?
  bodyMd      String   @db.Text
  heroUrl     String?
  author      String?
  publishedAt DateTime?
  tags        String[]
  schemaJson  Json?
  status      String   @default("DRAFT")
  metrics     Json?    // GSC clicks, positions
  @@index([publishedAt])
  @@index([status])
}

enum ContentType { POST REEL STORY EMAIL LANDING AD CARRUSEL }
enum Channel { IG FB LINKEDIN X TIKTOK YOUTUBE EMAIL WEB GOOGLE_ADS META_ADS LINKEDIN_ADS }
enum ContentStatus { DRAFT REVIEW APPROVED SCHEDULED PUBLISHED FAILED }
enum CampaignStatus { PLANNED ACTIVE PAUSED ENDED }
```

---

## Estrategia de contenido recomendada (5 ejes editoriales)

| Eje | % esfuerzo | Objetivo | Canales |
|---|---|---|---|
| **1. Educacional B2B** ("Cómo elegir merch", "Técnicas de marcaje") | 30% | SEO + thought leadership | Blog, LinkedIn |
| **2. Casos reales** (galería /trabajos + entrevistas cliente) | 25% | Trust + conversión | LinkedIn, IG, Blog |
| **3. Tendencias sector** ("Eco-pack 2026", "Regalos hybrid work") | 15% | Posicionamiento experto | LinkedIn, X, Newsletter |
| **4. Backstage CEE** (producción social impact) | 15% | Diferenciación + propósito | IG Reels, TikTok |
| **5. Producto destacado** (push directo) | 15% | Venta corto plazo | IG, FB, Email broadcast |

### Cadencia recomendada (cuando todo esté en marcha)

| Canal | Frecuencia |
|---|---|
| LinkedIn (personal Mario + página empresa) | 4 posts/sem (eje 1+2+3) |
| Instagram feed | 4 posts/sem |
| Instagram stories | 10/sem |
| TikTok/Reels | 2-3/sem (eje 4 prioritario) |
| Blog SEO | 2-3 artículos/sem (eje 1) |
| Email broadcast | 1/quincena |
| LinkedIn newsletter | 1/mes |
| Webinar | 1/trimestre |

---

## ROI estimado a 12 meses (escenario realista)

| Mes | Tracción | MRR atribuible |
|---|---|---|
| 1-2 | Setup, primeros tests | €0 (inversión) |
| 3-4 | Google Search + Meta retargeting | €3-8k pedidos/mes |
| 5-6 | LinkedIn Ads + SEO empieza ranking | €8-20k/mes |
| 7-9 | SEO orgánico + lookalike Meta + outbound | €20-50k/mes |
| 10-12 | Maduración + escala canales ganadores | €50-120k/mes |

Asumiendo budget ads progresivo de €3k → €15k/mes y CAC blended €150-400 (ticket medio €1.5k-3k B2B).

---

## Mi recomendación de orden de ejecución

**Si solo puedes 1 fase próxima**:
→ **Fase 4 Google Ads** (alto intent, ROI rapidísimo en B2B España, complejidad media).

**Si puedes 2 fases**:
→ **Fase 1 Content Studio** + **Fase 4 Google Ads** (uno alimenta al otro).

**Si puedes invertir 2 meses completos**:
→ Fase 1 → Fase 2 (Metricool) → Fase 4 (Google) → Fase 5 (LinkedIn).
Sienta las bases. Después escalas con Fase 3 (Meta) y Fase 6 (SEO blog).

**Lo que NO recomiendo hacer ahora**:
- Construir tu propia herramienta de schedule (use Metricool, está resuelto).
- Generar videos IA antes de tener tráfico (sin volumen, no escala el coste).
- Outbound masivo antes de tener inbound (spam → daña marca).

---

## Decisión que necesito de Mario

1. **¿Budget mensual de ads que puedes asignar desde mes 3?** (mínimo viable €3k, sweet spot €10k).
2. **¿Tienes ya cuenta Meta Business + Google Ads + LinkedIn Campaign Manager?**
3. **¿Qué canales tienes activos hoy y con qué frecuencia publicas manualmente?**
4. **¿Hay alguien en el equipo dedicado a marketing además de ti, o lo gestionas tú?**
   - Si solo Mario → priorizar máxima automatización (Fase 1+6).
   - Si hay junior marketing → workflow de aprobación es clave (Fase 1+2).
5. **¿Quieres empezar por la Fase que más mueve la aguja (Google Ads, requiere budget) o por la que más automatiza (Content Studio, requiere tiempo)?**

Respóndeme y monto la siguiente fase concreta con código.
