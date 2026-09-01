/**
 * Monta el HTML del presupuesto: las tres páginas A4 del formato aprobado.
 *
 * El CSS sale de `presupuestos/plantilla-presupuesto-startidea.html` (ver
 * `presupuesto-assets.ts`): la plantilla es el motor, aquí solo se rellena. Lo
 * que la plantilla resuelve con marcadores fijos —tres líneas, una ficha— aquí
 * es variable, porque un presupuesto real tiene las partidas que tenga.
 *
 * Las reglas de contenido del encargo no son "cuidado al escribir": están
 * cableadas. El plazo solo se puede expresar en rango y desde la validación del
 * arte final; el IVA va siempre desglosado; la frase de impacto social sale
 * únicamente si alguien marcó esa casilla en ESE presupuesto; y antes de
 * devolver el documento se comprueba que no se haya colado el nombre de un
 * proveedor (`assertSinFugasDeProveedor`).
 */

import { PUBLIC_SUPPLIER_LEAK_PATTERNS } from "@/lib/public-supplier-leak-patterns";
import { plantillaCss, logoDataUri, imagenSubidaDataUri } from "@/lib/presupuesto-assets";
import {
  calcularEscenarios,
  calcularLinea,
  IVA_PCT,
  type PartidaCalculo,
  type TipoLinea,
} from "@/lib/presupuesto-calculo";

export type LineaRender = {
  tipo: TipoLinea;
  concepto: string;
  descripcion?: string | null;
  referencia?: string | null;
  imagenUrl?: string | null;
  cantidad: number;
  costeUnitCents: number;
  pvpUnitCents: number;
};

export type OpcionRender = {
  id: string;
  nombre: string;
  recomendada: boolean;
  lineas: LineaRender[];
  // Ficha técnica (página 2)
  fotoProductoUrl?: string | null;
  fotoMarcajeUrl?: string | null;
  medidas?: string | null;
  materiales?: string | null;
  incluye?: string | null;
  usoRecomendado?: string | null;
  marcajeTecnica?: string | null;
  marcajeTintas?: string | null;
  marcajePosicion?: string | null;
  marcajeAreaMaxima?: string | null;
  marcajeFormatoArte?: string | null;
};

export type PartidaRender = {
  id: string;
  orden: number;
  titulo: string;
  descripcion?: string | null;
  opciones: OpcionRender[];
};

export type Condicion = { titulo: string; texto: string };

export type PresupuestoRender = {
  numero: string;
  fecha: Date;
  asunto: string;
  clienteNombre: string;
  clienteContacto?: string | null;
  clienteReferencia?: string | null;
  clienteCif?: string | null;
  clienteDireccion?: string | null;
  validezDias: number;
  plazoMinDias: number;
  plazoMaxDias: number;
  notaTecnicaTitulo?: string | null;
  notaTecnica?: string | null;
  cierreTexto?: string | null;
  produccionCentroEspecialEmpleo: boolean;
  condiciones?: Condicion[] | null;
  partidas: PartidaRender[];
};

/** Datos del emisor. Fijos: es el error más caro de cometer. */
export const EMISOR = {
  razonSocial: "Startidea Málaga, S.L.",
  cif: "B19583632",
  direccion: "C/ Conde Cifuentes, 33",
  ciudad: "18005 Granada",
  telefono: "958 045 789",
  email: "pedidos@startidea.es",
  web: "merchandising.startidea.es",
  marca: "TodoMerchandising",
} as const;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapado de HTML. Se llama `escapeHtml` a propósito, como en el resto del
 * repositorio: el guard por descubrimiento de escapado reconoce ese nombre y
 * un `esc()` propio le habría parecido una interpolación sin sanear.
 */
function escapeHtml(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Texto de varias líneas → HTML con saltos, ya escapado. */
function escapeMultiline(v: string | null | undefined): string {
  return escapeHtml(v).replace(/\r?\n/g, "<br>");
}

/**
 * Importes del documento.
 *
 * No se reutiliza `formatMoney` del sitio: el `Intl` por defecto en español
 * escribe «1302,86 €» sin punto de millar (solo lo pone a partir de cinco
 * cifras), y en un presupuesto en papel eso se lee mal y se teclea peor.
 * `useGrouping: "always"` da el «1.302,86 €» del formato aprobado.
 */
const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
});

