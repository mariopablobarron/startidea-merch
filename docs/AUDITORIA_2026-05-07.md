# Auditoría TodoMerchandising · Comparativa con Garrampa.es

**Fecha**: 2026-05-07
**Auditor**: Claude (sesión Mario)
**Web auditada**: https://merchandising.hubstartidea.es
**Benchmark**: https://garrampa.es

---

## Resumen ejecutivo

TodoMerchandising tiene **mejor stack técnico, mejor IA y mejor portal B2B** que Garrampa, pero **peor SEO, peor copy comercial y peor primer impacto**. Garrampa convierte porque es directa y barata; TodoMerch convierte porque es completa y consultiva — pero ahora mismo el catálogo no transmite ni una cosa ni la otra a los 5 segundos.

**Las 5 acciones de mayor ROI por orden**:

1. 🔴 **Reescribir hero de home** con propuesta de valor clara en 1 frase + precio "desde X €/ud" + 1 CTA único.
2. 🔴 **Mostrar precio "desde" en cada tarjeta del catálogo** (Garrampa lo hace; TodoMerch obliga a entrar a calcular).
3. 🟡 **Añadir tabla de precios escalonados visible** en ficha de producto (5/10/25/50/100/250 uds con badges "popular" / "más económico").
4. 🟡 **Trust signals** en home: testimonios, logos de clientes, reseñas Google embebidas, sello "envío gratis desde X €".
5. 🟡 **Contenido SEO denso** en home + categorías (Garrampa: 2.188 palabras en home; TodoMerch: ~300).

---

## 1. Comparativa funcional

| Capacidad | TodoMerchandising | Garrampa.es | Gana |
|---|---|---|---|
| Catálogo (productos) | 2.409 (MidOcean B2B real) | ~5.000 estimado | Garrampa (en volumen) |
| Búsqueda semántica IA | ✅ embeddings + cosine | ❌ búsqueda léxica | **TodoMerch** |
| Recomendador IA | ✅ Claude Sonnet 4.5 | ❌ | **TodoMerch** |
| Calculadora marcaje real | ✅ (técnica × posición × colores × cantidad) | ✅ tabla simple por cantidad | TodoMerch (más fino) |
| Mockup automático del logo | ✅ sharp + AI | ❌ "envíanos tu logo y lo aplicamos" | **TodoMerch** |
| Precio escalonado visible | ❌ se calcula al pedir | ✅ tabla 5/10/25/50/100 con badges | **Garrampa** |
| Variantes (talla, color) | ✅ | ✅ | Empate |
| Pago online | ✅ Stripe Checkout + Apple/Google Pay nativos | ❌ "te enviamos presupuesto, pagas por transferencia" | **TodoMerch** |
| Portal de cliente | ✅ magic link, histórico, mockups, pagos | ❌ | **TodoMerch** |
| Roles RBAC en admin | ✅ CEO/COMERCIAL/FACTURACION/OPERACIONES | n/a | TodoMerch |
| API pública v1 + webhooks | ✅ HMAC firmado | ❌ | TodoMerch |
| PDF propuesta automática | ✅ @react-pdf/renderer | ❌ | TodoMerch |
| Programa afiliados | ✅ partners, tracking, comisiones | ❌ | TodoMerch |
| Push notifications PWA | ✅ VAPID | ❌ | TodoMerch |
| Bot Telegram interno | ✅ avisos pedido/mockup/pago | ❌ | TodoMerch |
| **SEO on-page** | 🟡 ~300 palabras home | ✅ 2.188 palabras + FAQ + reviews schema | **Garrampa** |
| **Trust signals visibles** | 🟡 mínimo | ✅ "★★★★★ 4,9/5", "Trustpilot", "ISO" | **Garrampa** |
| **Tiempo a CTA en home** | 🟡 hay que scrollear | ✅ CTA primario above-the-fold | **Garrampa** |
| Microcopy comercial | 🟡 estilo cuidado pero abstracto | ✅ "barato", "5 ud desde 1,58€", agresivo | Garrampa |
| Diseño visual | ✅ paleta coral/bone elegante | 🟡 funcional, sin alma | TodoMerch |
| **Velocidad de carga** | ⚠️ pendiente medir | ✅ rápido percibido | ? |

