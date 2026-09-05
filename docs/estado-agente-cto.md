# Estado CTO · TodoMerchandising

Actualizado el 5 de septiembre de 2026, 13:48 UTC, por Codex.

## Encargo actual

Segunda tanda CTO autorizada por Mario: confirmación Stripe, recuperación durable del trabajo posterior e intentos estables. Tanda terminada. Primera tanda web/Telegram publicada previamente en `a9a02f4` (PR #62).

## Código, integración y ejecución

PR [#63](https://github.com/mariopablobarron/startidea-merch/pull/63) integrada en `dbd78d2fa196a0acd4e176ad18238a5e44562359`, desde candidato `a6e1474`. Siete controles PR correctos y CI/Security de main correctos, incluidas las pruebas transaccionales con PostgreSQL desechable.

Único build de producción de esta tanda: iniciado a las 13:43:04 UTC y completado a las 13:47:39 UTC, primer intento. A las 13:48 UTC coincidían checkout VPS, marcador, imagen viva y health en `dbd78d2`; app saludable, base de datos correcta y volumen conservado. Un commit posterior que solo cambie este documento no modifica esa versión de aplicación.

Cambios: fondos confirmados y recibo de evento transaccionales; reserva durable del intento anterior a Stripe; recuperación por el cron existente; retención de efectos externos inciertos; comprobación de versión comercial en confirmación y en los datos enviados a proveedores; protección compartida frente a doble emisión de factura. Sin cambios económicos, de configuración de proveedores, secretos o esquema de datos. El cambio Prisma es solo documentación.

Validación: TypeScript y build correctos; 2.143 pruebas unitarias correctas y una comprobación live ejecutada aparte; 19 pruebas en PostgreSQL real aislado con transportes externos simulados; Semgrep sin hallazgos; money-smoke antes y después 24/24. No se han ensayado transacciones ni comunicaciones comerciales reales.

Verificación viva: health con SHA y DB correctos; webhook rechaza firma ausente e inválida con 400; wallet y Checkout devuelven 404 para tokens inexistentes. Las comprobaciones conservaron los conteos de pagos, recibos Stripe y trabajos durables. No había trabajos nuevos pendientes en ese corte. FacturaScripts automático continúa desactivado. El despliegue verificó también portada, catálogo, acceso admin, recomendador y auditoría pública.

## Límites y continuidad

No se ha probado un recorrido real completo de pago, compra, factura o entrega. No se reejecuta historial de pagos anteriores: versiones no acreditadas, discrepancias, propietarios previos y efectos de resultado incierto requieren conciliación visible. La cola contiene sus reintentos; no acredita conciliación universal de todas las operaciones manuales históricas.

Diagnóstico, mapa funcional, backlog y evidencia comercial permanecen en la carpeta privada local de entregables CTO, fuera de este repositorio público. Otras correcciones económicas y de catálogo continúan en sus carriles previos; no duplicarlas.

Decisión de Mario: ninguna pendiente para esta tanda. La base de datos local de ensayo está detenida; no quedan procesos de desarrollo de esta sesión.

Única siguiente acción: en una sesión nueva, revisar el backlog privado actualizado y retomar la contención de referencias de proveedor en las descripciones públicas, coordinándose con los carriles existentes.