const eur = (cents: number) => EUR.format(cents / 100);

/** Cantidades: «2.000 uds», no «2000». Mismo motivo que los importes. */
const CANTIDAD = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
const cant = (n: number) => CANTIDAD.format(n);

export function formatearFechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(fecha);
}

/**
 * Las condiciones estándar del encargo, con el plazo en RANGO y siempre desde
 * la validación del arte final. Son el punto de partida editable de cada
 * presupuesto, no un texto intocable — pero lo que no se puede es emitir sin
 * ellas.
 */
export function condicionesEstandar(plazoMinDias: number, plazoMaxDias: number, validezDias = 30): Condicion[] {
  return [
    {
      titulo: "Plazo de producción",
      texto:
        `Entre ${plazoMinDias} y ${plazoMaxDias} días laborables según el volumen final, ` +
        `siempre desde la validación del arte final por parte del cliente.`,
    },
    {
      titulo: "Entrega",
      texto:
        "Transporte a península incluido en los precios indicados. Los envíos a Baleares, " +
        "Canarias, Ceuta y Melilla se presupuestan aparte.",
    },
    {
      titulo: "Impuestos",
      texto:
        `Todos los precios unitarios y la base imponible se expresan sin IVA. El IVA del ` +
        `${IVA_PCT} % figura desglosado en el total de la oferta.`,
    },
    {
      titulo: "Forma de pago",
      texto:
        "100 % a la confirmación del presupuesto, momento en el que se pone en marcha la producción.",
    },
    {
      titulo: "Artes finales",
      texto:
        "Se requiere arte final en vectorial (.ai, .eps o .pdf) con los textos trazados y los " +
        "colores definidos en Pantone. Antes de producir se envía un mock-up para su validación por escrito.",
    },
    {
      titulo: "Cantidades",
      texto:
        "Los precios unitarios corresponden a las cantidades indicadas en la oferta; modificarlas " +
        "altera el precio por unidad. El cliché o pantalla se factura una sola vez por diseño y técnica.",
    },
    {
      titulo: "Validez de la oferta",
      texto: `${validezDias} días naturales desde la fecha de emisión de este presupuesto.`,
    },
  ];
}

/** Frase de impacto social — solo si ese pedido se produce ahí de verdad. */
const IMPACTO_SOCIAL =
  "La producción de este pedido se realiza en Centros Especiales de Empleo.";

function aPartidaCalculo(p: PartidaRender): PartidaCalculo {
  return {
    id: p.id,
    titulo: p.titulo,
    opciones: p.opciones.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      recomendada: o.recomendada,
      lineas: o.lineas.map((l) => ({
        tipo: l.tipo,
        cantidad: l.cantidad,
        costeUnitCents: l.costeUnitCents,
        pvpUnitCents: l.pvpUnitCents,
      })),
    })),
  };
}

/**
 * Origen de una imagen del documento.
 *
 * Las que se han subido desde el panel se empotran en base64; las demás (una
 * URL del catálogo, por ejemplo) se dejan como están y ya se verán si el
 * documento se abre con red.
 */
function src(url: string): string {
  return escapeHtml(imagenSubidaDataUri(url) ?? url);
}

/**
 * Miniatura de la línea. Sin foto NO se pinta el marco de muestra de la
 * plantilla: en el documento que se manda, un recuadro con «sin foto» repetido
 * seis veces se lee como un presupuesto a medio hacer.
 */
function miniatura(url?: string | null): string {
  return url ? `<img class="mini" src="${src(url)}" alt="">` : "";
}

/**
 * Alto de una fila, en milímetros.
 *
 * Sin navegador no hay medida real, así que la fórmula está **calibrada contra
 * el render de verdad**: se midieron las filas del presupuesto patrón en
 * Chromium (título 20,6 mm con dos líneas de descripción; línea 16,4 mm con
 * una, 20,4 con dos y 28,7 con cuatro) y salen 12,3 mm de base más 4,1 mm por
 * línea de texto. No es una estimación a ojo: reproduce las medidas tomadas.
 *
 * Se usa solo para decidir dónde cortar de página. Si alguien toca los tamaños
 * de letra de la plantilla, hay que volver a medir — de ahí que los números
 * estén aquí juntos y con su procedencia escrita.
 */
