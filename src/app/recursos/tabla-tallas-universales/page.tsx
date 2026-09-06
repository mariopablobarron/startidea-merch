import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WhatsAppFloat } from "@/components/WhatsAppFloat";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title:
    "Tabla de tallas universales para merchandising textil (B&C, Sols y equivalencias)",
  description:
    "Equivalencias entre las principales marcas de textil promocional. Medidas de pecho y largo para camiseta, polo y sudadera. Evita pedidos con tallas equivocadas.",
  alternates: {
    canonical:
      "https://merchandising.startidea.es/recursos/tabla-tallas-universales",
  },
  openGraph: {
    url: "https://merchandising.startidea.es/recursos/tabla-tallas-universales",
    title: "Tabla de tallas universales para merch textil",
    description:
      "Equivalencias B&C / Sols en cm. Cómo medir bien antes de pedir.",
    type: "article",
  },
};

type SizeRow = {
  size: string;
  bcChest: string;
  bcLength: string;
  solsChest: string;
  solsLength: string;
};

const MEN_TEE_SIZES: SizeRow[] = [
  { size: "S",   bcChest: "50",   bcLength: "70",  solsChest: "48-50", solsLength: "70" },
  { size: "M",   bcChest: "53",   bcLength: "72",  solsChest: "51-53", solsLength: "72" },
  { size: "L",   bcChest: "56",   bcLength: "74",  solsChest: "54-56", solsLength: "74" },
  { size: "XL",  bcChest: "60",   bcLength: "76",  solsChest: "58-60", solsLength: "76" },
  { size: "XXL", bcChest: "64",   bcLength: "78",  solsChest: "62-64", solsLength: "78" },
  { size: "3XL", bcChest: "68",   bcLength: "80",  solsChest: "66-68", solsLength: "80" },
];

const WOMEN_TEE_SIZES: SizeRow[] = [
  { size: "XS",  bcChest: "42",   bcLength: "60",  solsChest: "40-42", solsLength: "60" },
  { size: "S",   bcChest: "44",   bcLength: "62",  solsChest: "42-44", solsLength: "62" },
  { size: "M",   bcChest: "46",   bcLength: "64",  solsChest: "44-46", solsLength: "64" },
  { size: "L",   bcChest: "48",   bcLength: "66",  solsChest: "46-48", solsLength: "66" },
  { size: "XL",  bcChest: "50",   bcLength: "68",  solsChest: "48-50", solsLength: "68" },
  { size: "XXL", bcChest: "54",   bcLength: "70",  solsChest: "52-54", solsLength: "70" },
];

const POLO_MEN_SIZES: SizeRow[] = [
  { size: "S",   bcChest: "51",   bcLength: "70",  solsChest: "50",    solsLength: "70" },
  { size: "M",   bcChest: "54",   bcLength: "72",  solsChest: "53",    solsLength: "72" },
  { size: "L",   bcChest: "57",   bcLength: "74",  solsChest: "56",    solsLength: "74" },
  { size: "XL",  bcChest: "60",   bcLength: "76",  solsChest: "59",    solsLength: "76" },
  { size: "XXL", bcChest: "64",   bcLength: "78",  solsChest: "63",    solsLength: "78" },
];

type MeasureTip = { title: string; body: string };
const MEASURE_TIPS: MeasureTip[] = [
  {
    title: "Mide siempre PECHO (no espalda)",
    body: "La medida estándar de la industria es ancho de pecho de costura a costura, con la prenda plana y abrochada. Multiplica por 2 para obtener perímetro. La medida de espalda varía entre marcas y no se usa para tallaje.",
  },
  {
    title: "Largo desde el cuello, no desde el hombro",
    body: "Medida estándar: desde el centro del cuello (hombro alto) hasta el bajo de la prenda. Si tu cliente envía «largo 70cm desde hombro», pídele aclarar porque ese punto no es estándar.",
  },
  {
    title: "Hombre vs unisex no es igual que mujer",
    body: "Una M de polo hombre suele equivaler a una L de polo mujer. Si el cliente pide «20 polos M variados», pregúntale el desglose por género. No asumas unisex sin confirmar.",
  },
  {
    title: "Tallas grandes: confirma stock antes",
    body: "3XL y 4XL no siempre están disponibles en todas las gamas. Si el pedido pide tallas grandes, valídalas con el proveedor antes de cerrar precio — pueden subir 20-30% sobre la talla base.",
  },
  {
    title: "Niño: la edad no es talla",
    body: "Los productos infantiles vienen por talla (3-4, 5-6, 7-8, 9-11, 12-14 años) o por cm (104, 116, 128, 140, 152). Confirma el sistema con el proveedor; la edad puede variar 1-2 años entre marcas según corte.",
  },
];