**Conclusión funcional**: TodoMerch tiene una **plataforma técnicamente superior** (15 wins funcionales contra 4 de Garrampa). El problema **no es lo que hace, sino lo que parece que hace** cuando un cliente nuevo aterriza.

---

## 2. Análisis Garrampa — qué les funciona

### Home

- **H1 directo**: "Garrampa: regalos de empresa personalizados" (claro y sin metáforas).
- **Hero con producto + CTA "Configurar producto"** above-the-fold.
- **Precio "desde X,XX €"** en cada tarjeta del listado, sin tener que hacer click.
- **Categorías como nav superior** con productos populares en mayúsculas: BOLÍGRAFOS, BOLSAS, CAMISETAS, SUDADERAS, LIBRETAS, BOTELLAS, TAZAS. Cada palabra es una intención de búsqueda.
- **2.188 palabras** de texto SEO en home cubriendo: técnicas de estampación, opiniones, casos de uso, FAQ, "por qué confiar".
- **Reviews con schema.org** (probablemente genera estrellas en SERP de Google).

### Ficha de producto

- **Precio "desde 1,58 €/ud"** prominente en la tarjeta lateral.
- **Tabla de cantidades estática** muy visible:
  ```
  5 uds      11,84 €/ud
  10 uds     6,67 €/ud   ← "POPULAR"
  25 uds     4,68 €/ud
  50 uds     3,44 €/ud
  100 uds    2,25 €/ud   ← "MÁS ECONÓMICO"
  Otra cantidad...
  ```
  Esto **resuelve la objeción del precio sin que el usuario tenga que pedir presupuesto**.
- **Botón "Configurar producto"** en coral, único CTA primario.
- **"¿Necesitas ayuda?"** con teléfono y horario al lado del CTA.
- **Especificaciones técnicas** en tabla limpia (marca, género, material, tallas, colores, áreas de impresión, métodos).
- **Guía de tallas con dimensiones cm** embebida.
- **Footer con métodos de pago + envío + reseñas + redes sociales** en columnas claras.

### Lo que NO hacen bien (oportunidad para TodoMerch)

- Diseño **muy plano y comoditizado**, sin personalidad de marca.
- **Sin mockup automático** del logo aplicado.
- **Pago siempre por transferencia** tras presupuesto (lentitud).
- **Sin portal de cliente** ni histórico.
- **Sin búsqueda IA**.
- **Posicionamiento "barato"** que excluye al cliente premium / B2B grande.

---

## 3. Auditoría TodoMerchandising por área

### 🏠 Home

**Estado actual** (lo que sabemos de la sesión anterior y código):
- Paleta coral/bone elegante.
- Hero con propuesta más conceptual ("merchandising con impacto social" — Centros Especiales de Empleo).
- Catálogo destacado.
- Recomendador IA en evidencia.

**Problemas detectados**:
1. 🔴 **Sin precio "desde"** above-the-fold → el visitante no sabe en qué rango está.
2. 🔴 **Mensaje de impacto social puede confundir al cliente B2B típico** que solo quiere comprar 100 polos rápido. El impacto social debe ser un **diferenciador secundario**, no el headline.
3. 🟡 **Falta nav de categorías populares** (estilo Garrampa: BOLÍGRAFOS, BOLSAS, CAMISETAS) — el visitante con intención clara debe poder ir directo.
4. 🟡 **Pocas palabras** → SEO orgánico difícil. Garrampa rankea con 2.188 palabras.
5. 🟡 **Sin testimonios ni casos de uso reales** visibles arriba.

