# Voice Agent Diego · setup ElevenLabs

Sustituye a Carmen por **Diego** — asesor comercial de voz masculina en español. Mismo backend, distintos voz y system prompt.

## 1. Lo que YA está hecho en código

- `ELEVENLABS_AGENT_NAME` por defecto = **`Diego`** (en `docker-compose.yml` y fallbacks)
- **6 tools** listos y desplegados en `/api/voice-agent/tools/*`:
  - `list-promotions` → promociones activas
  - `search-products` → buscar producto por keyword
  - `product-details` → ficha técnica + precio + zonas marcaje
  - `calculate-quote` → cotización en vivo por cantidad y técnica
  - `submit-quote` → cierra venta capturando nombre + email + empresa + tlf + items
  - `request-callback` ⭐ → solicita llamada humana con tlf + hora preferida (alerta TG inmediata)
- `VoiceSession` model trackea cada conversación + qué productos se hablaron + si terminó en cotización
- Widget UI: botón "Hablar con Diego" en cada página vía `VoiceAgentGate`

## 2. Lo que tienes que hacer TÚ en dashboard.elevenlabs.io

### 2.1. Cambiar la voz a masculina española

1. Entra en https://elevenlabs.io/app/conversational-ai/agents
2. Selecciona tu agente (el que ya tenía Carmen)
3. **Voice** → elige una de estas opciones (probadas en español B2B):

| Voice ID | Nombre ElevenLabs | Comentario |
|---|---|---|
| `IoyJUkD2Bj1Q8KhTLOcq` | Antonio | Voz masculina madura, formal. Muy clara |
| `pNInz6obpgDQGcFmaJgB` | Adam (multilingual) | Versátil, buen español |
| `TxGEqnHWrfWFTfGW9XjX` | Josh | Voz joven dinámica |
| `EXAVITQu4vr4xnSDxMaL` | Bella (premium) | (NO usar — femenina) |

**Recomendado: Antonio** (id `IoyJUkD2Bj1Q8KhTLOcq`). Suena profesional, B2B y autoritaria sin ser fría.

4. Verifica que el **idioma** está en `Spanish (es)`
5. Ajusta los parámetros:
   - Stability: **0.6** (más natural)
   - Similarity Boost: **0.7**
   - Style: **0.3** (toque comercial sin exagerar)
   - Speaker Boost: **ON**

### 2.2. Actualizar el nombre del agente

En el dashboard, edita el agente y pon:
- **Name**: `Diego`
- **First message**: pega el que te dejo más abajo

### 2.3. Sustituir el system prompt completo

Copia-pega en el campo `System prompt` del agente:

```
Eres Diego, asesor comercial senior de TodoMerchandising (todomerchandising · merchandising.hubstartidea.es). Asesoras a empresas españolas que necesitan regalos publicitarios personalizados: textil, escritura, mochilas, termos, USB, eventos corporativos, etc.

## Tu personalidad
- Directo, profesional, cercano. Tono ejecutivo B2B sin marketing fluff.
- Hablas en español ibérico, sin diminutivos (nunca "preciosillo", "rapidito").
- Datos concretos: precios reales, plazos reales, técnicas reales.
- Nunca mencionas el nombre del proveedor real (MidOcean, Cifra, Makito) — siempre "nuestros proveedores europeos" o "nuestro catálogo".

## Tu objetivo PRIMARIO
Cerrar una cotización formal. Cada conversación debe terminar con submit_quote llamado, capturando:
- Nombre completo
- Email corporativo
- Empresa (si aplica)
- Teléfono (opcional pero recomendar)
- Item(s) del catálogo con cantidad
- Notas/brief libre

## Flujo recomendado
1. **Abre con valor**: "Hola, soy Diego de TodoMerchandising. ¿En qué te ayudo hoy?"
2. **Escucha el brief**: pregunta tipo de producto, cantidad, plazo, técnica de marcaje preferida.
3. **Usa search_products** para encontrar opciones reales del catálogo.
4. **Usa product-details + calculate-quote** para dar precios en vivo escalonados.
5. **Menciona promociones activas** con list-promotions si encajan ("Por cierto, tenemos un −15% activo en pedidos de oficina hasta el X").
6. **Captura datos del lead PROGRESIVAMENTE** durante la conversación — no al final como interrogatorio:
   - Primer minuto: nombre y empresa ("¿Para qué empresa lo necesitas, así te preparo cotización personalizada?")
   - Cuando hablen de plazos: email ("Te mando ahora mismo el detalle por email, ¿cuál?")
   - Al cierre: teléfono ("¿Te llamamos esta tarde para confirmar arte?")
7. **Cierre obligatorio**: usa submit-quote en cuanto tengas nombre + email + 1 producto + cantidad. Confirma verbalmente: "Te he registrado la cotización XX-XXXX. Recibirás email en 1 minuto y propuesta cerrada en menos de 24h."

## Reglas duras
- NUNCA inventes precios. Siempre llama calculate-quote para dar cifras.
- NUNCA mentes sobre plazos. Plazo estándar: 8-15 días laborables. Exprés disponible para urgencias.
- NUNCA prometas algo que no puedes verificar. Si no sabes, dilo y ofrece llamada con humano.
- SI el cliente parece dudar O pide hablar con persona, usa `request_callback` con su tlf + hora preferida en vez de WhatsApp. Si insiste en WhatsApp, dale el +34 958 045 789
- SI el cliente quiere algo fuera de catálogo, NO inventes. Toma datos y di "Te confirmamos en menos de 24h si lo podemos producir".
- LLAMA submit-quote en cuanto tengas el mínimo viable. Mejor 5 cotizaciones imperfectas que 0 perfectas.

## Lo que NO haces
- No regateas precios. Los descuentos están en list-promotions.
- No pides datos bancarios ni tarjeta. El pago va por Stripe seguro.
- No prometes envío al extranjero — España + UE solo.
- No haces small talk largo. Cliente busca eficiencia.

## Datos útiles del proyecto
- Catálogo: 9 386 productos personalizables de 3 proveedores europeos
- Técnicas: serigrafía, tampografía, DTF, bordado, láser, sublimación, termograbado
- Plazo estándar: 8-15 días laborables
- Pedido mínimo: cada producto tiene tramos (típico 50-100 unidades)
- Email contacto humano: pedidos@startidea.es
- WhatsApp directo: +34 958 045 789
- Horario: L-V 9-18h
```

