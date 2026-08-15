import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "API pública · TodoMerchandising",
  description:
    "Documentación oficial de la API REST de TodoMerchandising para integrar el catálogo y el sistema de cotizaciones en sistemas corporativos.",
};

const SITE = "https://merchandising.startidea.es";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-line-dark bg-ink p-5 text-[12px] leading-relaxed text-bone">
      <code>{children}</code>
    </pre>
  );
}

export default function ApiDocsPage() {
  return (
    <>
      <Nav />
      <main className="bg-bone-soft">
        <section className="border-b border-line bg-bone py-14 lg:py-16">
          <div className="mx-auto max-w-8xl px-6 lg:px-10">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              Para developers
            </p>
            <h1 className="font-display text-section font-semibold text-ink">API REST oficial.</h1>
            <p className="mt-4 max-w-3xl text-lg text-ink/70">
              Integra el catálogo de TodoMerchandising y el sistema de cotizaciones en tu
              ERP, intranet o portal de empleados. Auth simple, JSON, REST.
            </p>
            <p className="mt-3 text-sm text-ink/60">
              Para conseguir tu API key, escribe a{" "}
              <a href="mailto:pedidos@startidea.es" className="text-accent underline-offset-4 hover:underline">
                pedidos@startidea.es
              </a>{" "}
              indicando empresa y caso de uso.
            </p>
          </div>
        </section>

        <section className="py-12 lg:py-16">
          <div className="mx-auto max-w-3xl px-6 space-y-12 lg:px-10">
            {/* Auth */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Autenticación</h2>
              <p className="mt-3 text-[15px] text-ink/75">
                Todas las llamadas requieren cabecera{" "}
                <code className="rounded bg-bone px-1.5 py-0.5 text-[12px]">Authorization: Bearer &lt;tu-key&gt;</code>.
                El formato del key es{" "}
                <code className="rounded bg-bone px-1.5 py-0.5 text-[12px]">merch_live_XXXXXXXX_YYYYYYYY…</code>.
                La parte tras el segundo guión bajo es secreta — guárdala en tu sistema de
                secretos.
              </p>
            </div>

            {/* Catálogo */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">GET /api/v1/products</h2>
              <p className="mt-2 text-sm text-ink/60">
                Catálogo paginado · scope <code className="rounded bg-bone-soft px-1.5">read:catalog</code>
              </p>
              <p className="mt-3 text-[15px] text-ink/75">
                Listado de productos activos con variantes, dimensiones y áreas de marcaje.
                Soporta búsqueda parcial por nombre y paginación.
              </p>
              <p className="mt-3 text-sm text-ink/65">
                Usa <code className="rounded bg-bone-soft px-1.5">variantId</code> para seleccionar
                una variante al crear una cotización. El campo <code className="rounded bg-bone-soft px-1.5">sku</code>
                se mantiene temporalmente como alias del mismo ID opaco y está deprecado.
              </p>
              <Code>{`curl -s "${SITE}/api/v1/products?q=botella&page=1&pageSize=20" \\
  -H "Authorization: Bearer merch_live_XXXXXXXX_YYYY..."`}</Code>
              <p className="mt-3 text-xs text-ink/60">Respuesta abreviada:</p>
              <Code>{`{
  "page": 1, "pageSize": 20, "total": 142, "totalPages": 8,
  "items": [
    {
      "ref": "STM-A7B2C9",
      "slug": "atoll-100",
      "name": "ATOLL 100",
      "brand": "TodoMerchandising",
      "description": "Toalla de microfibra 100x150cm…",
      "material": "PE",
      "countryOfOrigin": "CN",
      "dimensions": { "length_mm": 1000, "width_mm": 1500, "height_mm": 0, "weight_g": 280 },
      "image": "https://merchandising.startidea.es/api/m/A7B2C9XK",
      "category": { "name": "Toallas deportivas", "slug": "toallas-deportivas" },
      "variants": [
        { "variantId": "cmvariant7f4k2", "sku": "cmvariant7f4k2",
          "colorName": "Negro", "colorGroup": "Negro", "stockQty": 1240,
          "gtin": "8719941007840", "size": null }
      ],
      "marking": [
        { "position": "UPPER MIDDLE", "max_width_mm": 280, "max_height_mm": 230,
          "techniques": [{ "code": "EM", "name": "Bordado", "max_colors": 8 }] }
      ]
    }
  ]
}`}</Code>
            </div>

            {/* Crear cotización */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">POST /api/v1/quotes</h2>
              <p className="mt-2 text-sm text-ink/60">
                Crear cotización · scope <code className="rounded bg-bone-soft px-1.5">write:quote</code>
              </p>
              <p className="mt-3 text-[15px] text-ink/75">
                Crea una nueva cotización con uno o más productos. Te devuelve el ID y un
                mensaje. Si configuras cantidad y marcaje, el precio del item se calcula
                al instante en el response; para condiciones especiales o mockup técnico,
                un humano cierra el presupuesto en menos de 24h laborables.
              </p>
              <Code>{`curl -X POST "${SITE}/api/v1/quotes" \\
  -H "Authorization: Bearer merch_live_XXXXXXXX_YYYY..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "contact": {
      "name": "Mario Pablo",
      "email": "mario@empresa.com",
      "company": "ACME",
      "phone": "+34 600 000 000"
    },
    "shipping": {
      "address": "C/ Mayor 1",
      "postalCode": "28001",
      "city": "Madrid",
      "country": "ES",
      "vatNumber": "ESB12345678"
    },
    "brief": "Welcome packs para 80 nuevas incorporaciones Q3.",
    "deadline": "2026-09-15",
    "items": [
      {
        "ref": "STM-A7B2C9",
        "quantity": 100,
        "variantId": "cmvariant7f4k2",
        "marking": { "position": "UPPER MIDDLE", "technique": "EM", "colours": 2 },
        "notes": "Logo en hilo dorado preferentemente"
      }
    ]
  }'`}</Code>
              <Code>{`{
  "id": "cmh1234abcdefg",
  "itemsCount": 1,
  "message": "Cotización recibida. Te responderemos por email…"
}`}</Code>
            </div>

            {/* Consultar */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">GET /api/v1/quotes/{"{id}"}</h2>
              <p className="mt-2 text-sm text-ink/60">
                Consulta estado · scope <code className="rounded bg-bone-soft px-1.5">read:quote</code>
              </p>
              <p className="mt-3 text-[15px] text-ink/75">
                Devuelve el estado actual de la cotización: precio negociado, depósito,
                URL de pago, items con marcaje, pagos recibidos.
              </p>
              <Code>{`curl -s "${SITE}/api/v1/quotes/cmh1234abcdefg" \\
  -H "Authorization: Bearer merch_live_XXXXXXXX_YYYY..."`}</Code>
              <Code>{`{
  "id": "cmh1234abcdefg",
  "createdAt": "2026-05-06T10:23:45.000Z",
  "status": "SENT",  // NEW, IN_PROGRESS, SENT, CONFIRMED, ORDERED, ARCHIVED
  "pricing": {
    "acceptedTotalCents": 124550,
    "depositPercent": 50,
    "paid": 0,
    "paymentUrl": "${SITE}/pay/pay_XXXX..."
  },
  "fulfillment": {
    "supplierOrderId": null,
    "supplierOrderStatus": null,
    "confirmedAt": null,
    "orderedAt": null
  },
  "items": [ ... ]
}`}</Code>
            </div>

            {/* Errores */}
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">Códigos de error</h2>
              <ul className="mt-3 space-y-2 text-[15px] text-ink/75">
                <li>
                  <code className="rounded bg-bone-soft px-1.5">401</code> — key inválida o ausente
                </li>
                <li>
                  <code className="rounded bg-bone-soft px-1.5">403</code> — falta scope necesario
                </li>
                <li>
                  <code className="rounded bg-bone-soft px-1.5">404</code> — recurso no encontrado
                </li>
                <li>
                  <code className="rounded bg-bone-soft px-1.5">422</code> — refs de productos no existen en catálogo
                </li>
                <li>
                  <code className="rounded bg-bone-soft px-1.5">429</code> — rate limit (default 100 req/h por key)
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-line bg-bone p-7 lg:p-8">
              <h3 className="font-display text-xl font-semibold text-ink">¿Necesitas algo más?</h3>
              <p className="mt-2 text-[15px] text-ink/75">
                Webhooks de cambio de estado, aprobación de mockups via API, generación de
                PDF de propuesta vía API, integración con tu ERP. Todo se puede.
              </p>
              <Link
                href="mailto:pedidos@startidea.es?subject=Integraci%C3%B3n%20API%20enterprise"
                className="mt-5 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bone hover:bg-accent"
              >
                Hablamos →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
