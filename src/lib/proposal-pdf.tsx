/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";
import type { CartQuote } from "@prisma/client";
import { markingCellText, type ItemWithMarkings } from "@/lib/marking-cell-text";

/**
 * Genera un PDF de propuesta comercial a partir de un CartQuote.
 * Server-side con renderToBuffer (Node). Devuelve un Buffer que se
 * puede servir como respuesta HTTP.
 */

// Paleta Startidea
const C = {
  ink: "#0a0a0b",
  bone: "#f1ede5",
  boneSoft: "#faf8f4",
  line: "#e6e1d6",
  accent: "#ff6b35",
  accentDeep: "#c43c0d",
  social: "#4a9d7f",
  inkMute: "#6b6b6b",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.boneSoft,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink,
    padding: 0,
  },
  header: {
    backgroundColor: C.ink,
    color: C.bone,
    padding: 32,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  brand: {
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  brandAccent: { color: C.accent },
  brandTagline: {
    fontSize: 8,
    color: "#bdbdbd",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  proposalLabel: {
    fontSize: 8,
    color: C.accent,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  proposalTitle: { fontSize: 22, fontWeight: 700 },
  proposalRef: {
    fontSize: 8,
    color: "#9a9a9a",
    marginTop: 6,
  },
  section: {
    padding: 28,
    paddingBottom: 8,
  },
  twoCol: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 14,
  },
  col: { flex: 1 },
  label: {
    fontSize: 7,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: C.inkMute,
    marginBottom: 4,
  },
  valueStrong: { fontSize: 11, fontWeight: 700, marginBottom: 1 },
  value: { fontSize: 9 },
  table: {
    marginTop: 14,
    borderTop: `1px solid ${C.line}`,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottom: `1px solid ${C.line}`,
    backgroundColor: C.bone,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottom: `1px solid ${C.line}`,
  },
  th: {
    fontSize: 7,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.inkMute,
    paddingHorizontal: 6,
  },
  td: {
    fontSize: 9,
    paddingHorizontal: 6,
  },
  cName: { flex: 3 },
  cQty: { flex: 0.8, textAlign: "center" },
  cTech: { flex: 2.4 },
  cPrice: { flex: 1.2, textAlign: "right" },
  cTotal: { flex: 1.4, textAlign: "right" },
  totalsBlock: {
    marginTop: 18,
    alignSelf: "flex-end",
    width: 240,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: { fontSize: 9, color: C.inkMute },
  totalValue: { fontSize: 10, fontWeight: 700 },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: C.accentDeep,
    color: "#fff",
    borderRadius: 8,
    marginTop: 8,
  },
  totalGrandLabel: { fontSize: 10, color: "#fff" },
  totalGrandValue: { fontSize: 14, fontWeight: 700, color: "#fff" },
  footer: {
    backgroundColor: C.bone,
    padding: 28,
    borderTop: `1px solid ${C.line}`,
    marginTop: 24,
  },
  footerHeading: {
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: C.inkMute,
    marginBottom: 6,
  },
  footerText: { fontSize: 8.5, lineHeight: 1.4 },
  highlightBlock: {
    backgroundColor: C.bone,
    padding: 14,
    borderRadius: 8,
    marginTop: 14,
  },
  highlightTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: C.accentDeep,
    marginBottom: 4,
  },
  pageNumber: {
    position: "absolute",
    bottom: 12,
    right: 28,
    fontSize: 7,
    color: C.inkMute,
  },
});

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type CartWithItems = CartQuote & { items: ItemWithMarkings[] };

