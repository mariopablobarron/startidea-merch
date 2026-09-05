# Estado CTO · TodoMerchandising

Actualizado el 5 de septiembre de 2026 por Codex.

## Encargo actual

Segunda tanda CTO autorizada por Mario: integridad de la confirmación Stripe, recuperación durable del trabajo posterior e intentos de pago estables. Primera tanda web/Telegram ya desplegada en `a9a02f4` (PR #62).

## Código, integración y ejecución

Base remota `e65462a`. Tanda de cobros preparada en rama `codex/merch-cobros-d2-d4-20260905`, pendiente de integración y del único despliegue autorizado de esta tanda. Producción comprobada antes de publicar: `a9a02f4`, saludable; FacturaScripts automático desactivado.

Cambios: confirmación de fondos y recibo de evento transaccionales; preparación durable del intento anterior a Stripe; recuperación por el cron existente; retención de efectos externos inciertos; comprobación de versión comercial en confirmación y en los datos enviados a proveedores; protección compartida frente a doble emisión de factura. Sin cambios de precios, márgenes, impuestos aplicados, configuración de proveedores, secretos o esquema de datos. El cambio Prisma es solo documentación.

Validación local: TypeScript, 2.143 pruebas unitarias correctas (1 comprobación live omitida en suite normal), 19 pruebas en PostgreSQL aislado con transportes externos simulados, build correcto, Semgrep 0 hallazgos, barrido live correcto y money-smoke vivo previo 24/24. CI incorpora PostgreSQL desechable para repetir las pruebas de transacciones. Estas verificaciones todavía no acreditan despliegue.

## Límites y continuidad

No se han realizado transacciones Stripe, pedidos, facturas ni mensajes reales de ensayo. No se reejecuta historial de pagos anteriores: las versiones no acreditadas, discrepancias, propietarios previos y efectos de resultado incierto requieren conciliación visible. No se activa FacturaScripts.

Diagnóstico, mapa funcional, backlog y evidencia comercial permanecen en la carpeta privada local de entregables CTO, fuera de este repositorio público. Otras correcciones económicas y de catálogo continúan en sus carriles previos; no duplicarlas.

Decisión de Mario: ninguna pendiente para esta tanda, ya autorizada.

Única siguiente acción: completar los controles, integrar y verificar el único despliegue de esta tanda, registrando el SHA real y las comprobaciones vivas en este documento.
