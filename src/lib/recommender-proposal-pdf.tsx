/* eslint-disable jsx-a11y/alt-text */
/**
 * Generador PDF de propuesta del recomendador.
 *
 * Distinto del proposal-pdf.tsx (que es para CartQuote tradicional).
 * Este es para el modelo `Proposal` generado desde /recomendador
 * cuando el visitante introduce su email para recibir cotización.
 *
 * Usa @react-pdf/renderer (server-only). Render desde el endpoint
 * con ReactPDF.renderToBuffer().
 */
import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type ProposalQuoteItem,
  type ProposalTotals,
  formatSizes,
  formatTechnique,
  proposalLineLabel,
  proposalVariantCustomerLabel,
} from "./proposal-types";

const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const fmt = (cents: number | null | undefined) => EUR.format((cents ?? 0) / 100);

const C = {
  ink: "#0a0a0b",
  bone: "#f1ede5",
  boneSoft: "#faf8f4",
  line: "#e6e1d6",
  accent: "#ff6b35",
  accentDeep: "#c43c0d",
  inkMute: "#6b6b6b",
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: C.boneSoft,
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.ink,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 14,
  },
  brandBlock: { flexDirection: "column" },
  brandName: { fontSize: 16, fontWeight: "bold", color: C.ink },
  brandTagline: { fontSize: 8, color: C.inkMute, marginTop: 2 },
  proposalBlock: { flexDirection: "column", alignItems: "flex-end" },
  proposalLabel: {
    fontSize: 8,
    color: C.inkMute,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  proposalNumber: { fontSize: 14, fontWeight: "bold", color: C.accentDeep },
  proposalMeta: { fontSize: 8, color: C.inkMute, marginTop: 2 },

  sectionTitle: {
    fontSize: 8,
    color: C.inkMute,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
  },

  clientBox: {
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: C.line,
  },
  clientLine: { fontSize: 10, marginBottom: 2 },

  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.ink,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tableRowAlt: { backgroundColor: "#FFFFFF" },
  tableRowMissing: { backgroundColor: "#FBEEEB" },
  th: { color: "#FFF", fontSize: 8, fontWeight: "bold", textTransform: "uppercase" },
  td: { fontSize: 9, color: C.ink },
  tdMuted: { fontSize: 8, color: C.inkMute },

  colProduct: { width: "38%", paddingRight: 4 },
  colTech: { width: "14%" },
  colQty: { width: "10%", textAlign: "right" },
  colSizes: { width: "14%" },
  colUnit: { width: "12%", textAlign: "right" },
  colSubtotal: { width: "12%", textAlign: "right", fontWeight: "bold" },

  totalsBox: {
    marginTop: 14,
    alignSelf: "flex-end",
    width: 220,
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: C.line,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalsLabel: { fontSize: 9, color: C.inkMute },
  totalsValue: { fontSize: 10, fontWeight: "bold" },
  totalsGrand: { fontSize: 13, fontWeight: "bold", color: C.accentDeep },
  totalsSeparator: {
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    marginTop: 4,
    marginBottom: 4,
  },

  conditionsBox: {
    marginTop: 18,
    backgroundColor: "#F4EFE8",
    padding: 10,
    borderRadius: 4,
  },
  conditionsTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 6 },
  conditionItem: { fontSize: 8, color: "#444", marginBottom: 2 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.inkMute,
  },
});

type RecommenderProposalPdfProps = {
  proposalNumber: string;
  date: Date;
  email: string;
  name?: string | null;
  company?: string | null;
  items: ProposalQuoteItem[];
  totals: ProposalTotals;
};

