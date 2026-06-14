# Plantillas WhatsApp Business API (para aprobar en Meta)

Cuando se active el sender de WhatsApp Business API (Twilio / 360dialog / Cloud
API), hay que dar de alta estas plantillas en el **WhatsApp Manager de Meta**
(Business Settings → Plantillas de mensajes). Solo se pueden enviar mensajes
proactivos (fuera de la ventana de 24 h desde el último mensaje del cliente)
usando plantillas **aprobadas**.

- **Idioma:** Español (`es`)
- **Categoría:** `UTILITY` (son transaccionales, no marketing → más barato y menos
  restringido). Se envían solo a clientes que han pedido cotización y han dado
  opt-in (`CartQuote.whatsappOptIn = true`).
- Las variables `{{1}}`, `{{2}}`… se rellenan al enviar desde el backend.

---

## 1. `presupuesto_listo` — UTILITY
**Cuándo:** al generar el presupuesto/propuesta del cliente.

**Cuerpo:**
```
Hola {{1}} 👋 Tu presupuesto de TodoMerchandising ya está listo.
Puedes verlo aquí: {{2}}

Cada pedido se produce en Centros Especiales de Empleo de Granada.
¿Alguna duda? Respóndenos por aquí y te ayudamos.
```
**Variables:** `{{1}}` = nombre · `{{2}}` = enlace al presupuesto/PDF.

---

## 2. `enlace_pago` — UTILITY
**Cuándo:** al crear el enlace de pago para confirmar el pedido.

**Cuerpo:**
```
Hola {{1}}, ya puedes confirmar tu pedido de TodoMerchandising ({{2}}).
Pago seguro aquí: {{3}}

Si prefieres factura pro-forma o ajustar algo, respóndenos.
```
**Variables:** `{{1}}` = nombre · `{{2}}` = importe (p.ej. "249,00 €") · `{{3}}` = enlace `/pay/<token>`.

> Alternativa recomendada por Meta: usar un **botón de tipo URL** ("Pagar")
> con el enlace dinámico, en vez de la URL en el cuerpo. Mejora la conversión.

---

## 3. `recordatorio_presupuesto` — UTILITY
**Cuándo:** D+2 / D+5 si el cliente no responde (seguimiento).

**Cuerpo:**
```
Hola {{1}}, ¿pudiste ver el presupuesto que te preparamos?
Si te encaja o quieres ajustar cantidades, plazos o acabados, dínoslo por aquí
y lo cerramos en un momento. — TodoMerchandising
```
**Variables:** `{{1}}` = nombre.

---

## Notas de cumplimiento
- **Opt-in obligatorio:** solo enviar a quien marcó "recibir por WhatsApp" en el
  formulario (`whatsappOptIn`). El opt-in ya se captura en el carrito.
- **Ventana de 24 h:** si el cliente escribió en las últimas 24 h, se puede
  responder libre (sin plantilla). Fuera de eso, plantilla aprobada.
- **Número dedicado:** la API requiere un número que NO esté en la app normal de
  WhatsApp (no usar el número personal +34 627 305 162 si se sigue usando en el móvil).
- **Cableado:** YA hecho y durmiente. Al crear un enlace de pago, si el cliente
  dio opt-in (`whatsappOptIn`) y tiene teléfono, se envía la plantilla
  `enlace_pago` por WhatsApp además del email. Ver `lib/whatsapp-cloud.ts` +
  `api/admin/cart-quotes/[id]/payment-link`.

## Variables de entorno (activan el envío)
En `/docker/startidea-merch/.env` (server-only, **NO** `NEXT_PUBLIC_`) y luego redeploy:
```
WHATSAPP_TOKEN=<token permanente del usuario de sistema de Meta>
WHATSAPP_PHONE_NUMBER_ID=<Phone Number ID de Configuración de la API>
WHATSAPP_API_VERSION=v21.0   # opcional
```
Sin estas variables, el envío hace no-op (no rompe nada). Al ponerlas + redeploy,
el presupuesto/enlace de pago empieza a salir también por WhatsApp.
