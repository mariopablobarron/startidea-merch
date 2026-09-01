---
name: presupuestos-merchandising
description: Prepara presupuestos de merchandising de Startidea Málaga, S.L. (marca TodoMerchandising) en PDF de 3 páginas A4. Úsala siempre que haya que cotizar o presupuestar merchandising, regalo promocional o gran formato para un cliente: photocall, banderas, pancartas, carpas, displays, mástiles, vasos, textil, bolsas, escritura o tecnología. Cubre de dónde salen los precios (portales de proveedor, nunca estimaciones), el margen, la plantilla HTML y la verificación previa a la entrega.
---

# Presupuestos de merchandising · Startidea / TodoMerchandising

Trabajas sobre datos reales de proveedor, nunca sobre estimaciones. **Si un dato no lo
puedes verificar, paras y preguntas antes de seguir.** Un presupuesto con un precio
inventado es peor que un presupuesto que llega media hora más tarde.

## 1. Quién presupuesta

Todos los presupuestos los emite:

- **Startidea Málaga, S.L.**
- CIF **B19583632**
- C/ Conde Cifuentes, 33 · 18005 Granada
- 958 045 789 · pedidos@startidea.es
- merchandising.startidea.es (marca comercial: **TodoMerchandising**)

No uses Startidea Consulting, S.L. en los presupuestos de merchandising.

## 2. De dónde salen los precios (obligatorio)

Nunca inventes ni estimes precios. Se consultan en los portales de proveedor con las
cuentas de Startidea abiertas en el navegador:

| Familia | Portal | Qué sacar |
|---|---|---|
| Gran formato: photocall, banderas, pancartas, carpas, displays, mástiles | **adivin.com** (cuenta `startidea`, portal de distribuidor) | «Precio de Ádivin» = coste, y «PVP recomendado» |
| Regalo promocional: vasos, textil, bolsas, escritura, tecnología | **makito.es** (cuenta *Startidea Málaga SL*) | Escala de precio por cantidad **y** el **Cotizador de impresión** para el marcaje real a la cantidad pedida |
| Resto | midocean, PF Concept | Igual: coste real a la cantidad pedida |

Reglas de consulta:

- En Makito, el precio del producto **no incluye el marcaje**. Abre siempre el
  **Cotizador de impresión**, mete la cantidad exacta, elige área y técnica, y toma de ahí:
  precio de producto, precio de marcaje por unidad y cliché/pantalla. Anota también qué
  incluye (normalmente manipulación y envasado).
- En Ádivin, comprueba si existe un **pack completo** antes de sumar componentes sueltos:
  suele ser más barato y más completo que la suma de las piezas.
- **No uses merchandising.startidea.es como fuente de precio, stock ni medidas.** Sirve
  solo para la referencia interna `STM-…` y los textos comerciales. Su feed tiene un fallo
  conocido: el stock y las áreas de marcaje salen divididos por 1.000 (dice 90 uds cuando
  hay 90.000; dice 15 × 7 mm cuando son 150 × 70 mm).
- Comprueba **stock real** y anótalo. Si no cubre la cantidad pedida, dilo antes de presupuestar.

Si no tienes acceso al navegador con esas cuentas abiertas, no continúes: pide a Mario los
datos de la ficha de proveedor (coste, escala por cantidad, marcaje, cliché, stock, medidas
y área de marcaje) y espera. No rellenes huecos con precios de catálogo propio ni de memoria.

## 3. Cómo se fija el precio de venta

- Margen objetivo: **30 % sobre el precio de venta**, es decir `PVP = coste ÷ 0,70`.
- Redondea a precios unitarios limpios (dos decimales, cifras que se lean bien) manteniendo
  el margen entre el **30 % y el 31 %**. Comprueba el margen resultante después de redondear:
  `margen = (PVP − coste) ÷ PVP`.
- En gran formato de Ádivin, usa directamente su **PVP recomendado**: ya lleva ese 30 %.
- Desglosa siempre en líneas separadas: **producto**, **marcaje**, **cliché/pantalla**.
  El cliente tiene que ver de dónde sale el importe.
- Si el cliente pide varias calidades, presenta **dos opciones** (una recomendada) en vez de
  una sola, con su total cada una.

## 4. Formato del documento (siempre el mismo)

Parte de `assets/plantilla-presupuesto-startidea.html` y sustituye el contenido. Copia la
plantilla y `assets/logo-startidea.png` a la carpeta de trabajo, edita el HTML y genera el
PDF con Chromium headless:

```
chromium --headless --no-sandbox --disable-gpu \
  --print-to-pdf=Presupuesto_<Cliente>_Startidea.pdf --no-pdf-header-footer \
  file:///ruta/presupuesto.html
```

Las fotos de producto y las imágenes de área de marcaje van embebidas como
`data:image/png;base64,…` para que el PDF sea autocontenido. Recórtalas: sin recuadros,
sin fondo gris ni restos de la web de origen.

La plantilla usa **Montserrat** e **Inter** instaladas en el sistema; si no lo están, el PDF
sale con otra tipografía. Compruébalo en el render antes de entregar.

Estructura fija, **3 páginas A4** (`@page { size: A4; margin: 0 }`, `.page` de 210 × 297 mm):

- **Página 1 — oferta.** Cabecera clara con el logotipo oficial a la izquierda
  (`logo-startidea.png`, sin recomponer ni invertir) y «Presupuesto» en Inter 800 a la
  derecha con el número y la fecha en magenta. Filete de degradado, banda de asunto en rosa
  pálido, bloque de tres columnas (Cliente · Proveedor · Validez), partidas numeradas `01`,
  `02`… con miniatura del producto en cada línea, y los totales al pie con base imponible,
  IVA 21 % y total.
- **Página 2 — detalle técnico y medidas de marcaje.** Fichas con foto del producto,
  imagen de la zona de marcaje y sus cotas, más las especificaciones (medidas, materiales,
  qué incluye, artes finales). Cierra con una «ficha de marcaje» en rosa pálido: técnica,
  número de tintas, posición, área máxima, formato del arte final y mock-up.
- **Página 3 — condiciones**, más cualquier nota técnica al cliente y el bloque de cierre
  en degradado con los datos de contacto.

Identidad de marca:

- Degradado **#8F1039 → #C41D51** en filete, barra superior de páginas interiores y cierre.
- Rosa pálido **#FDEEF3** para bandas y bloques destacados. Tinta **#231F27**, gris **#5E5A63**,
  línea **#E7E2E6**.
- **Montserrat** para titulares, **Inter** para texto. Nada de negro puro ni de tonos hueso o crema.
- Importes totales en Montserrat magenta.

En `referencia/ejemplo-tus-territorios.html` está un presupuesto real ya entregado
(sin las imágenes, para no cargar el repositorio): úsalo como patrón de redacción y de
estructura cuando dudes del tono o del nivel de detalle.

## 5. Reglas de contenido (no negociables)

- **Sin fechas fijas.** Plazos como rango («entre 8 y 15 días según el volumen») y siempre
  «desde la validación del arte final».
- **Sin nombrar proveedores, fabricantes ni subcontratas.** Todo se redacta como producción propia.
- **Nada de impacto social salvo que sea verdad en ese pedido concreto.** No pongas
  «producción en Centros Especiales de Empleo» si ese pedido no se produce ahí.
- **IVA 21 % siempre desglosado** aparte de la base imponible.
- Condiciones estándar: plazo de producción · entrega con transporte a península incluido
  (Baleares, Canarias, Ceuta y Melilla aparte) · impuestos · **forma de pago: 100 % a la
  confirmación del presupuesto, momento en el que se pone en marcha la producción** ·
  artes finales · cantidades · validez de la oferta 30 días naturales.
- No incluyas punto de facturación ni menciones a VeriFactu.
- Español peninsular, con tildes y puntuación completa.
- Si detectas que lo que pide el cliente no es técnicamente posible (por ejemplo, tinta
  transparente sobre un vaso translúcido), inclúyelo como nota explicativa con la
  alternativa, en vez de callarlo o de aceptarlo sin más.

## 6. Verificación antes de entregar

1. Recalcula a mano sumas, subtotales, IVA y totales de cada opción.
2. Renderiza el PDF a PNG y **míralo**: nada cortado por el pie, sin texto que se salga de
   caja, imágenes sin recuadros ni restos de la web de origen.
3. Comprueba que cada dato técnico (medida, gramaje, área de marcaje, stock) procede de la
   ficha del proveedor y no del catálogo propio.
4. Entrega el PDF y, en el mensaje, un resumen corto con: coste total, precio de venta,
   margen resultante y cualquier punto que necesite decisión de Mario.

Para el paso 2, con las herramientas de este repositorio:

```
pdftoppm -png -r 110 Presupuesto_<Cliente>_Startidea.pdf pagina
```

y abre `pagina-1.png`, `pagina-2.png` y `pagina-3.png` con la herramienta de lectura de
imágenes. Un PDF que no has mirado no está verificado.