const ALTO_BASE_FILA_MM = 12.3;
const ALTO_LINEA_TEXTO_MM = 4.1;
/** Una miniatura de 15 mm más el padding de la fila. */
const ALTO_MINIMO_CON_FOTO_MM = 22;
/** Ancho útil de la columna de concepto, en caracteres. */
const CARACTERES_POR_LINEA = 62;
const CARACTERES_POR_LINEA_TITULO = 95;

function altoFilaMm(caracteres: number, porLinea: number): number {
  const lineas = caracteres > 0 ? Math.ceil(caracteres / porLinea) : 0;
  return ALTO_BASE_FILA_MM + lineas * ALTO_LINEA_TEXTO_MM;
}

function altoLineaMm(linea: LineaRender): number {
  const desc = [linea.descripcion, linea.referencia ? `Ref. ${linea.referencia}` : null]
    .filter(Boolean)
    .join(" · ");
  const alto = altoFilaMm(desc.length, CARACTERES_POR_LINEA);
  return linea.imagenUrl ? Math.max(alto, ALTO_MINIMO_CON_FOTO_MM) : alto;
}

function altoTituloPartidaMm(partida: PartidaRender): number {
  return altoFilaMm(partida.descripcion?.length ?? 0, CARACTERES_POR_LINEA_TITULO);
}

type Fila = { html: string; altoMm: number; tipo: "linea" | "encabezado" };

function filaLinea(linea: LineaRender): Fila {
  const t = calcularLinea({
    tipo: linea.tipo,
    cantidad: linea.cantidad,
    costeUnitCents: linea.costeUnitCents,
    pvpUnitCents: linea.pvpUnitCents,
  });
  const desc = [linea.descripcion, linea.referencia ? `Ref. ${linea.referencia}` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    tipo: "linea",
    altoMm: altoLineaMm(linea),
    html: `      <tr>
        <td class="num"></td>
        <td class="img">${linea.tipo === "CLICHE" ? "" : miniatura(linea.imagenUrl)}</td>
        <td class="con">
          <div class="t">${escapeHtml(linea.concepto)}</div>
          ${desc ? `<div class="s">${escapeMultiline(desc)}</div>` : ""}
        </td>
        <td class="c">${cant(linea.cantidad)}</td>
        <td class="d">${eur(linea.pvpUnitCents)}</td>
        <td class="d">${eur(t.importeCents)}</td>
      </tr>`,
  };
}

/** Todas las filas de la oferta, en orden y con su alto estimado. */
function filasOferta(p: PresupuestoRender): Fila[] {
  const filas: Fila[] = [];

  for (const partida of p.partidas) {
    const num = String(partida.orden).padStart(2, "0");
    filas.push({
      tipo: "encabezado",
      altoMm: altoTituloPartidaMm(partida),
      html: `      <tr class="titulo-partida">
        <td class="num">${num}</td>
        <td colspan="5">
          <div class="t">${escapeHtml(partida.titulo)}</div>
          ${partida.descripcion ? `<div class="s">${escapeMultiline(partida.descripcion)}</div>` : ""}
        </td>
      </tr>`,
    });

    const conAlternativas = partida.opciones.length > 1;
    // La marca «RECOMENDADA» la lleva UNA sola opción: la primera marcada, que
    // es también la que usa `calcularEscenarios` para los totales. Si un
    // presupuesto trae dos marcadas —el editor lo permitía hasta hace poco— el
    // documento no puede enseñar dos recomendaciones y un cliente preguntándose
    // cuál mirar.
    const recomendada = partida.opciones.find((o) => o.recomendada);
    partida.opciones.forEach((opcion, i) => {
      if (conAlternativas) {
        const letra = String.fromCharCode(65 + i);
        filas.push({
          tipo: "encabezado",
          altoMm: 11.7,
          html: `      <tr class="opt${opcion === recomendada ? " rec" : ""}">
        <td colspan="6">Opción ${letra} · ${escapeHtml(opcion.nombre)}</td>
      </tr>`,
        });
      }
      opcion.lineas.forEach((linea) => filas.push(filaLinea(linea)));
    });
  }

  return filas;
}