function SizeTable({ rows, label }: { rows: SizeRow[]; label: string }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-bone-soft">
      <p className="border-b border-line bg-bone px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-ink/70">
        {label} · medidas en cm
      </p>
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-line bg-bone-soft text-left">
          <tr>
            <th className="px-3 py-3 font-medium text-ink/70">Talla</th>
            <th className="px-3 py-3 font-medium text-ink/70">B&amp;C · Pecho</th>
            <th className="px-3 py-3 font-medium text-ink/70">B&amp;C · Largo</th>
            <th className="px-3 py-3 font-medium text-ink/70">Sols · Pecho</th>
            <th className="px-3 py-3 font-medium text-ink/70">Sols · Largo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.size} className="border-b border-line/60 hover:bg-bone">
              <td className="px-3 py-3 font-mono text-sm font-semibold text-accent">
                {r.size}
              </td>
              <td className="px-3 py-3 font-mono text-xs text-ink/80">{r.bcChest}</td>
              <td className="px-3 py-3 font-mono text-xs text-ink/80">{r.bcLength}</td>
              <td className="px-3 py-3 font-mono text-xs text-ink/80">{r.solsChest}</td>
              <td className="px-3 py-3 font-mono text-xs text-ink/80">{r.solsLength}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TablaTallasPage() {
  return (
    <>
      <JsonLd
        data={
          breadcrumbJsonLd([
            { name: "Inicio", url: "/" },
            { name: "Recursos", url: "/recursos" },
            {
              name: "Tabla de tallas universales",
              url: "/recursos/tabla-tallas-universales",
            },
          ]) as never
        }
      />
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-14 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <nav className="mb-4 text-xs text-ink/50">
              <Link href="/recursos" className="hover:text-accent">
                ← Todos los recursos
              </Link>
            </nav>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Producción · Textil
            </p>
            <h1 className="mt-3 font-display text-section font-semibold leading-tight text-ink">
              Tabla de tallas universales:
              <br />
              <span className="text-accent">B&amp;C vs Sols en una sola hoja.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-ink/75">
              Una L de B&amp;C no es exactamente igual a una L de Sols. Si tu
              pedido mezcla marcas (porque no había stock de una talla), los
              clientes acaban con prendas que parecen del mismo modelo pero con
              2cm de diferencia. Aquí están las medidas reales en cm para que
              tu cliente y tú pidáis con datos.
            </p>
          </div>
        </section>

        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-6xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Camiseta hombre / unisex
            </h2>
            <SizeTable rows={MEN_TEE_SIZES} label="Camiseta · corte hombre o unisex" />

            <h2 className="mt-12 font-display text-3xl font-semibold text-ink">
              Camiseta mujer
            </h2>
            <SizeTable rows={WOMEN_TEE_SIZES} label="Camiseta · corte mujer (entallada)" />

            <h2 className="mt-12 font-display text-3xl font-semibold text-ink">
              Polo hombre
            </h2>
            <SizeTable rows={POLO_MEN_SIZES} label="Polo · corte hombre" />

            <p className="mt-6 rounded-2xl bg-accent-wash p-5 text-sm text-ink/80">
              <strong>Nota:</strong> medidas orientativas basadas en catálogos
              2026 de cada marca. La tolerancia de fábrica es ±1-1,5 cm. Para
              uniformes técnicos pide siempre ficha técnica del proveedor con
              medidas oficiales por SKU.
            </p>
          </div>
        </section>

        {/* Cómo medir bien */}
        <section className="border-b border-line bg-bone py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cómo medir bien antes de pedir
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Cinco reglas que evitan el 90% de los pedidos mal tallados.
            </p>
            <ul className="mt-8 space-y-5">
              {MEASURE_TIPS.map((t, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-3xl border border-line bg-bone-soft p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-base font-semibold text-accent-deep">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-lg font-semibold text-ink">
                      {t.title}
                    </p>
                    <p className="mt-1 text-sm text-ink/70">{t.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Formato para pedir */}
        <section className="border-b border-line py-14">
          <div className="mx-auto max-w-4xl px-6 lg:px-10">
            <h2 className="font-display text-3xl font-semibold text-ink">
              Cómo enviar el desglose de tallas a tu proveedor
            </h2>
            <p className="mt-3 text-base text-ink/70">
              Formato copy-paste que evita malentendidos:
            </p>
            <pre className="mt-6 overflow-x-auto rounded-3xl border border-line bg-ink p-6 text-sm text-bone">
              <code>{`Pedido: 100 polos
Modelo: B&C ID.001 corte hombre, color marino
Marcaje: bordado a 1 color, pecho izquierdo

Desglose por talla:
- S   ×  10
- M   ×  30
- L   ×  35
- XL  ×  20
- XXL ×   5

Fecha tope mockup: 12 jun
Fecha tope producción: 25 jun`}</code>
            </pre>
            <p className="mt-4 text-sm text-ink/60">
              Especificar siempre marca + modelo + corte + color + desglose
              numérico por talla. Si tu pedido lleva mezcla de modelos (camiseta +
              polo + sudadera), haz un bloque por cada uno.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-ink py-16 text-bone">
          <div className="mx-auto max-w-4xl px-6 text-center lg:px-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bone/60">
              ¿Tienes el desglose por talla?
            </p>
            <h2 className="mt-3 font-display text-3xl font-semibold lg:text-4xl">
              Pásalo y te devolvemos cotización en 24h.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-bone/75">
              Con el desglose claro evitamos el ping-pong de «¿qué tallas son?»
              y aceleramos el mockup. Mejor aún si nos dices Pantone del marcaje.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/#cotizar"
                className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-semibold text-bone transition hover:bg-accent-deep"
              >
                Pedir cotización
              </Link>
              <Link
                href="/recursos/especificaciones-mockup"
                className="inline-flex items-center justify-center rounded-full border border-bone/30 px-7 py-3 text-sm font-medium text-bone transition hover:bg-bone/10"
              >
                Ver specs para mockup →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppFloat />
    </>
  );
}