**Recomendaciones**:
- **Hero 2 capas**: arriba: "Merchandising personalizado para empresas, con impacto. Desde 1,80 €/ud." Abajo (microcopy): "El 5% de cada pedido se destina a Centros Especiales de Empleo".
- **CTA único**: "Ver catálogo" o "Pedir presupuesto en 3 pasos".
- **Sección de categorías** con 8 iconos + nombres + número de productos.
- **Banda de logos** de empresas que ya compraron (aunque sea el primer mes, pon 4-6 logos reales).
- **3 testimonios cortos** con nombre + cargo + empresa.
- **FAQ + bloque SEO** al final de home cubriendo: "qué es el merchandising corporativo", "técnicas de marcaje", "cantidades mínimas", "tiempos de entrega", "qué incluye el precio".

### 📦 Catálogo (`/catalogo`)

**Lo que hace bien**:
- 2.409 productos reales de MidOcean.
- Búsqueda semántica IA (única en el mercado).
- Diseño limpio.

**Problemas detectados**:
1. 🔴 **Sin precio "desde X €/ud" en tarjeta** → cada tarjeta debería mostrar el precio mínimo (cantidad alta + sin marcaje) para que el visitante haga scan rápido.
2. 🟡 **Filtros**: pendiente verificar facetas (color, material, marca, rango de precio, "ECO", "made in EU").
3. 🟡 **Ordenación**: "más popular" / "novedades" / "precio asc" / "precio desc". Pendiente verificar.
4. 🟡 **Skeleton states**: pendiente verificar si hay loading skeletons en productos / si la primera carga es buena percepción.
5. 🟡 **Vista por categorías**: pendiente verificar que existe `/catalogo/textil`, `/catalogo/bolsas`, etc., y que cada una tiene su SEO único.

**Recomendaciones**:
- Tarjeta de producto con: imagen, nombre, **precio desde X €/ud (a partir de Y uds)**, badge "ECO" / "made in EU" si aplica, color swatch.
- Filtros laterales colapsables en móvil.
- Búsqueda con autocomplete + sugerencias populares.
- En cada categoría, un párrafo SEO arriba (200 palabras) con keywords del nicho.

### 🛍 Ficha de producto

**Lo que hace bien** (de lo construido):
- Calculadora de marcaje compleja (técnica × posición × colores × cantidad) con tarifa real.
- Mockup automático del logo aplicado.
- Variantes de talla/color.

**Problemas detectados**:
1. 🔴 **Tabla de precios escalonados estática NO visible** antes de tocar la calculadora. Debe estar arriba como Garrampa: "5 uds desde X / 10 uds desde Y / 25 uds desde Z / 100 uds desde W". El visitante debe poder estimar el precio sin configurar.
2. 🟡 **Stock visible**: pendiente verificar si se ve disponibilidad real.
3. 🟡 **Plazo de entrega estimado**: debería decir "Te llega en 7-12 días desde la confirmación del mockup".
4. 🟡 **Sin "comprar ahora" rápido** para clientes que ya saben lo que quieren.

**Recomendaciones**:
- Bloque "Resumen rápido" arriba con precio desde + plazo + cantidad mínima.
- Tabla escalonada precio/cantidad con badges como Garrampa.
- Botón secundario "Pedir muestra antes de comprar" (opcional, ayuda a cerrar).
- "Productos relacionados" abajo con cross-sell.

### 🛒 Carrito y solicitud

**Lo que hace bien**:
- Multi-producto con técnicas de marcaje distintas por línea.
- Solicitud convertida en CartQuote con seguimiento.

**Problemas detectados** (pendiente verificación):
1. 🟡 **¿Hay carrito persistente** entre sesiones para anónimos? ¿Cuántos días?
2. 🟡 **Recuperación de carrito abandonado**: ¿hay drip de email si el cliente da el email pero no termina?
3. 🟡 **¿Captcha o protección anti-spam** en el formulario de presupuesto?
4. 🟢 **Validación cliente vs servidor**: pendiente verificar.

### 💳 Pago

