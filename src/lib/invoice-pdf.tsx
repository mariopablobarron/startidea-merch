/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

/**
 * Genera un PDF de factura conforme a normativa fiscal española.
 *
 * Requisitos legales (Reglamento facturación RD 1619/2012):
 *  - Número correlativo y serie único
 *  - Fecha emisión
 *  - Datos completos emisor (razón social, CIF, dirección)
 *  - Datos receptor (nombre o razón social, NIF/CIF si dispone, dirección)
 *  - Descripción operación
 *  - Base imponible
 *  - Tipo IVA aplicado
 *  - Cuota IVA
 *  - Total
 *
 * Por defecto aplica IVA 21% (general España). Si el cliente proporcionó
 * VAT number intracomunitario válido, se podría hacer inversión sujeto
 * pasivo (IVA 0%) — esto NO se valida automáticamente, requiere chequeo
 * VIES manual desde admin. Por ahora siempre 21%.
 */

const C = {
  ink: "#231F27",
  bone: "#FFFFFF",
  boneSoft: "#FAF8F4",
  line: "#E6E1D6",
  accent: "#C41D51",
  accentDeep: "#8F1039",
  inkMute: "#6B6B6B",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.ink,
    padding: 36,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brand: { fontSize: 16, fontWeight: 700, letterSpacing: -0.3 },
  brandAccent: { color: C.accent },
  brandSub: { fontSize: 8, color: C.inkMute, marginTop: 2 },
  invoiceLabel: {
    fontSize: 8,
    color: C.accent,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
    textAlign: "right",
  },
  invoiceNumber: { fontSize: 18, fontWeight: 700, textAlign: "right" },
  invoiceDate: { fontSize: 8, color: C.inkMute, marginTop: 4, textAlign: "right" },
  partiesRow: {
    flexDirection: "row",
    gap: 24,
    marginTop: 28,
    marginBottom: 32,
  },
  partyBlock: { flex: 1 },
  partyLabel: {
    fontSize: 7,
    color: C.inkMute,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  partyName: { fontSize: 11, fontWeight: 700, marginBottom: 4 },
  partyLine: { fontSize: 9, marginBottom: 2 },
  table: {
    marginTop: 8,
    borderTop: 1,
    borderTopColor: C.line,
  },
  tableHead: {
    flexDirection: "row",
    paddingVertical: 6,
    backgroundColor: C.boneSoft,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottom: 1,
    borderBottomColor: C.line,
  },
  cellDesc: { flex: 4, paddingHorizontal: 6 },
  cellQty: { flex: 1, paddingHorizontal: 6, textAlign: "right" },
  cellUnit: { flex: 1.5, paddingHorizontal: 6, textAlign: "right" },
  cellTotal: { flex: 1.5, paddingHorizontal: 6, textAlign: "right", fontWeight: 700 },
  cellHead: { fontSize: 8, fontWeight: 700, color: C.inkMute, textTransform: "uppercase" },
  totalsBlock: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: "50%",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: { fontSize: 9, color: C.inkMute },
  totalValue: { fontSize: 10, fontWeight: 700 },
  grandTotal: {
    marginTop: 6,
    paddingTop: 8,
    borderTop: 1,
    borderTopColor: C.ink,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  grandLabel: { fontSize: 11, fontWeight: 700 },
  grandValue: { fontSize: 14, fontWeight: 700, color: C.accent },
  paymentBox: {
    marginTop: 28,
    padding: 12,
    backgroundColor: C.boneSoft,
    borderRadius: 4,
  },
  paymentLabel: {
    fontSize: 7,
    color: C.inkMute,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  paymentText: { fontSize: 9 },
  footer: {
    marginTop: 32,
    paddingTop: 12,
    borderTop: 1,
    borderTopColor: C.line,
    fontSize: 7,
    color: C.inkMute,
    lineHeight: 1.5,
  },
});

export type InvoiceData = {
  invoiceNumber: string;
  issuedAt: Date;
  customer: {
    name: string;
    company?: string | null;
    vatNumber?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    email: string;
  };
  paymentMethod: string; // "Tarjeta · Stripe" | "Bizum" | "Transferencia" | ...
  paymentDate: Date;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number; // sin IVA
    totalCents: number; // sin IVA
  }>;
  baseCents: number; // suma items sin IVA
  vatRate: number; // 0.21 por defecto
  vatCents: number;
  totalCents: number; // base + vat
};

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export async function generateInvoicePdfBuffer(data: InvoiceData): Promise<Buffer> {
  const buf = await renderToBuffer(<InvoiceDocument data={data} />);
  return Buffer.from(buf);
}

function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document
      title={`Factura ${data.invoiceNumber}`}
      author="STARTIDEA MALAGA SL"
      creator="TodoMerchandising"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>
              todo<Text style={styles.brandAccent}>merchandising</Text>
            </Text>
            <Text style={styles.brandSub}>una iniciativa de Startidea</Text>
            <Text style={[styles.partyLine, { marginTop: 14, fontSize: 8, color: C.inkMute }]}>
              STARTIDEA MALAGA SL
            </Text>
            <Text style={[styles.partyLine, { fontSize: 8, color: C.inkMute }]}>CIF: B19583632</Text>
            <Text style={[styles.partyLine, { fontSize: 8, color: C.inkMute }]}>
              C/ Conde Cifuentes 33, 18005 Granada
            </Text>
            <Text style={[styles.partyLine, { fontSize: 8, color: C.inkMute }]}>
              pedidos@startidea.es · +34 958 045 789
            </Text>
          </View>
          <View>
            <Text style={styles.invoiceLabel}>Factura</Text>
            <Text style={styles.invoiceNumber}>{data.invoiceNumber}</Text>
            <Text style={styles.invoiceDate}>
              Fecha emisión:{" "}
              {data.issuedAt.toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </Text>
            <Text style={styles.invoiceDate}>
              Fecha cobro:{" "}
              {data.paymentDate.toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Receptor */}
        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Cliente</Text>
            <Text style={styles.partyName}>
              {data.customer.company || data.customer.name}
            </Text>
            {data.customer.company && (
              <Text style={styles.partyLine}>Atención: {data.customer.name}</Text>
            )}
            {data.customer.vatNumber && (
              <Text style={styles.partyLine}>NIF/CIF: {data.customer.vatNumber}</Text>
            )}
            {data.customer.address && <Text style={styles.partyLine}>{data.customer.address}</Text>}
            {(data.customer.postalCode || data.customer.city) && (
              <Text style={styles.partyLine}>
                {data.customer.postalCode || ""} {data.customer.city || ""}
                {data.customer.country ? ` (${data.customer.country})` : ""}
              </Text>
            )}
            <Text style={styles.partyLine}>{data.customer.email}</Text>
          </View>
        </View>

        {/* Líneas */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.cellDesc, styles.cellHead]}>Descripción</Text>
            <Text style={[styles.cellQty, styles.cellHead]}>Uds.</Text>
            <Text style={[styles.cellUnit, styles.cellHead]}>P. unit. s/IVA</Text>
            <Text style={[styles.cellTotal, styles.cellHead]}>Total s/IVA</Text>
          </View>
          {data.items.map((it, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.cellDesc}>{it.description}</Text>
              <Text style={styles.cellQty}>{it.quantity.toLocaleString("es-ES")}</Text>
              <Text style={styles.cellUnit}>{EUR.format(it.unitPriceCents / 100)}</Text>
              <Text style={styles.cellTotal}>{EUR.format(it.totalCents / 100)}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Base imponible</Text>
            <Text style={styles.totalValue}>{EUR.format(data.baseCents / 100)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              IVA ({(data.vatRate * 100).toFixed(0)}%)
            </Text>
            <Text style={styles.totalValue}>{EUR.format(data.vatCents / 100)}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandLabel}>TOTAL</Text>
            <Text style={styles.grandValue}>{EUR.format(data.totalCents / 100)}</Text>
          </View>
        </View>

        {/* Forma pago */}
        <View style={styles.paymentBox}>
          <Text style={styles.paymentLabel}>Forma de pago</Text>
          <Text style={styles.paymentText}>{data.paymentMethod}</Text>
        </View>

        {/* Footer legal */}
        <Text style={styles.footer}>
          Factura emitida según el Reglamento de Facturación (RD 1619/2012). Conserve este
          documento durante el periodo legal aplicable. Para cualquier consulta sobre esta
          factura escriba a pedidos@startidea.es. STARTIDEA MALAGA SL · Inscrita en el Registro
          Mercantil de Málaga.
        </Text>
      </Page>
    </Document>
  );
}
