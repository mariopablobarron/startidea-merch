# Presupuestos de merchandising · Startidea Málaga, S.L. / TodoMerchandising

Plantilla y utilidad de render para los presupuestos de merchandising.

## Archivos

| Archivo | Qué es |
|---|---|
| `plantilla-presupuesto-startidea.html` | Plantilla maestra. 3 páginas A4. No se edita para un cliente: se copia. |
| `generar-pdf.sh` | Render a PDF con Chromium headless. Avisa si queda algún marcador sin sustituir. |
| `assets/logo-startidea.png` | Logotipo oficial, tal cual (sin recomponer ni invertir). |
| `assets/fonts/` | Montserrat e Inter embebidas, para que el PDF salga igual siempre y sin red. |

## Cómo se hace un presupuesto

```bash
cp plantilla-presupuesto-startidea.html presupuesto-acme.html
# sustituir los marcadores {{...}} y cambiar los .ph por <img src="...">
./generar-pdf.sh presupuesto-acme.html Presupuesto_Acme_Startidea.pdf
```

Cualquier marcador `{{...}}` que quede sin sustituir sale **en rojo sobre amarillo**
en el PDF y el script lo avisa por consola. No puede colarse en una entrega.

## De dónde salen los precios

De los portales de proveedor con las cuentas de Startidea, **nunca estimados y nunca
del catálogo propio**:

- **Gran formato** (photocall, banderas, pancartas, carpas, displays, mástiles) →
  portal de distribuidor. Coste y PVP recomendado. Comprobar antes si existe un
  **pack completo**: suele salir más barato y más completo que sumar las piezas sueltas.
- **Regalo promocional** (vasos, textil, bolsas, escritura, tecnología) → escala de
  precio por cantidad **y Cotizador de impresión**. El precio de producto **no incluye
  el marcaje**: hay que meter la cantidad exacta, elegir área y técnica, y tomar de ahí
  producto, marcaje/ud. y cliché o pantalla. Anotar qué incluye (normalmente
  manipulación y envasado).
- Comprobar **stock real** y anotarlo. Si no cubre la cantidad pedida, decirlo antes
  de presupuestar.

> **`merchandising.startidea.es` no es fuente de precio, stock ni medidas.** Solo sirve
> para la referencia interna `STM-…` y los textos comerciales. Su feed tiene un fallo
> conocido: **stock y áreas de marcaje salen divididos por 1.000** (dice 90 uds cuando
> hay 90.000; dice 15 × 7 mm cuando son 150 × 70 mm).

## Cómo se fija el precio de venta

- Margen objetivo **30 % sobre el precio de venta**: `PVP = coste ÷ 0,70`.
- Redondear a precios unitarios limpios manteniendo el margen **entre el 30 % y el 31 %**.
- En gran formato, usar directamente el **PVP recomendado** del portal: ya lleva ese 30 %.
- Desglosar siempre en líneas separadas: **producto**, **marcaje**, **cliché/pantalla**.
- Si el cliente pide varias calidades: **dos opciones** (una marcada como recomendada),
  cada una con su total. La plantilla ya trae los estilos `tr.opt` y `tr.opt.rec`.

## Reglas de contenido (no negociables)

- **Sin fechas fijas.** Plazos en rango y siempre «desde la validación del arte final».
- **Sin nombrar proveedores, fabricantes ni subcontratas.** Todo se redacta como
  producción propia.
- **Nada de impacto social salvo que sea verdad en ese pedido concreto.**
- **IVA 21 % siempre desglosado** aparte de la base imponible.
- Forma de pago: **100 % a la confirmación del presupuesto**, momento en el que se pone
  en marcha la producción.
- Sin punto de facturación ni menciones a VeriFactu.
- Español peninsular, con tildes y puntuación completa.
- Si lo que pide el cliente no es técnicamente posible, va en **Notas técnicas** con la
  alternativa al lado, en vez de callarlo o aceptarlo sin más.

## Antes de entregar

1. Recalcular a mano sumas, subtotales, IVA y totales de cada opción.
2. Renderizar el PDF a PNG y **mirarlo**: nada cortado por el pie, sin texto fuera de
   caja, imágenes sin recuadros ni restos de la web de origen.
3. Comprobar que cada dato técnico (medida, gramaje, área de marcaje, stock) viene de la
   ficha del proveedor y no del catálogo propio.

```bash
# para mirarlo
python3 -c "import pymupdf,sys; [p.get_pixmap(dpi=110).save(f'/tmp/p{i}.png') for i,p in enumerate(pymupdf.open(sys.argv[1]),1)]" Presupuesto_Acme_Startidea.pdf
```

## Identidad

Degradado **#8F1039 → #C41D51** · rosa pálido **#FDEEF3** · tinta **#231F27** ·
gris **#5E5A63** · línea **#E7E2E6** · numeral **#DDA9BF**.
**Montserrat** titulares, **Inter** texto. Nada de negro puro ni de tonos hueso o crema.

> Ojo: la paleta de la web (`tailwind.config.ts`) usa crema `#F4EFE6` y hueso `#EAE3D3`
> como fondo. Los presupuestos **no** la siguen: van sobre blanco, por la regla de arriba.