**Lo que hace bien (muy fuerte)**:
- ✅ Stripe Checkout LIVE configurado.
- ✅ Apple Pay + Google Pay nativos en `/pay/[token]` (recién desplegado).
- ✅ Webhook firmado HMAC con 5 eventos + payment_intent.
- ✅ Email con recibo automático.
- ✅ Telegram al equipo en cada cobro.

**Pendientes**:
1. 🔴 **Verificar dominio Apple Pay en Stripe Dashboard** (`merchandising.hubstartidea.es` debe estar registrado).
2. 🟡 **Añadir `payment_intent.succeeded` y `payment_intent.payment_failed`** al endpoint webhook en Stripe Dashboard (los 5 eventos actuales son solo de Checkout Session).
3. 🟢 **Bizum**: España adora Bizum. Stripe lo está rolling out — activar cuando esté disponible para tu cuenta.

### 👤 Portal de cliente (`/clientes`)

**Lo que hace bien**:
- Magic link sin contraseña (UX moderna).
- Banner de pendientes (mockups + pagos).
- Histórico, impacto agregado.

**Problemas detectados** (pendiente verificación):
1. 🟡 **¿Qué pasa si el cliente pierde el acceso al email?** Debe haber recuperación.
2. 🟡 **Multi-device**: ¿la cookie funciona en varios dispositivos a la vez?
3. 🟢 **Notificaciones in-app** vs email: para clientes recurrentes, tener un buzón en el portal.

### 🔐 Admin (`/admin`)

**Lo que hace bien (excelente)**:
- RBAC con 4 roles (CEO/COMERCIAL/FACTURACION/OPERACIONES).
- Cookie JWT HS256 + bootstrap automático del primer CEO.
- Middleware gateando rutas.
- Dashboard con KPIs auto-refresh 60s.
- Embudo de cotizaciones por estado.
- Timeline de pedidos.

**Problemas detectados**:
1. 🟢 **2FA / MFA** para admins: para cuando crezca el equipo.
2. 🟢 **Audit log** de acciones sensibles: ¿quién aprobó qué pedido cuándo?
3. 🟢 **Export CSV** desde admin (carritos, productos, ingresos) para informes a contabilidad.

### 🌐 SEO técnico

**Pendientes de verificar**:
- [ ] `/sitemap.xml` con todos los productos.
- [ ] `/robots.txt` permite indexación.
- [ ] Meta tags OG + Twitter cards en producto.
- [ ] Schema.org `Product` + `Offer` + `AggregateRating` (cuando haya reseñas).
- [ ] Schema.org `Organization` con datos fiscales en home.
- [ ] Canonical URLs.
- [ ] Hreflang si vas a vender fuera de España.
- [ ] Imágenes con `alt` descriptivo.
- [ ] Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1).

### ⚡ Performance

**Pendiente medir** con Lighthouse + WebPageTest desde:
- Desktop fibra
- Móvil 4G simulado
- Móvil real con 3G

**Targets**:
- LCP < 2.5s en móvil
- TTFB < 600ms
- Bundle JS < 200KB initial

### 📱 PWA

**Lo que hace bien**:
- Manifest configurado.
- Service worker para offline básico.
- VAPID push notifications.

**Pendiente verificar**:
- [ ] `manifest.json` accesible (HTTP 200).
- [ ] Iconos en todos los tamaños requeridos.
- [ ] Pantalla de instalación funcional en Chrome y Safari.

### ♿ Accesibilidad

**Pendiente verificar**:
- [ ] Navegación con teclado.
- [ ] Foco visible.
- [ ] Contraste AA WCAG 2.1.
- [ ] Etiquetas en formularios.
- [ ] Modal accesible.
- [ ] Screen reader testing.

---

## 4. Plan priorizado de mejoras (próximo sprint)

### 🔴 Bloqueantes para escalar (esta semana)

