# Estado CTO · TodoMerchandising

Actualizado el 5 de septiembre de 2026, 12:44 UTC, por Codex.

## Encargo actual

Primera tanda del encargo CTO: consultas seguras en Telegram y entrada diaria Hoy en el panel existente. Tanda terminada; el mapa de auditoría conserva áreas parciales y no verificadas.

## Código, integración y ejecución

PR [#62](https://github.com/mariopablobarron/startidea-merch/pull/62) integrada en `a9a02f43564083845e54c0a1e382525ecce5c8b0`. Incluye consultas del bot delimitadas en servidor, recepción personal con recibos, menú de enlaces al panel y vista Hoy sobre la API vigente. Sin cambios en precios, pagos, proveedores, modelos o secretos.

Único build de producción de esta tanda: autodeploy completado el 05-sep a las 12:42:34 UTC. A las 12:43 UTC coincidían checkout VPS, marcador, imagen viva y health en `a9a02f4`; app saludable y volumen de datos conservado. Un commit posterior que solo cambie este documento no modifica esa versión de aplicación.

Validación: TypeScript, build, 1.982 tests correctos (1 live omitido en suite normal, ejecutado aparte), 79 pruebas nuevas y controles remotos de CI/seguridad correctos. Money-smoke antes y después: 24/24. Interfaz local a 360/390/1280 px, estados de error/reintento/vacío/401 verificados con datos de demostración.

Verificación viva adicional: recurso del panel servido idéntico al desplegado; API dashboard autorizada responde, sin autorización devuelve 401; sus seis enlaces requieren sesión. La bandeja Hoy no tenía cotizaciones que cumplieran el criterio en ese corte. Webhook rechaza falta de secreto e ignora JSON inválido autenticado; registro Telegram correcto sin entregas pendientes ni error registrado. Ningún mensaje ni registro comercial nuevo durante las comprobaciones.

## Límites y continuidad

No se ha ensayado una conversación real del bot ni un recorrido de pago, compra, entrega o restauración. Telegram todavía necesita vinculación con usuario interno, roles y revocación antes de habilitar escrituras. La recuperación de un recibo interrumpido requiere reentrega; no es una cola durable automática.

Diagnóstico, mapa funcional, backlog deduplicado y evidencias permanecen en la carpeta local de entregables CTO del 5 de septiembre, fuera de este repositorio público. El backlog operativo privado conserva hallazgos, prioridades y trabajo de otras ramas. No publicar esos informes sin revisar su contenido.

Decisión de Mario: aprobar la siguiente tanda propuesta de integridad del recorrido de cobro, sin cambiar precios ni realizar transacciones reales de prueba. Alternativa segura: continuar la contención de salidas públicas.

Única siguiente acción: abrir una sesión nueva desde el remoto actualizado con la decisión de Mario y el informe privado. Esta tanda no deja procesos de desarrollo ejecutándose.