export async function renderProposalPdf(cart: CartWithItems): Promise<Buffer> {
  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días

  const subtotal =
    cart.acceptedTotalCents ??
    cart.estimatedTotalCents ??
    cart.items.reduce((s, it) => s + (it.totalClientCents || 0), 0);
  const ivaRate = 0.21;
  const iva = Math.round(subtotal * ivaRate);
  const total = subtotal + iva;
  const depositCents = cart.depositPercent ? Math.round((subtotal * cart.depositPercent) / 100) : null;

  const proposalNumber = `P-${issuedAt.getFullYear()}${String(issuedAt.getMonth() + 1).padStart(2, "0")}-${cart.id.slice(0, 6).toUpperCase()}`;

  const doc = (
    <Document
      title={`Cotización ${proposalNumber}`}
      author="STARTIDEA MALAGA SL"
      subject={`Propuesta comercial para ${cart.name}${cart.company ? " · " + cart.company : ""}`}
      creator="todomerchandising"
    >
      <Page size="A4" style={styles.page}>
        {/* Header oscuro */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View>
              <Text style={styles.brand}>
                todo<Text style={styles.brandAccent}>merchandising</Text>
              </Text>
              <Text style={styles.brandTagline}>Una iniciativa de Startidea</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.brandTagline}>{issuedAt.toLocaleDateString("es-ES")}</Text>
              <Text style={[styles.brandTagline, { marginTop: 4, color: C.bone }]}>{proposalNumber}</Text>
            </View>
          </View>
          <Text style={styles.proposalLabel}>Propuesta comercial</Text>
          <Text style={styles.proposalTitle}>
            Cotización para {cart.company || cart.name}
          </Text>
          <Text style={styles.proposalRef}>
            Válida hasta {validUntil.toLocaleDateString("es-ES")} · ID interno {cart.id}
          </Text>
        </View>

        {/* Cliente / Emisor */}
        <View style={styles.section}>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={styles.label}>Para</Text>
              <Text style={styles.valueStrong}>{cart.name}</Text>
              {cart.company && <Text style={styles.value}>{cart.company}</Text>}
              <Text style={styles.value}>{cart.email}</Text>
              {cart.phone && <Text style={styles.value}>{cart.phone}</Text>}
              {cart.shippingAddress && (
                <Text style={[styles.value, { marginTop: 6, color: C.inkMute }]}>
                  {cart.shippingAddress}
                  {cart.shippingPostalCode ? `, ${cart.shippingPostalCode}` : ""}
                  {cart.shippingCity ? ` · ${cart.shippingCity}` : ""}
                  {cart.shippingCountry ? ` (${cart.shippingCountry})` : ""}
                </Text>
              )}
              {cart.vatNumber && (
                <Text style={[styles.value, { color: C.inkMute }]}>NIF/VAT: {cart.vatNumber}</Text>
              )}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>De</Text>
              <Text style={styles.valueStrong}>STARTIDEA MALAGA SL</Text>
              <Text style={styles.value}>CIF B19583632</Text>
              <Text style={styles.value}>C/ Conde Cifuentes, 33</Text>
              <Text style={styles.value}>18005 Granada · España</Text>
              <Text style={[styles.value, { color: C.inkMute, marginTop: 6 }]}>
                pedidos@startidea.es
              </Text>
              <Text style={[styles.value, { color: C.inkMute }]}>+34 958 045 789</Text>
            </View>
          </View>
        </View>

        {/* Brief */}
        {cart.message && (
          <View style={styles.section}>
            <Text style={styles.label}>Brief recibido</Text>
            <View style={[styles.highlightBlock, { backgroundColor: C.bone }]}>
              <Text style={styles.value}>{cart.message}</Text>
              {cart.deadline && (
                <Text style={[styles.value, { marginTop: 6, color: C.accentDeep }]}>
                  Fecha límite indicada: {cart.deadline}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Items */}
        <View style={styles.section}>
          <Text style={styles.label}>Productos cotizados</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.cName]}>Producto</Text>
              <Text style={[styles.th, styles.cQty]}>Cant.</Text>
              <Text style={[styles.th, styles.cTech]}>Marcaje</Text>
              <Text style={[styles.th, styles.cPrice]}>Precio/ud</Text>
              <Text style={[styles.th, styles.cTotal]}>Total</Text>
            </View>
            {cart.items.map((it) => (
              <View key={it.id} style={styles.tableRow}>
                <View style={[styles.cName, { paddingHorizontal: 6 }]}>
                  <Text style={[styles.td, { fontWeight: 700 }]}>{it.productName}</Text>
                  <Text style={[styles.td, { fontSize: 7, color: C.inkMute, paddingHorizontal: 0 }]}>
                    Ref. {it.productRef}
                  </Text>
                </View>
                <Text style={[styles.td, styles.cQty]}>{it.quantity.toLocaleString("es-ES")}</Text>
                <Text style={[styles.td, styles.cTech]}>{markingCellText(it)}</Text>
                <Text style={[styles.td, styles.cPrice]}>
                  {it.unitPriceClientCents != null ? EUR.format(it.unitPriceClientCents / 100) : "—"}
                </Text>
                <Text style={[styles.td, styles.cTotal, { fontWeight: 700 }]}>
                  {it.totalClientCents != null ? EUR.format(it.totalClientCents / 100) : "—"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal (sin IVA)</Text>
              <Text style={styles.totalValue}>{EUR.format(subtotal / 100)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA 21%</Text>
              <Text style={styles.totalValue}>{EUR.format(iva / 100)}</Text>
            </View>
            <View style={styles.totalGrand}>
              <Text style={styles.totalGrandLabel}>Total con IVA</Text>
              <Text style={styles.totalGrandValue}>{EUR.format(total / 100)}</Text>
            </View>
            {depositCents != null && cart.depositPercent && cart.depositPercent < 100 && (
              <View style={[styles.totalRow, { marginTop: 6 }]}>
                <Text style={[styles.totalLabel, { color: C.accentDeep }]}>
                  Depósito {cart.depositPercent}% al confirmar
                </Text>
                <Text style={[styles.totalValue, { color: C.accentDeep }]}>
                  {EUR.format((depositCents * (1 + ivaRate)) / 100)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Términos */}
        <View style={styles.footer}>
          <Text style={styles.footerHeading}>Condiciones</Text>
          <Text style={styles.footerText}>
            • Plazos: 7-15 días laborables desde la aprobación del mockup digital, salvo
            indicación específica. Producciones especiales pueden requerir hasta 6 semanas.{"\n"}
            • Pago: {cart.depositPercent && cart.depositPercent < 100
              ? `${cart.depositPercent}% al confirmar el pedido, ${100 - cart.depositPercent}% antes del envío.`
              : "100% al confirmar el pedido."}{" "}
            Aceptamos transferencia, Bizum y tarjeta vía Stripe (sin sobrecoste).{"\n"}
            • Esta propuesta es válida durante 30 días desde la fecha de emisión.{"\n"}
            • Las imágenes son orientativas; el mockup digital final se envía antes de
            producir y debe aprobarse por escrito.{"\n"}
            • Producción mayoritariamente realizada en Centros Especiales de Empleo y
            talleres locales con certificado documental disponible para tu memoria RSC.
          </Text>

          <Text style={[styles.footerHeading, { marginTop: 16 }]}>Aceptación</Text>
          <Text style={styles.footerText}>
            Para confirmar el pedido, responde a este email o pulsa el enlace de pago seguro
            que te enviaremos en mensaje aparte. Cualquier cambio sobre esta propuesta
            (cantidad, marcaje, plazo) se ajusta antes de cobrar.
          </Text>

          <Text style={[styles.footerText, { marginTop: 14, color: C.inkMute, fontSize: 7.5 }]}>
            STARTIDEA MALAGA SL · CIF B19583632 · C/ Conde Cifuentes 33, 18005 Granada · España{"\n"}
            pedidos@startidea.es · +34 958 045 789{"\n"}
            Inscrita en el Registro Mercantil de Granada · Datos de protección: ver Política de
            Privacidad en https://merchandising.startidea.es/privacidad
          </Text>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}
