# Brief para Diego — QA TodoMerchandising

**Fecha**: 2026-05-07
**Web a probar**: https://merchandising.startidea.es
**Tiempo estimado**: 3–4 horas (sesión completa) o 30 min/día durante una semana
**Reportar a**: Mario (mariopablobarron@gmail.com / Telegram)

---

## Qué necesito de ti

Quiero que entres como si fueras un cliente potencial — un responsable de marketing de una empresa de 50 empleados que necesita 100 sudaderas con su logo para un evento. Rompe la web. Cuanto más bug encuentres, mejor.

**Lo importante no es ser exhaustivo, es ser despiadado.** Si algo te parece raro, lento, confuso o feo, anótalo. No filtres.

---

## Cómo reportar

Para cada hallazgo abre **una entrada** con este formato (Notion, Google Doc, mensaje de Telegram, lo que prefieras):

```
[BUG | UX | COPY | PERFORMANCE | SEO | A11Y]  ·  Severidad: 🔴 BLOQUEANTE | 🟡 IMPORTANTE | 🟢 MENOR
URL: https://merchandising.startidea.es/...
Navegador: Chrome 125 / Safari 17 / Firefox / mobile
Qué hago: paso 1, paso 2, paso 3
Qué pasa: ...
Qué esperaría: ...
Captura: (adjunta screenshot)
```

**Ejemplo bueno**:
```
[BUG] · 🟡 IMPORTANTE
URL: /catalogo?cat=textil
Navegador: Chrome móvil
Qué hago: 1) Filtro por "camisetas" 2) Pulso "ordenar por precio" 3) Toco la X del filtro
Qué pasa: el filtro no se quita, sigue mostrando solo camisetas
Qué esperaría: que vuelva a mostrar todas las categorías
```

**Ejemplo malo**: "El filtro está roto." ← no me sirve, no sé qué hiciste ni cuándo.

---

## Plan de pruebas (en orden)

### 1) Primera impresión (5 min, sin tocar nada)

Carga la home. Sin clicar nada todavía, contesta:
1. ¿Qué empresa es esta?
2. ¿Qué venden?
3. ¿A quién se dirigen (B2C, B2B, eventos…)?
4. ¿Por qué les compraría yo y no a Garrampa o Bumerang?
5. ¿Qué CTA principal ves?
6. **Tiempo de carga**: ¿se siente rápido (<2s) o lento?

Si no contestas con seguridad las preguntas 1–4, hay un problema de copy / posicionamiento. Anótalo como `[COPY]`.

---

### 2) Catálogo y búsqueda (30 min)

URL base: `/catalogo`

- [ ] Carga el catálogo. ¿Cuánto tarda en aparecer la primera fila de productos?
- [ ] Cuenta cuántos productos hay. (Debería decir 2.409.)
- [ ] **Filtros**: prueba a filtrar por categoría, color, precio. Cada filtro:
  - ¿Recarga toda la página o filtra en vivo?
  - ¿La URL cambia? (debería)
  - ¿El botón "X" o "limpiar" funciona?
  - ¿Se pueden combinar varios?
- [ ] **Búsqueda semántica**: pruébala con queries naturales:
  - "regalos para empleados de invierno"
  - "algo barato para un evento de 200 personas"
  - "sudaderas con cremallera negras"
  - "termos personalizables"
  - Resultados con typos: "sudadera ngra"
- [ ] **Ordenación**: precio asc, precio desc, novedades, más vendidos. ¿Funciona?
- [ ] **Paginación o scroll infinito**: ¿hay duplicados? ¿se reinicia al volver atrás?
- [ ] Resoluciones a probar: desktop 1920px, laptop 1440px, tablet 768px, móvil 375px (iPhone SE).

### 3) Ficha de producto (30 min)

Entra en al menos 5 productos distintos (textil, bolígrafo, taza, mochila, termo).

