# Setup del agente de voz Alma (ElevenLabs Conversational AI)

## 1. Pre-requisitos en ElevenLabs

Cuenta con plan que incluya **Conversational AI** (Creator $22/mes o superior).
Login en https://elevenlabs.io/app/conversational-ai.

## 2. Crear el agente

1. Dashboard → **Conversational AI** → **Create Agent**
2. Nombre: `Alma — TodoMerchandising`
3. Voz: probar las en español peninsular (recomendado: `Bella`, `Charlotte`,
   o `Sarah` con español). Elegir la que más encaje con la marca (cálida,
   profesional, no robótica).
4. Idioma: Español (España).

### System prompt sugerido

```
Eres Alma, asistente de voz de TodoMerchandising, una iniciativa de Startidea
para producir merchandising corporativo con impacto social real
(Centros Especiales de Empleo + producción local Andalucía).

Tu trabajo:
- Ayudar al cliente a encontrar el producto adecuado para su necesidad
  (regalo corporativo, evento, kit onboarding, campaña RSC, etc.).
- Calcular precio orientativo si te lo piden (usa la tool calculate_quote).
- Si el cliente quiere cotización formal, pide nombre, email y empresa.
  Luego llama submit_quote para registrarla. NO la inventes — siempre tool.
- Si te preguntan algo fuera de catálogo o que requiere humano (negociación
  fina, evento muy custom, plazo extremo), ofrece pasarles a WhatsApp
  +34 958 045 789 o que respondan al email de confirmación.

Tono: cálido, directo, profesional. Nada de marketing-speak. Habla como una
persona real que conoce el catálogo, no como un bot vendedor.

Reglas clave:
- NUNCA inventes precios. Si dudas, usa calculate_quote.
- NUNCA expongas el nombre del proveedor (MidOcean, Makito). Solo "catálogo
  nuestro".
- Las cifras de impacto (CO₂, horas trabajo digno) son ESTIMACIONES. Si te
  preguntan auditadas, di que se entregan con certificado al confirmar pedido.
- Si el cliente parece descontento o quiere humano, no insistas. Ofrece
  contacto humano directamente.
- Sé concisa. La gente no quiere monólogos. Pregunta, escucha, responde corto.

Si no entiendes algo, pide que repita en otras palabras.

NO digas "soy una IA" ni "soy un agente virtual" salvo que pregunten directo.
Eres "Alma, asistente de TodoMerchandising".
```

### Tools (4 tools del agente)

En cada tool, configurar:
- **Type**: Server Tool (HTTP)
- **URL**: Production URL del endpoint
- **Auth**: Header `X-Voice-Agent-Secret: <VOICE_AGENT_TOOL_SECRET>`

#### Tool 1: `search_products`
- **Description**: "Busca productos del catálogo TodoMerchandising por nombre, descripción o categoría. Usa cuando el usuario quiera saber si tenemos un tipo de producto. Devuelve hasta 5 resultados."
- **URL**: `POST https://merchandising.hubstartidea.es/api/voice-agent/tools/search-products`
- **Parameters**:
  - `query` (string, required): texto de búsqueda
  - `category` (string, optional): filtro categoría
  - `max_results` (number, optional, default 5): máximo

#### Tool 2: `get_product_details`
- **Description**: "Obtiene detalles completos de un producto: dimensiones, material, precio desde, zonas de marcaje disponibles, técnicas (serigrafía, láser, bordado, transfer), stock. Usar cuando el cliente quiera saber más de un producto concreto."
- **URL**: `POST https://merchandising.hubstartidea.es/api/voice-agent/tools/product-details`
- **Parameters**:
  - `slug` (string, required): slug del producto (lo devuelve search_products)

#### Tool 3: `calculate_quote`
- **Description**: "Calcula el precio orientativo TOTAL para una cantidad concreta de un producto, con marcaje opcional. Devuelve precio unitario, coste de marcaje por unidad, total. Cifra orientativa que NO sustituye a cotización formal."
- **URL**: `POST https://merchandising.hubstartidea.es/api/voice-agent/tools/calculate-quote`
- **Parameters**:
  - `slug` (string, required): slug del producto
  - `quantity` (number, required): cantidad (entero ≥ 1)
  - `technique_code` (string, optional): código técnica marcaje
  - `number_of_colors` (number, optional, default 1): colores impresión
  - `marking_position_id` (string, optional): zona marcaje

#### Tool 4: `submit_quote`
- **Description**: "Crea cotización formal en TodoMerchandising. SOLO usar cuando el cliente lo pida explícitamente y haya dado nombre, email y empresa. Genera CartQuote real que el equipo procesará en menos de 24h laborables."
- **URL**: `POST https://merchandising.hubstartidea.es/api/voice-agent/tools/submit-quote`
- **Parameters**:
  - `name` (string, required): nombre del cliente
  - `email` (string, required): email corporativo
  - `company` (string, optional): empresa
  - `phone` (string, optional): teléfono
  - `items` (array, required, min 1): lista de productos con `product_slug`, `quantity`, opcionales `marking_position_id`, `technique_code`, `number_of_colors`, `notes`
  - `voice_session_id` (string, optional): se llena automáticamente desde el cliente
  - `notes` (string, optional): mensaje libre del cliente

### Greeting (mensaje inicial)

```
Hola, soy Alma, asistente de TodoMerchandising. ¿Estás buscando algún
producto en concreto o prefieres que te oriente?
```

## 3. Variables de entorno en Coolify

En el Project Settings > Environment Variables de `startidea-merch`, añadir:

```
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_AGENT_ID=agent_...
ELEVENLABS_AGENT_NAME=Alma
VOICE_AGENT_TOOL_SECRET=<generar string random largo, ej. openssl rand -hex 32>
```

Tras añadir → Force redeploy del container `merch-app`.

## 4. Verificación

1. Visitar https://merchandising.hubstartidea.es como anónimo
2. Botón "Hablar con Alma" abajo a la izquierda
3. Permitir micrófono
4. Probar:
   - "Hola, ¿tenéis termos?"
   - "Cuéntame del Belo Bottle"
   - "¿Cuánto cuesta 250 con láser 1 color?"
   - "Quiero cotización, soy Mario de Acme con mario@acme.com"
5. Comprobar que aparece en `/admin/marketing/voice-agent`

## 5. Costes

- ElevenLabs Conversational AI: ~$0.08/min
- Conversación media: 3-5 min → $0.24-0.40
- 100 conversaciones/mes: ~$40
- Tracking en `/admin/marketing/voice-agent` muestra coste estimado acumulado

## 6. Anti-abuso ya implementado

- Rate limit 5 conversaciones / 15 min por IP en `/api/voice-agent/signed-url`
- Header `X-Voice-Agent-Secret` requerido en todas las tools (impide llamadas
  directas a `submit-quote` desde fuera del agente)
- Plan de ElevenLabs corta cuando se llega al límite mensual de minutos
- Si crece abuso real: añadir CAPTCHA invisible al endpoint signed-url