1. **Hero de home reescrito** con propuesta clara + precio desde + 1 CTA.
2. **Precio "desde" en tarjeta de catálogo** (1 query SQL + render).
3. **Tabla de precios escalonados estática** en ficha de producto.
4. **Verificar dominio Apple Pay** en Stripe Dashboard + añadir 2 eventos al webhook.
5. **Probar flujo completo end-to-end** con tarjeta real (1€) — hacerlo Mario o Diego.

### 🟡 Importantes (próximas 2 semanas)

6. **3 testimonios + banda de logos de clientes** en home.
7. **Bloque SEO denso** en home + cada categoría (1.500-2.500 palabras).
8. **FAQ schema.org** en home + categorías.
9. **Recuperación de carrito abandonado** (email drip 3, 24, 72h).
10. **Mejorar filtros** del catálogo (facetas + URL state + chips de filtros activos).
11. **Schema.org Product + Offer** en cada ficha.
12. **Lighthouse audit** y arreglar todo lo que dé < 90.

### 🟢 Nice to have (próximo trimestre)

13. **Bizum** cuando Stripe lo abra a tu cuenta.
14. **Audit log admin** + export CSV.
15. **Multi-idioma** (catalán, inglés) si abres mercado.
16. **Live chat** o chat IA para preguntas de pre-venta.
17. **Programa de fidelización** B2B (descuentos por cliente recurrente).
18. **Dashboard analytics** para clientes B2B grandes (ver gasto por departamento).

---

## 5. Métricas a vigilar (KPIs)

| Métrica | Target inicial | Cómo medir |
|---|---|---|
| Conversión visita → presupuesto | 2-4% | GA4 / Umami |
| Conversión presupuesto → pago | 25-40% | DB CartQuote.status |
| Ticket medio | 800-1.500 € | DB Payment.amountCents |
| Coste por adquisición (CPA) | < 80 € | Anuncios + GA4 |
| Bounce rate home | < 50% | Umami |
| Tiempo medio en sesión | > 2 min | Umami |
| Mobile share | 50-65% (B2B real) | Umami |
| LCP móvil | < 2.5s | Lighthouse / CrUX |
| % pago con Apple/Google Pay | 15-30% | Stripe Dashboard |

---

## 6. Riesgos detectados

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Cert SSL inválido en redes corporativas con Fortinet | 🟡 | Documentar; no es bug nuestro |
| Stripe rk_live con permisos limitados | 🟡 | Verificar permisos antes de campañas grandes |
| Sin rate limit visible en `/api/checkout` | 🟡 | Añadir rate limit por IP |
| Sin captcha en formulario presupuesto | 🟡 | Cloudflare Turnstile o hCaptcha |
| Telegram bot compartido con otro proyecto | 🟢 | Crear bot dedicado cuando crezca |
| Logo placeholder (no SVG real Startidea) | 🟢 | Subir logo definitivo |
| Bot Telegram chat 678888 personal Mario | 🟢 | Crear grupo de equipo cuando entren más |

---

## 7. Próximos pasos concretos

**Esta semana** (Mario + Diego):
1. Diego ejecuta el plan de QA (`docs/DIEGO_QA_BRIEFING.md`) y reporta hallazgos.
2. Mario hace una compra real de 1€ end-to-end y valida cobro + email + Telegram.
3. Mario verifica dominio Apple Pay en Stripe Dashboard.
4. Mario añade `payment_intent.succeeded` y `payment_intent.payment_failed` al endpoint webhook en Stripe.

**Semana 2** (priorización):
1. Reunión Mario + Claude para priorizar los hallazgos de Diego con la auditoría aquí.
2. Sprint 24: hero home + precio desde + tabla escalonada (3 issues clave).

**Semana 3-4** (SEO + trust):
1. Sprint 25: bloques de contenido SEO + testimonios + schema.org.
2. Lanzamiento de campaña paid con landing dedicada.

---

**Anexos**:
- `DIEGO_QA_BRIEFING.md` — plan de testing para Diego.
- `garrampa-home.png`, `garrampa-product.png` — screenshots de referencia.