function tabla(filas: Fila[]): string {
  return `  <table class="partidas">
    <thead>
      <tr>
        <th class="num">#</th>
        <th class="img"></th>
        <th>Concepto</th>
        <th class="c">Cant.</th>
        <th class="d">P. unit.</th>
        <th class="d">Importe</th>
      </tr>
    </thead>
    <tbody>
${filas.map((f) => f.html).join("\n")}
    </tbody>
  </table>`;
}

/**
 * Alto disponible para la tabla, en mm, medido sobre el render real: en la
 * primera página la tabla arranca a 121,6 mm (cabecera, filete, banda de
 * asunto y las tres columnas) y el pie empieza en 280,3; en las interiores
 * arranca a 28,6. Se dejan 3 mm de respiro.
 */
const ALTO_PRIMERA = 155;
const ALTO_CONTINUACION = 248;
/** El bloque de totales medido con dos cajas: 42,5 mm. */
const ALTO_TOTALES = 45;

/**
 * Reparte las filas de la oferta en páginas.
 *
 * El formato aprobado son tres páginas, y con un presupuesto del tamaño del
 * patrón cabe en tres. Pero un presupuesto de ocho partidas no cabe, y el
 * `.page{overflow:hidden}` de la plantilla lo recortaría **en silencio**: el
 * cliente recibiría un PDF sin la mitad de las líneas y con un total que no
 * cuadra con lo que ve. Antes que eso, el documento crece: la oferta ocupa las
 * páginas que necesite y el detalle técnico y las condiciones van detrás.
 */
export function paginarOferta(filas: Fila[]): Fila[][] {
  const paginas: Fila[][] = [];
  let actual: Fila[] = [];
  let alto = 0;
  let presupuesto = ALTO_PRIMERA;

  for (const fila of filas) {
    if (actual.length > 0 && alto + fila.altoMm > presupuesto) {
      // Un «Opción B ·» solo al final de una página, con sus líneas en la
      // siguiente, se lee como un error de maquetación. El encabezado se va
      // con lo que encabeza.
      const viudas: Fila[] = [];
      while (actual.length > 0 && actual[actual.length - 1].tipo === "encabezado") {
        viudas.unshift(actual.pop()!);
      }
      if (actual.length === 0) {
        // Página entera de encabezados: no hay nada que arrastrar.
        actual = viudas;
        viudas.length = 0;
      }
      paginas.push(actual);
      actual = viudas;
      alto = viudas.reduce((n, f) => n + f.altoMm, 0);
      presupuesto = ALTO_CONTINUACION;
    }
    actual.push(fila);
    alto += fila.altoMm;
  }
  paginas.push(actual);

  // Los totales van con la última página de la oferta; si no caben, se llevan
  // a una propia. Un total separado de sus líneas es feo; un total pisando el
  // pie es un documento roto.
  const ultimoAlto = paginas[paginas.length - 1].reduce((n, f) => n + f.altoMm, 0);
  const presupuestoUltima = paginas.length === 1 ? ALTO_PRIMERA : ALTO_CONTINUACION;
  if (ultimoAlto + ALTO_TOTALES > presupuestoUltima) paginas.push([]);

  return paginas;
}

function bloqueTotales(p: PresupuestoRender): string {
  const escenarios = calcularEscenarios(p.partidas.map(aPartidaCalculo));
  const cajas = escenarios
    .map(
      (e) => `    <div class="caja${e.recomendado && escenarios.length > 1 ? " destacada" : ""}">
      <div class="et">${escapeHtml(e.etiqueta)}</div>
      <div class="fila"><span>Base imponible</span><span>${eur(e.totales.baseCents)}</span></div>
      <div class="fila"><span>IVA ${IVA_PCT} %</span><span>${eur(e.totales.ivaCents)}</span></div>
      <div class="fila tot"><span>Total</span><span>${eur(e.totales.totalCents)}</span></div>
    </div>`,
    )
    .join("\n");
  return `  <div class="totales">\n${cajas}\n  </div>`;
}

