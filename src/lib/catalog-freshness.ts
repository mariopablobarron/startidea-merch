/**
 * Frescura del catálogo: qué fichas ACTIVAS ha dejado de refrescar su sync.
 *
 * POR QUÉ HACE FALTA. Los syncs de proveedor corren cada madrugada y dejan su
 * huella en `Product.syncedAt`. Si un producto sigue ACTIVO pero su `syncedAt`
 * se quedó atrás, el feed ya no lo trae: el proveedor lo retiró, le cambió la
 * referencia o dejó de casar con él. La ficha sigue publicada y se puede pedir,
 * con el precio y el stock del día en que dejó de actualizarse.
 *
 * Medido en producción el 2026-09-06: **81 fichas activas** de dos proveedores
 * CON sync automático llevaban entre uno y tres meses sin refrescarse (50 de
 * uno, 31 del otro; la más vieja, del 5 de junio). Ninguna de las cuatro
 * vigilancias que ya había podía verlo: `cron-watchdog` mira que los crons se
 * ejecuten (y se ejecutan), `detectStalledSyncs` mira ejecuciones que mueren a
 * mitad (y estas cierran bien), `tariff-coverage-watchdog` mira cobertura de
 * tarifa y `supplier-ref-en-descripcion` mira fuga de marca. Un sync que
 * termina en verde habiendo omitido productos no rompe ninguna: la señal no
 * está en la ejecución, está en el dato que quedó atrás.
 *
 * QUÉ NO ES. No todo `syncedAt` viejo es un fallo: hay proveedores sin API
 * cuyo catálogo se carga a mano, y para ellos «llevar meses sin sync» es lo
 * normal. Por eso el corte no se hace por proveedor a mano sino leyendo
 * `Supplier.hasAutoSync`: así la vigilancia sigue diciendo la verdad si algún
 * día un proveedor manual pasa a automático, sin tocar este fichero.
 *
 * NO ARREGLA NADA POR SU CUENTA. Desactivar una ficha o corregir su precio es
 * decisión comercial: esto cuenta, agrupa y avisa.
 */

/** Lo mínimo que hace falta de cada producto. */
export type ProductoFrescura = {
  slug: string;
  supplier: string;
  syncedAt: Date | null;
};

/** Modo de cada proveedor, tal y como está declarado en la tabla `Supplier`. */
export type ModoProveedor = {
  code: string;
  hasAutoSync: boolean;
};

export type FichaObsoleta = {
  slug: string;
  supplier: string;
  /** Días completos desde el último refresco. `null` si nunca se sincronizó. */
  dias: number | null;
};

export type FrescuraCatalogo = {
  /** Fichas activas de proveedores CON sync automático que el sync ya no refresca. */
  obsoletas: FichaObsoleta[];
  /** Cuántas obsoletas por proveedor (solo los vigilados). */
  porProveedor: Record<string, number>;
  /**
   * Fichas activas de proveedores SIN sync automático cuyo dato es viejo.
   * Se cuentan aparte y NO disparan aviso: en un catálogo manual es lo esperado.
   */
  manualesAntiguas: Record<string, number>;
  /**
   * Proveedores que aparecen en productos pero no están declarados en
   * `Supplier`. Se vigilan igual (es lo conservador: si no consta que sea
   * manual, se le exige frescura) y se nombran para poder declararlos.
   */
  proveedoresNoDeclarados: string[];
  /** Total de `obsoletas`, que es la cifra sobre la que se aplica el umbral. */
  total: number;
};

const MS_DIA = 24 * 60 * 60 * 1000;

function diasDesde(syncedAt: Date | null, ahora: Date): number | null {
  if (!syncedAt) return null;
  return Math.floor((ahora.getTime() - syncedAt.getTime()) / MS_DIA);
}

/**
 * Clasifica el catálogo por frescura. Función pura: recibe los datos ya leídos
 * para poder probarla sin base de datos.
 *
 * @param diasUmbral Días sin refrescar a partir de los cuales una ficha de un
 * proveedor automático cuenta como obsoleta. Los syncs corren a diario, así que
 * cualquier valor por encima de 1 tolera el fallo puntual de una noche.
 */
export function clasificarFrescura(params: {
  productos: ProductoFrescura[];
  proveedores: ModoProveedor[];
  ahora: Date;
  diasUmbral: number;
}): FrescuraCatalogo {
  const { productos, proveedores, ahora, diasUmbral } = params;

  const modo = new Map<string, boolean>();
  for (const p of proveedores) modo.set(p.code, p.hasAutoSync);

  const corte = new Date(ahora.getTime() - diasUmbral * MS_DIA);

  const obsoletas: FichaObsoleta[] = [];
  const porProveedor: Record<string, number> = {};
  const manualesAntiguas: Record<string, number> = {};
  const noDeclarados = new Set<string>();

  for (const prod of productos) {
    // `syncedAt` nulo cuenta como obsoleto: nunca llegó a refrescarse.
    const viejo = prod.syncedAt === null || prod.syncedAt < corte;
    if (!viejo) continue;

    const declarado = modo.has(prod.supplier);
    if (!declarado) noDeclarados.add(prod.supplier);

    // Si no consta, se vigila: preferimos un aviso de más a un silencio.
    const automatico = declarado ? modo.get(prod.supplier) === true : true;

    if (automatico) {
      obsoletas.push({ slug: prod.slug, supplier: prod.supplier, dias: diasDesde(prod.syncedAt, ahora) });
      porProveedor[prod.supplier] = (porProveedor[prod.supplier] ?? 0) + 1;
    } else {
      manualesAntiguas[prod.supplier] = (manualesAntiguas[prod.supplier] ?? 0) + 1;
    }
  }

  // Las más antiguas primero: son las que peor dato publican.
  obsoletas.sort((a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER));

  return {
    obsoletas,
    porProveedor,
    manualesAntiguas,
    proveedoresNoDeclarados: [...noDeclarados].sort(),
    total: obsoletas.length,
  };
}