- [ ] **Imágenes**: ¿hay galería? ¿zoom? ¿cargan todas?
- [ ] **Variantes**: tallas, colores. Al cambiar variante, ¿la imagen cambia?
- [ ] **Calculadora de marcaje**:
  - Cambia técnica (serigrafía, DTF, bordado, láser) → ¿precio se actualiza?
  - Cambia colores de tinta (1, 2, 3, 4) → ¿precio se actualiza?
  - Cambia cantidad (10, 50, 100, 500) → ¿hay descuentos por volumen?
  - Cantidad mínima: ¿qué pasa si pones 1?
  - **Cantidad máxima**: ¿qué pasa si pones 99999? (debería avisar de stock o seguir calculando)
- [ ] **Mockup del logo**: ¿puedes subir una imagen y verla aplicada al producto? Sube:
  - Un PNG con transparencia (logo limpio)
  - Un JPG con fondo blanco
  - Un PDF
  - Un SVG
  - Una imagen enorme (10 MB)
  - Una imagen diminuta (50 px)
  - Un archivo que NO sea imagen (.docx, .zip)
- [ ] **Stock**: ¿se ve disponibilidad? ¿qué pasa si pides más unidades de las que hay?
- [ ] **Plazo de entrega**: ¿se ve estimado de fecha?
- [ ] **Añadir al carrito**: ¿confirma con animación/toast? ¿el icono del carrito se actualiza?

### 4) Carrito y solicitud de presupuesto (20 min)

- [ ] Añade 3 productos distintos con técnicas distintas.
- [ ] Modifica cantidades en el carrito → ¿precio se recalcula?
- [ ] Elimina un producto → ¿desaparece sin recargar?
- [ ] **Solicitar presupuesto**: rellena el formulario:
  - Datos completos válidos → debe enviarse
  - Email mal formado → debe rechazarlo en cliente
  - Teléfono con letras → ¿lo acepta?
  - Mensaje vacío → ¿lo acepta?
- [ ] Tras enviar:
  - ¿Recibes email de confirmación? (revisa también spam)
  - ¿Aparece página de "gracias"?
  - ¿Hay un código de seguimiento de la cotización?

### 5) Portal de cliente (20 min)

URL: `/clientes`

- [ ] Sin sesión → debe redirigir a `/clientes/login`.
- [ ] Pide magic link con un email cualquiera → ¿llega? ¿en cuánto tiempo?
- [ ] Click en el magic link → debe loguearte y llevarte a `/clientes`.
- [ ] **Banner de pendientes**: ¿aparece si tienes mockups pendientes de aprobar o pagos pendientes?
- [ ] Cierra sesión → debe volver a `/clientes/login`.
- [ ] Vuelve a entrar tras cerrar el navegador → ¿la sesión persiste 7 días?

### 6) Pago (15 min, MUY IMPORTANTE)

⚠ **Pide a Mario que te genere un link de pago de prueba con 1€**.

- [ ] Entra al link, debe verse el resumen de la cotización + botón de pago.
- [ ] **En iPhone con Safari** → ¿aparece botón Apple Pay?
- [ ] **En Chrome con Google Pay configurado** → ¿aparece botón Google Pay?
- [ ] Pulsa el botón nativo (Apple/Google Pay) → ¿se completa el pago en 1 toque?
- [ ] **Botón "Pagar de forma segura"** (fallback) → ¿redirige a Stripe Checkout?
- [ ] **En Stripe Checkout**:
  - Tarjeta válida (4242 4242 4242 4242 si modo test) → debe completar
  - Tarjeta rechazada (4000 0000 0000 0002 si modo test) → debe mostrar error sin romper la página
- [ ] Tras pagar:
  - ¿Vuelves a una página de "gracias"?
  - ¿Recibes email con recibo Stripe?
  - ¿El link de pago, si lo abres otra vez, te dice "ya pagado"?
  - ¿Mario recibe aviso en Telegram?

### 7) Móvil real (1 hora) — MUY IMPORTANTE

**Coge tu teléfono físico**, no el emulador del navegador. Repite los puntos 1, 2, 3, 4 desde:
- iPhone (Safari)
- Android (Chrome)