function fichaTecnica(partida: PartidaRender, opcion: OpcionRender, conAlternativas: boolean, letra: string): string {
  const especs: Array<[string, string | null | undefined]> = [
    ["Medidas", opcion.medidas],
    ["Materiales", opcion.materiales],
    ["Incluye", opcion.incluye],
    ["Uso", opcion.usoRecomendado],
  ];
  const filas = especs
    .filter(([, v]) => v)
    .map(([k, v]) => `        <tr><th>${escapeHtml(k)}</th><td>${escapeMultiline(v)}</td></tr>`)
    .join("\n");

  const titulo = conAlternativas
    ? `${escapeHtml(partida.titulo)} · Opción ${letra} · ${escapeHtml(opcion.nombre)}`
    : escapeHtml(partida.titulo);

  // Solo se pintan las columnas de imagen que TIENEN imagen. La plantilla trae
  // marcos de muestra («Foto producto», «Zona de marcaje con cotas») porque se
  // rellena a mano; en un documento que se manda al cliente, tres pares de
  // recuadros vacíos con rayitas dicen «presupuesto a medio hacer».
  const imagenes = [
    [opcion.fotoProductoUrl, "Producto"],
    [opcion.fotoMarcajeUrl, "Zona de marcaje y cotas"],
  ].filter(([url]) => Boolean(url)) as Array<[string, string]>;

  const columnas =
    imagenes.length === 2 ? "" : ` style="grid-template-columns:${imagenes.length === 1 ? "38mm 1fr" : "1fr"}"`;

  const figuras = imagenes
    .map(
      ([url, pie]) => `    <div>
      <img class="foto" src="${src(url)}" alt="">
      <div class="cap">${escapeHtml(pie)}</div>
    </div>`,
    )
    .join("\n");

  return `  <div class="ficha"${columnas}>
${figuras}${figuras ? "\n" : ""}    <div>
      <h3>${titulo}</h3>
      <table class="especs">
${filas}
        <tr><th>Artes finales</th><td>Vectorial (.ai, .eps o .pdf) con los textos trazados y los colores definidos en Pantone.</td></tr>
      </table>
    </div>
  </div>`;
}

function fichaMarcaje(p: PresupuestoRender): string {
  // Se toma la ficha de marcaje de la primera opción que la tenga rellena: el
  // documento lleva un único bloque, como el formato aprobado.
  const opciones = p.partidas.flatMap((partida) => partida.opciones);
  const conMarcaje = opciones.find((o) => o.marcajeTecnica || o.marcajeAreaMaxima);
  if (!conMarcaje) return "";

  const items: Array<[string, string]> = [
    ["Técnica", conMarcaje.marcajeTecnica ?? "—"],
    ["Número de tintas", conMarcaje.marcajeTintas ?? "—"],
    ["Posición", conMarcaje.marcajePosicion ?? "—"],
    ["Área máxima", conMarcaje.marcajeAreaMaxima ?? "—"],
    ["Formato del arte final", conMarcaje.marcajeFormatoArte ?? "Vectorial (.ai, .eps o .pdf)"],
    ["Mock-up", "Se envía para validación<br>antes de producir"],
  ];

  return `  <div class="marcaje">
    <h4>Ficha de marcaje</h4>
    <div class="rej">
${items
  .map(
    ([k, v]) => `      <div class="it"><div class="k">${escapeHtml(k)}</div><div class="v">${k === "Mock-up" ? v : escapeHtml(v)}</div></div>`,
  )
  .join("\n")}
    </div>
  </div>`;
}

function pie(pagina: number, total: number): string {
  return `  <div class="pie">
    <span>${EMISOR.razonSocial} · CIF ${EMISOR.cif} · ${EMISOR.web}</span>
    <span>Página ${pagina} de ${total}</span>
  </div>`;
}

/**
 * Estilos que la plantilla no trae porque su maqueta es de tamaño fijo: la
 * fila de título de partida y los dos bloques de totales cuando hay dos
 * opciones. Van APARTE del CSS de la plantilla, detrás, para que se vea de un
 * vistazo qué añade el generador y qué es del formato aprobado.
 */