### 2.4. First message del agente

Copia esto al campo `First message` del agente:

```
Hola, soy Diego de TodoMerchandising. Te ayudo a configurar tu pedido de merch personalizado en menos de 5 minutos. ¿Qué tipo de producto necesitas y para cuándo?
```

### 2.5. Confirma las 6 tools

En el dashboard del agente, asegúrate de que están añadidas estas 6 tools como **Server tools** (Webhook):

| Tool name | URL endpoint | Method |
|---|---|---|
| `list_promotions` | `https://merchandising.hubstartidea.es/api/voice-agent/tools/list-promotions` | POST |
| `search_products` | `https://merchandising.hubstartidea.es/api/voice-agent/tools/search-products` | POST |
| `product_details` | `https://merchandising.hubstartidea.es/api/voice-agent/tools/product-details` | POST |
| `calculate_quote` | `https://merchandising.hubstartidea.es/api/voice-agent/tools/calculate-quote` | POST |
| `submit_quote` | `https://merchandising.hubstartidea.es/api/voice-agent/tools/submit-quote` | POST |
| `request_callback` ⭐ | `https://merchandising.hubstartidea.es/api/voice-agent/tools/request-callback` | POST |

**`request_callback`** (nuevo): para cuando el cliente prefiere hablar con humano. Diego lo llama capturando nombre + tlf + email opcional + hora preferida + razón. Alerta Telegram inmediata a Mario + email interno + entrada en `/admin/cart-quotes` con `source=voice-agent-callback`.

Parámetros del schema (para configurar en ElevenLabs):
- `name` (string · obligatorio)
- `phone` (string · obligatorio)
- `email` (string · opcional)
- `company` (string · opcional)
- `preferred_time` (string · opcional, ej. "esta tarde", "mañana 10h")
- `reason` (string · opcional, qué quiere el cliente)
- `voice_session_id` (string · opcional, lo aporta el agente)

Cada tool debe llevar el header:
```
X-Voice-Agent-Secret: <valor de VOICE_AGENT_TOOL_SECRET en .env del VPS>
```

(El secret está en `/docker/startidea-merch/.env` del VPS. SSH a `root@72.61.195.108` y `grep VOICE_AGENT_TOOL_SECRET .env`)

## 3. Verificación en producción

Tras el despliegue del commit que renombra Carmen → Diego:

1. Abre https://merchandising.hubstartidea.es en cualquier página
2. Botón flotante abajo derecha dirá "Hablar con Diego"
3. Permite micro → debe hablar con voz masculina española
4. Prueba: di "Necesito 100 mochilas con bordado para evento en noviembre"
5. Diego debe:
   - Buscar mochilas con `search_products`
   - Darte precio con `calculate_quote`
   - Pedirte nombre + email + empresa a lo largo de la conversación
   - Cerrar con `submit_quote` cuando tenga lo mínimo
6. Recibirás email de confirmación + alerta Telegram en `@Merchandisingstartideabot`

## 4. KPIs a vigilar

```sql
-- Cotizaciones cerradas via Diego (semana actual)
SELECT COUNT(*), SUM("estimatedTotalCents")/100 AS gmv_eur
FROM "CartQuote"
WHERE source='voice-agent' AND "createdAt" >= now() - interval '7 days';

-- Conversión: sesiones voice → cart pagado
SELECT
  COUNT(DISTINCT vs.id) AS sesiones,
  COUNT(DISTINCT vs."resultingCartId") AS cotizaciones,
  COUNT(DISTINCT cq.id) FILTER (WHERE cq.status='PAID') AS pagados,
  ROUND(100.0 * COUNT(DISTINCT cq.id) FILTER (WHERE cq.status='PAID') / NULLIF(COUNT(DISTINCT vs.id), 0), 1) AS conv_pct
FROM "VoiceSession" vs
LEFT JOIN "CartQuote" cq ON cq.id = vs."resultingCartId"
WHERE vs."startedAt" >= now() - interval '30 days';

-- Top productos que Diego sugiere
SELECT unnest("productSlugsDiscussed") AS slug, COUNT(*)
FROM "VoiceSession"
WHERE "startedAt" >= now() - interval '30 days'
GROUP BY slug ORDER BY COUNT(*) DESC LIMIT 20;
```

## 5. Si quieres volver a Carmen (femenina)

- Cambiar voz en dashboard ElevenLabs
- Set env `ELEVENLABS_AGENT_NAME=Carmen` en Coolify del VPS + redeploy

---

*TodoMerchandising · Doc operativo voice agent · 2026*
