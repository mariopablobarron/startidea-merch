import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { obtenerPresupuesto } from "@/lib/presupuesto-repo";
import { leerMargenes } from "@/lib/presupuesto-margenes";
import {
  PresupuestoEditor,
  type PresupuestoForm,
} from "@/components/admin/PresupuestoEditor";
import type { TipoLinea } from "@/lib/presupuesto-calculo";

export const metadata: Metadata = {
  title: "Editar presupuesto",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditarPresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { id } = await params;
  const [presupuesto, margenes] = await Promise.all([obtenerPresupuesto(id), leerMargenes()]);
  if (!presupuesto) notFound();

  const inicial: PresupuestoForm = {
    asunto: presupuesto.asunto,
    estado: presupuesto.estado,
    clienteNombre: presupuesto.clienteNombre,
    clienteContacto: presupuesto.clienteContacto ?? "",
    clienteReferencia: presupuesto.clienteReferencia ?? "",
    clienteCif: presupuesto.clienteCif ?? "",
    clienteDireccion: presupuesto.clienteDireccion ?? "",
    clienteEmail: presupuesto.clienteEmail ?? "",
    validezDias: presupuesto.validezDias,
    plazoMinDias: presupuesto.plazoMinDias,
    plazoMaxDias: presupuesto.plazoMaxDias,
    margenObjetivoPct: presupuesto.margenObjetivoPct,
    notaTecnicaTitulo: presupuesto.notaTecnicaTitulo ?? "",
    notaTecnica: presupuesto.notaTecnica ?? "",
    cierreTexto: presupuesto.cierreTexto ?? "",
    produccionCentroEspecialEmpleo: presupuesto.produccionCentroEspecialEmpleo,
    partidas: presupuesto.partidas.map((partida) => ({
      titulo: partida.titulo,
      descripcion: partida.descripcion ?? "",
      opciones: partida.opciones.map((opcion) => ({
        nombre: opcion.nombre,
        recomendada: opcion.recomendada,
        fotoProductoUrl: opcion.fotoProductoUrl ?? "",
        fotoMarcajeUrl: opcion.fotoMarcajeUrl ?? "",
        medidas: opcion.medidas ?? "",
        materiales: opcion.materiales ?? "",
        incluye: opcion.incluye ?? "",
        usoRecomendado: opcion.usoRecomendado ?? "",
        marcajeTecnica: opcion.marcajeTecnica ?? "",
        marcajeTintas: opcion.marcajeTintas ?? "",
        marcajePosicion: opcion.marcajePosicion ?? "",
        marcajeAreaMaxima: opcion.marcajeAreaMaxima ?? "",
        marcajeFormatoArte: opcion.marcajeFormatoArte ?? "",
        lineas: opcion.lineas.map((linea) => ({
          tipo: linea.tipo as TipoLinea,
          concepto: linea.concepto,
          descripcion: linea.descripcion ?? "",
          referencia: linea.referencia ?? "",
          imagenUrl: linea.imagenUrl ?? "",
          cantidad: linea.cantidad,
          costeUnitCents: linea.costeUnitCents,
          margenPct: linea.margenPct,
          pvpUnitCents: linea.pvpUnitCents,
        })),
      })),
    })),
  };

  return (
    <div className="space-y-4">
      <Link href="/admin/presupuestos" className="text-sm text-ink/50 hover:text-accent">
        ← Presupuestos
      </Link>
      <PresupuestoEditor
        id={presupuesto.id}
        numero={presupuesto.numero}
        inicial={inicial}
        margenPorDefecto={margenes.pordefecto}
      />
    </div>
  );
}