const CSS_GENERADOR = `
  /* — añadidos del generador — */
  .partidas tr.titulo-partida td{
    padding:5mm 0 1.6mm;border-bottom:none;vertical-align:bottom;
  }
  .partidas tr.titulo-partida .t{
    font-family:'Montserrat',sans-serif;font-weight:700;font-size:10.4pt;line-height:1.3;
  }
  .partidas tr.titulo-partida .s{font-size:8.1pt;color:var(--gris);line-height:1.45;margin-top:.8mm}
  .partidas tr.titulo-partida td.num{
    font-family:'Montserrat',sans-serif;font-weight:700;font-size:11pt;color:var(--numeral);
    vertical-align:bottom;
  }
  .totales{gap:6mm}
  .totales .caja{border-top:.5mm solid var(--linea);padding-top:2.6mm}
  .totales .caja.destacada{border-top-color:var(--magenta)}
  .totales .et{
    font-size:6.9pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
    color:var(--magenta);margin-bottom:1.6mm;
  }
  .totales .caja.destacada .et::after{
    content:'RECOMENDADA';margin-left:2.5mm;font-size:6.2pt;color:#fff;background:var(--grad-b);
    padding:.6mm 1.6mm;border-radius:1mm;letter-spacing:.1em;
  }
  .impacto{
    margin-top:4mm;font-size:8.2pt;color:var(--gris);line-height:1.5;
  }
`;

/**
 * Comprueba que en el documento no se haya colado el nombre de un proveedor.
 *
 * El encargo lo dice como regla de redacción, pero una regla de redacción se
 * incumple el día que alguien copia y pega la descripción del portal en el
 * concepto de una línea. Aquí es una condición de salida: si aparece, no hay
 * documento.
 */
export function assertSinFugasDeProveedor(html: string): void {
  // `html.match(re)` en vez de `re.test(html)`: los patrones son globales y
  // `test` sobre un regex global arrastra `lastIndex` entre llamadas, así que
  // el segundo presupuesto del proceso podría no ver una fuga que el primero sí
  // vio. `match` reinicia el índice. Y en vez de reconstruir el regex —que es
  // como se resolvía antes— se usa el original: semgrep bloquea `new RegExp`
  // con un valor que viene de un parámetro (regla de ReDoS), y ya tumbó el CI
  // del PR de la paleta por lo mismo.
  const fugas = PUBLIC_SUPPLIER_LEAK_PATTERNS.filter((p) => html.match(p.re) !== null).map(
    (p) => p.code,
  );
  if (fugas.length > 0) {
    throw new Error(
      `El presupuesto menciona al proveedor (${fugas.join(", ")}). ` +
        `El documento se redacta como producción propia: revisa conceptos, descripciones y notas.`,
    );
  }
}