export function RecommenderProposalPdf({
  proposalNumber,
  date,
  email,
  name,
  company,
  items,
  totals,
}: RecommenderProposalPdfProps) {
  const dateStr = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const expiryDate = new Date(date.getTime() + 15 * 24 * 3600 * 1000);
  const expiryStr = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(expiryDate);

  return (
    <Document
      title={`Propuesta ${proposalNumber} · TodoMerchandising`}
      author="Startidea Málaga SL"
      subject="Propuesta de merchandising corporativo"
      creator="TodoMerchandising"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>TodoMerchandising</Text>
            <Text style={styles.brandTagline}>
              Merchandising corporativo con impacto · Startidea Málaga SL
            </Text>
          </View>
          <View style={styles.proposalBlock}>
            <Text style={styles.proposalLabel}>Propuesta</Text>
            <Text style={styles.proposalNumber}>{proposalNumber}</Text>
            <Text style={styles.proposalMeta}>Emitida: {dateStr}</Text>
            <Text style={styles.proposalMeta}>Válida hasta: {expiryStr}</Text>
          </View>
        </View>

        {/* Cliente */}
        <Text style={styles.sectionTitle}>Para</Text>
        <View style={styles.clientBox}>
          {name ? <Text style={styles.clientLine}>{name}</Text> : null}
          {company ? <Text style={styles.clientLine}>{company}</Text> : null}
          <Text style={styles.clientLine}>{email}</Text>
        </View>

        {/* Tabla items */}
        <Text style={styles.sectionTitle}>Detalle de la propuesta</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colProduct]}>Producto</Text>
          <Text style={[styles.th, styles.colTech]}>Marcaje</Text>
          <Text style={[styles.th, styles.colQty]}>Cant.</Text>
          <Text style={[styles.th, styles.colSizes]}>Tallas</Text>
          <Text style={[styles.th, styles.colUnit]}>P. ud (sin IVA)</Text>
          <Text style={[styles.th, styles.colSubtotal]}>Subtotal</Text>
        </View>
        {items.map((it, idx) => {
          const rowStyle = [
            styles.tableRow,
            idx % 2 === 0 ? styles.tableRowAlt : {},
            it.notFound ? styles.tableRowMissing : {},
          ];
          const b = it.breakdown;
          const variantLabel = proposalVariantCustomerLabel(it);

          // Con breakdown: SIEMPRE producto / marcaje / cliché / envío como
          // filas propias, con 0,00 € cuando el concepto no aplica.
          if (b && !it.notFound) {
            const subRows: Array<{ label: string; qty: string; unit: string; total: number }> = [
              {
                label: "Marcaje" + (it.technique ? ` — ${formatTechnique(it.technique)}` : ""),
                qty: String(it.quantity),
                unit: fmt(b.markingUnitCents),
                total: b.markingTotalCents,
              },
              {
                label: "Cliché / fotolito",
                qty: b.setupCents > 0 ? "1" : "—",
                unit: fmt(b.setupCents),
                total: b.setupCents,
              },
              {
                label: "Envío",
                qty: b.shippingCents > 0 ? "1" : "—",
                unit: b.shippingCents > 0 ? fmt(b.shippingCents) : "Incluido",
                total: b.shippingCents,
              },
              ...(b.discountCents > 0
                ? [{ label: "Descuento", qty: "—", unit: "", total: -b.discountCents }]
                : []),
            ];
            return (
              <View key={idx}>
                <View style={rowStyle}>
                  <View style={styles.colProduct}>
                    <Text style={styles.td}>{proposalLineLabel(it)}</Text>
                    {it.product?.ref ? (
                      <Text style={styles.tdMuted}>Ref: {it.product.ref}</Text>
                    ) : null}
                    {variantLabel ? (
                      <Text style={styles.tdMuted}>{variantLabel}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.td, styles.colTech]}> </Text>
                  <Text style={[styles.td, styles.colQty]}>{it.quantity}</Text>
                  <Text style={[styles.tdMuted, styles.colSizes]}>{formatSizes(it.sizes)}</Text>
                  <Text style={[styles.td, styles.colUnit]}>{fmt(b.productUnitCents)}</Text>
                  <Text style={[styles.td, styles.colSubtotal]}>{fmt(b.productTotalCents)}</Text>
                </View>
                {subRows.map((r, j) => (
                  <View style={styles.tableRow} key={`${idx}-${j}`}>
                    <View style={styles.colProduct}>
                      <Text style={[styles.tdMuted, { paddingLeft: 10 }]}>{r.label}</Text>
                    </View>
                    <Text style={[styles.td, styles.colTech]}> </Text>
                    <Text style={[styles.tdMuted, styles.colQty]}>{r.qty}</Text>
                    <Text style={[styles.tdMuted, styles.colSizes]}> </Text>
                    <Text style={[styles.tdMuted, styles.colUnit]}>{r.unit}</Text>
                    <Text style={[styles.td, styles.colSubtotal]}>{fmt(r.total)}</Text>
                  </View>
                ))}
              </View>
            );
          }

          // Sin breakdown (propuestas antiguas): línea única todo-incluido.
          const unitPrice = it.unitPriceCents
            ? fmt(it.unitPriceCents + (b ? 0 : it.markingPerUnitCents ?? 0))
            : "—";
          return (
            <View style={rowStyle} key={idx}>
              <View style={styles.colProduct}>
                <Text style={styles.td}>{proposalLineLabel(it)}</Text>
                {it.product?.ref ? (
                  <Text style={styles.tdMuted}>Ref: {it.product.ref}</Text>
                ) : null}
                {variantLabel ? (
                  <Text style={styles.tdMuted}>{variantLabel}</Text>
                ) : null}
                {it.notFound ? (
                  <Text style={styles.tdMuted}>
                    ⚠ No localizado en catálogo
                    {it.searchedAs ? ` (buscado «${it.searchedAs}»)` : ""}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.td, styles.colTech]}>
                {formatTechnique(it.technique)}
              </Text>
              <Text style={[styles.td, styles.colQty]}>{it.quantity}</Text>
              <Text style={[styles.tdMuted, styles.colSizes]}>
                {formatSizes(it.sizes)}
              </Text>
              <Text style={[styles.td, styles.colUnit]}>{unitPrice}</Text>
              <Text style={[styles.td, styles.colSubtotal]}>
                {it.notFound ? "—" : fmt(it.totalCents)}
              </Text>
            </View>
          );
        })}

        {/* Totales */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal (sin IVA)</Text>
            <Text style={styles.totalsValue}>{fmt(totals.subtotalCents)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>IVA 21%</Text>
            <Text style={styles.totalsValue}>{fmt(totals.ivaCents)}</Text>
          </View>
          <View style={styles.totalsSeparator} />
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>TOTAL</Text>
            <Text style={styles.totalsGrand}>{fmt(totals.totalCents)}</Text>
          </View>
        </View>

        {/* Condiciones */}
        <View style={styles.conditionsBox}>
          <Text style={styles.conditionsTitle}>Condiciones</Text>
          <Text style={styles.conditionItem}>
            • Precio orientativo basado en el catálogo público. La cotización
            vinculante requiere mockup técnico aprobado.
          </Text>
          <Text style={styles.conditionItem}>
            • Producción estimada: 7-10 días laborables tras aprobación del mockup.
          </Text>
          <Text style={styles.conditionItem}>
            • Envío peninsular incluido (UE +). Consultar para Canarias, Ceuta y
            Melilla.
          </Text>
          <Text style={styles.conditionItem}>
            • Propuesta válida 15 días. Próximo paso: escribe a pedidos@startidea.es
            indicando el número de propuesta para iniciar el proceso de mockup.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Startidea Málaga SL · Málaga, España</Text>
          <Text>pedidos@startidea.es · +34 958 045 789</Text>
        </View>
      </Page>
    </Document>
  );
}