Marca especial atención a:
- [ ] Botones tan pequeños que no se pueden pulsar bien con el dedo (mínimo 44×44 px).
- [ ] Texto que se sale por los bordes.
- [ ] Imágenes que tardan mucho en una conexión de móvil real.
- [ ] El menú de hamburguesa: ¿se abre y cierra bien?
- [ ] Formularios: ¿el teclado del móvil tapa el campo donde escribes?
- [ ] Doble tap: ¿algún botón se dispara dos veces?

### 8) Accesibilidad básica (15 min)

- [ ] Navega con **Tab** desde la home. ¿Todos los enlaces y botones son alcanzables?
- [ ] ¿Se ve el foco (cuadro azul) cuando saltas con Tab?
- [ ] **Zoom 200%** (Ctrl+0 y luego Ctrl++ varias veces): ¿la web sigue siendo usable o se rompe?
- [ ] Imágenes sin texto alternativo (instala el plugin "axe DevTools" o "WAVE" y mira los errores).
- [ ] Contraste de color: ¿hay texto gris claro sobre fondo claro que cuesta leer?

### 9) SEO y enlaces (15 min)

- [ ] `/sitemap.xml` → ¿existe y tiene URLs reales?
- [ ] `/robots.txt` → ¿existe?
- [ ] Title y meta description en home, catálogo, producto, ¿son únicos y descriptivos?
- [ ] Open Graph: copia la URL de un producto y pégalo en WhatsApp o Telegram → ¿se ve preview con imagen?
- [ ] Enlaces rotos: usa la extensión "Check My Links" para ver si hay 404 internos.

### 10) Errores intencionales (15 min)

Vamos a romper la web a propósito:

- [ ] Visita `/producto/no-existe-jamas` → ¿hay página 404 bonita o pantalla de error fea?
- [ ] Visita `/admin` sin login → debe redirigir, NO mostrar el panel.
- [ ] Visita `/clientes/orders/no-existe` → ¿qué hace?
- [ ] En un formulario, intenta hacer XSS: escribe `<script>alert(1)</script>` como nombre → no debe ejecutarse.
- [ ] Pulsa F5 muchas veces seguidas en `/catalogo` → ¿la web se cuelga o sigue?

---

## Comparación con Garrampa.es (la competencia)

Mario quiere que **compares la experiencia con [garrampa.es](https://garrampa.es)**. Para cada bloque arriba, anota también:

- **Mejor en TodoMerchandising**: …
- **Mejor en Garrampa**: …
- **Idea que TodoMerch debería robar a Garrampa**: …

Cosas concretas a comparar:
1. **Home**: ¿quién comunica mejor en 5 segundos?
2. **Buscador**: pon "camisetas baratas" en los dos. ¿Quién te da mejores resultados?
3. **Ficha de producto**: pon una camiseta similar en los dos. Compara:
   - Velocidad de carga
   - Cantidad de info técnica
   - Calculadora de cantidad/marcaje
   - Imagen del logo aplicado
4. **Pedir presupuesto**: ¿cuántos clicks hasta que terminas la solicitud?
5. **Confianza**: ¿qué señales de confianza ves (reseñas, certificaciones, testimonios)?

---

## Lo que NO necesitas probar

Para no perder tiempo:
- ❌ Panel admin (`/admin/*`) — solo para Mario y su equipo.
- ❌ APIs públicas (`/api/v1/*`).
- ❌ Webhooks Stripe (los prueba el sistema solo).
- ❌ Cron jobs y emails internos.

---

## Entrega

Mándame todos los hallazgos (vía Telegram, Notion, Google Doc, lo que prefieras) **clasificados** en estas 4 columnas:

| 🔴 Bloqueante | 🟡 Importante | 🟢 Menor | 💡 Ideas / Sugerencias |
|---|---|---|---|

Si encuentras un **bloqueante** (web caída, no se puede pagar, datos personales expuestos…), avísame **inmediatamente por Telegram** sin esperar al informe final.

Gracias Diego. Cualquier duda durante las pruebas, escríbeme directo.

— Mario