export function renderPresupuestoHtml(p: PresupuestoRender): string {
  const condiciones = p.condiciones?.length
    ? p.condiciones
    : condicionesEstandar(p.plazoMinDias, p.plazoMaxDias, p.validezDias);

  const fichas = p.partidas
    .flatMap((partida) =>
      partida.opciones.map((opcion, i) =>
        fichaTecnica(partida, opcion, partida.opciones.length > 1, String.fromCharCode(65 + i)),
      ),
    )
    .join("\n");

  const paginasOferta = paginarOferta(filasOferta(p));
  const totalPaginas = paginasOferta.length + 2;

  const cabecera = `  <header class="cab">
    <img class="logo" src="${logoDataUri()}" alt="Startidea">
    <div class="doc">
      <div class="titulo">Presupuesto</div>
      <div class="meta">
        N.º ${escapeHtml(p.numero)}<br>
        <span>Fecha:</span> ${escapeHtml(formatearFechaLarga(p.fecha))}
      </div>
    </div>
  </header>

  <div class="filete"></div>

  <div class="asunto">
    <div class="et">Asunto</div>
    <div class="tx">${escapeHtml(p.asunto)}</div>
  </div>

  <div class="tres">
    <div class="col">
      <h4>Cliente</h4>
      <p>
        <strong>${escapeHtml(p.clienteNombre)}</strong>
        ${p.clienteContacto ? `A la atención de ${escapeHtml(p.clienteContacto)}<br>` : ""}
        ${p.clienteCif ? `CIF ${escapeHtml(p.clienteCif)}<br>` : ""}
        ${p.clienteDireccion ? `${escapeMultiline(p.clienteDireccion)}<br>` : ""}
        ${p.clienteReferencia ? escapeHtml(p.clienteReferencia) : ""}
      </p>
    </div>
    <div class="col">
      <h4>Proveedor</h4>
      <p>
        <strong>${escapeHtml(EMISOR.razonSocial)}</strong>
        CIF ${escapeHtml(EMISOR.cif)}<br>
        ${escapeHtml(EMISOR.direccion)}<br>
        ${escapeHtml(EMISOR.ciudad)}<br>
        ${escapeHtml(EMISOR.telefono)} · ${escapeHtml(EMISOR.email)}
      </p>
    </div>
    <div class="col">
      <h4>Validez</h4>
      <p>
        <strong>${p.validezDias} días naturales</strong>
        Desde la fecha de emisión.<br>
        Producción entre ${p.plazoMinDias} y ${p.plazoMaxDias} días laborables desde la
        validación del arte final.
      </p>
    </div>
  </div>`;

  const paginasOfertaHtml = paginasOferta
    .map((filas, i) => {
      const esUltima = i === paginasOferta.length - 1;
      const cuerpo = [
        i === 0 ? cabecera : `  <div class="barra"></div>\n  <div class="rot">Oferta (continuación)</div>`,
        filas.length > 0 ? tabla(filas) : "",
        esUltima ? bloqueTotales(p) : "",
        esUltima && p.produccionCentroEspecialEmpleo
          ? `  <p class="impacto">${escapeHtml(IMPACTO_SOCIAL)}</p>`
          : "",
        pie(i + 1, totalPaginas),
      ]
        .filter(Boolean)
        .join("\n\n");
      return `<section class="page${i === 0 ? "" : " interior"}">\n${cuerpo}\n</section>`;
    })
    .join("\n\n");

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Presupuesto ${escapeHtml(p.numero)} · ${escapeHtml(EMISOR.razonSocial)}</title>
<style>${plantillaCss()}${CSS_GENERADOR}</style>
</head>
<body>

<!-- ===================== OFERTA ===================== -->
${paginasOfertaHtml}

<!-- ============ DETALLE TÉCNICO Y MEDIDAS DE MARCAJE ============ -->
<section class="page interior">
  <div class="barra"></div>

  <div class="rot">Detalle técnico</div>
  <h2 class="h2">Producto, materiales y medidas de marcaje</h2>

${fichas}

${fichaMarcaje(p)}

${pie(totalPaginas - 1, totalPaginas)}
</section>

<!-- ===================== CONDICIONES ===================== -->
<section class="page interior">
  <div class="barra"></div>

  <div class="rot">Condiciones</div>
  <h2 class="h2">Condiciones de la oferta</h2>

  <div class="cond">
${condiciones
  .map(
    (c) => `    <div class="i">
      <div>
        <h4>${escapeHtml(c.titulo)}</h4>
        <p>${escapeMultiline(c.texto)}</p>
      </div>
    </div>`,
  )
  .join("\n")}
  </div>

${
  p.notaTecnica
    ? `  <div class="notas">
    <h4>${escapeHtml(p.notaTecnicaTitulo || "Notas técnicas")}</h4>
    <p>${escapeMultiline(p.notaTecnica)}</p>
  </div>`
    : ""
}

  <div class="cierre">
    <div class="n">${escapeHtml(EMISOR.razonSocial)}</div>
    <div class="l">${escapeHtml(EMISOR.marca)} · ${escapeHtml(EMISOR.web)}</div>
    ${p.cierreTexto ? `<div class="l">${escapeMultiline(p.cierreTexto)}</div>` : ""}
    <div class="datos">
      <span>CIF ${escapeHtml(EMISOR.cif)}</span>
      <span>${escapeHtml(EMISOR.direccion)} · ${escapeHtml(EMISOR.ciudad)}</span>
      <span>${escapeHtml(EMISOR.telefono)}</span>
      <span>${escapeHtml(EMISOR.email)}</span>
    </div>
  </div>

${pie(totalPaginas, totalPaginas).replace('class="pie"', 'class="pie" style="bottom:6mm"')}
</section>

</body>
</html>
`;

  assertSinFugasDeProveedor(html);
  return html;
}
