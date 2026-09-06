import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CalculadoraRscClient } from "./CalculadoraRscClient";

export const metadata: Metadata = {
  title: "Calculadora ROI RSC · cuánto impacto genera tu merchandising",
  description:
    "Estima en 30 segundos cuánto CO₂ ahorrarías y cuántas horas de trabajo digno generarías al producir tu merchandising corporativo en Centros Especiales de Empleo. Certificado PDF firmado para tu memoria de sostenibilidad.",
  openGraph: {
    title: "Calculadora ROI RSC · TodoMerchandising",
    description:
      "kg CO₂ ahorrados, horas de trabajo digno generadas, % producido en CEE. Datos verificables para tu memoria GRI/EFRAG.",
  },
};

export default function CalculadoraRscPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-bone-soft">
        <section className="bg-bone">
          <div className="mx-auto max-w-4xl px-6 pt-16 pb-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Recurso gratuito
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold text-ink leading-tight md:text-5xl">
              Calculadora ROI RSC.<br />
              <span className="text-accent">Cuánto impacto generaría tu merchandising.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/70 leading-relaxed">
              En 30 segundos sabrás cuántos <strong>kg de CO₂ ahorrarías</strong>,
              cuántas <strong>horas de trabajo digno</strong> generarías y qué % de
              tu producción sería en <strong>Centros Especiales de Empleo</strong>
              si reasignas parte de tu presupuesto actual a producción local
              + ética.
            </p>
            <p className="mt-4 max-w-3xl text-sm text-ink/60">
              Al final tienes un <strong>certificado PDF firmado por nosotros</strong> con los datos
              listos para incluir en tu memoria de sostenibilidad (GRI / EFRAG / VSME).
              Gratis, sin compromiso.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-12">
          <CalculadoraRscClient />
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-20">
          <details className="rounded-2xl border border-line bg-white p-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              ¿De dónde salen las cifras?
            </summary>
            <div className="mt-4 space-y-3 text-sm text-ink/70 leading-relaxed">
              <p>
                <strong>kg CO₂ ahorrados</strong>: estimación de 5 kg CO₂ por cada
                100 € reasignados de producción asiática a producción local + CEE
                (equivale a ~1,5-2 kg CO₂ por kg de producto en pedidos medios).
                Basado en análisis de ciclo de vida de catálogo europeo de
                importación frente a producción en Andalucía y estudios
                ICAEN/INEGA — principalmente flete asiático evitado.
              </p>
              <p>
                <strong>Horas de trabajo digno</strong>: coste laboral medio CEE
                Andalucía 2026 = 18 €/h (incluye Seguridad Social). Fuente: ACEEM
                Andalucía + Boletín CEE.
              </p>
              <p>
                <strong>Árboles equivalentes</strong>: 21 kg CO₂/año = absorción media
                de un árbol joven en clima mediterráneo (CSIC).
              </p>
              <p className="text-ink/55">
                Estas cifras son <strong>estimaciones de partida</strong>. Si lanzas un pedido
                con nosotros, te emitimos certificado <strong>auditado y firmado</strong> con los
                datos reales de producción.
              </p>
            </div>
          </details>
        </section>
      </main>
      <Footer />
    </>
  );
}
