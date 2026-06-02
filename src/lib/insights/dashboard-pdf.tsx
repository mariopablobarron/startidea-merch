/* eslint-disable jsx-a11y/alt-text */
/**
 * Genera un PDF ejecutivo con el snapshot del dashboard de insights.
 */
import * as React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#faf8f4",
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#e6e1d6",
    paddingBottom: 12,
  },
  brand: { fontSize: 14, fontWeight: "bold" },
  brandTag: { fontSize: 8, color: "#666" },
  reportLabel: {
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  reportTitle: { fontSize: 14, fontWeight: "bold", color: "#c43c0d" },
  reportMeta: { fontSize: 8, color: "#666", marginTop: 2 },
  sectionTitle: {
    fontSize: 9,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
    fontWeight: "bold",
  },
  kpiRow: { flexDirection: "row", gap: 6 },
  kpiBox: {
    flex: 1,
    padding: 8,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: "#e6e1d6",
    backgroundColor: "#ffffff",
  },
  kpiBoxAccent: {
    flex: 1,
    padding: 8,
    borderRadius: 4,
    backgroundColor: "#c43c0d",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiLabelAccent: { fontSize: 7, color: "#ffe5dd", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontWeight: "bold", marginTop: 2 },
  kpiValueAccent: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 2,
    color: "#ffffff",
  },
  kpiHint: { fontSize: 7, color: "#888", marginTop: 1 },
  kpiHintAccent: { fontSize: 7, color: "#ffe5dd", marginTop: 1 },
  suggestionBox: {
    padding: 10,
    marginTop: 6,
    borderRadius: 4,
    borderLeftWidth: 3,
  },
  suggestionTitle: { fontSize: 10, fontWeight: "bold" },
  suggestionBody: { fontSize: 9, marginTop: 4, color: "#444", lineHeight: 1.4 },
  table: { marginTop: 6, borderWidth: 0.5, borderColor: "#e6e1d6" },
  trHeader: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  trBody: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e6e1d6",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  th: { color: "#ffffff", fontSize: 7, fontWeight: "bold" },
  td: { fontSize: 8 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    borderTopWidth: 0.5,
    borderTopColor: "#e6e1d6",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#888",
  },
});

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#c43c0d",
  warning: "#d97706",
  opportunity: "#059669",
  info: "#9ca3af",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#fbeeeb",
  warning: "#fef3c7",
  opportunity: "#ecfdf5",
  info: "#f4f1ea",
};

export type DashboardPdfData = {
  date: Date;
  health: {
    activeProducts: number;
    totalVariants: number;
    pctStock: number;
    pctImage: number;
  };
  funnel: {
    views30d: number;
    cartAdds30d: number;
    recommenderQueries30d: number;
    proposals30d: number;
    cartConvPct: number;
    proposalConvPct: number;
    proposals30dDelta: number;
  };
  suggestions: Array<{
    id: string;
    severity: string;
    title: string;
    body: string;
  }>;
  topProducts: Array<{
    name: string;
    view30d: number;
    cartAddCount: number;
    proposalCount: number;
  }>;
  suppliers: Array<{
    supplier: string;
    products: number;
    pctStock: number;
  }>;
};

export function DashboardReport({ data }: { data: DashboardPdfData }) {
  const dateStr = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data.date);

  return (
    <Document
      title={`TodoMerch Insights ${dateStr}`}
      author="Startidea Málaga SL"
      subject="Resumen ejecutivo dashboard"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>TodoMerchandising</Text>
            <Text style={styles.brandTag}>Startidea Málaga SL</Text>
          </View>
          <View>
            <Text style={styles.reportLabel}>Insights snapshot</Text>
            <Text style={styles.reportTitle}>{dateStr}</Text>
            <Text style={styles.reportMeta}>
              Datos últimos 30 días · generado server-side
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Conversión 30 días</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Views catálogo</Text>
            <Text style={styles.kpiValue}>
              {data.funnel.views30d.toLocaleString("es-ES")}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Añadidos carrito</Text>
            <Text style={styles.kpiValue}>{data.funnel.cartAdds30d}</Text>
            <Text style={styles.kpiHint}>
              {data.funnel.cartConvPct}% conv views → cart
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Recomendador</Text>
            <Text style={styles.kpiValue}>
              {data.funnel.recommenderQueries30d}
            </Text>
          </View>
          <View style={styles.kpiBoxAccent}>
            <Text style={styles.kpiLabelAccent}>Propuestas enviadas</Text>
            <Text style={styles.kpiValueAccent}>{data.funnel.proposals30d}</Text>
            <Text style={styles.kpiHintAccent}>
              {data.funnel.proposalConvPct}% conv ·{" "}
              {data.funnel.proposals30dDelta >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(data.funnel.proposals30dDelta).toFixed(0)}% vs prev
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Salud del catálogo</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Productos activos</Text>
            <Text style={styles.kpiValue}>
              {data.health.activeProducts.toLocaleString("es-ES")}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Variantes / SKUs</Text>
            <Text style={styles.kpiValue}>
              {data.health.totalVariants.toLocaleString("es-ES")}
            </Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>% con stock</Text>
            <Text style={styles.kpiValue}>{data.health.pctStock}%</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>% con imagen</Text>
            <Text style={styles.kpiValue}>{data.health.pctImage}%</Text>
          </View>
        </View>

        {data.suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Decisiones para esta semana
            </Text>
            {data.suggestions.slice(0, 5).map((s, i) => (
              <View
                key={s.id}
                style={[
                  styles.suggestionBox,
                  {
                    borderLeftColor: SEVERITY_COLOR[s.severity] ?? "#888",
                    backgroundColor: SEVERITY_BG[s.severity] ?? "#f4f1ea",
                  },
                ]}
              >
                <Text style={styles.suggestionTitle}>
                  {i + 1}. {s.title}
                </Text>
                <Text style={styles.suggestionBody}>{s.body}</Text>
              </View>
            ))}
          </>
        )}

        {data.topProducts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top 5 productos (30 días)</Text>
            <View style={styles.table}>
              <View style={styles.trHeader}>
                <Text style={[styles.th, { flex: 3 }]}>Producto</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Views</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Cart</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Prop.</Text>
              </View>
              {data.topProducts.slice(0, 5).map((p, i) => (
                <View
                  key={i}
                  style={[
                    styles.trBody,
                    i % 2 === 0 ? { backgroundColor: "#ffffff" } : {},
                  ]}
                >
                  <Text style={[styles.td, { flex: 3 }]}>{p.name.slice(0, 60)}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{p.view30d}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{p.cartAddCount}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>{p.proposalCount}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {data.suppliers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Estado proveedores</Text>
            <View style={styles.table}>
              <View style={styles.trHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Proveedor</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Productos</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>% Stock</Text>
              </View>
              {data.suppliers.map((s, i) => (
                <View
                  key={i}
                  style={[
                    styles.trBody,
                    i % 2 === 0 ? { backgroundColor: "#ffffff" } : {},
                  ]}
                >
                  <Text style={[styles.td, { flex: 2 }]}>{s.supplier}</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                    {s.products.toLocaleString("es-ES")}
                  </Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                    {s.pctStock}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>TodoMerchandising · Startidea Málaga SL</Text>
          <Text>{dateStr}</Text>
        </View>
      </Page>
    </Document>
  );
}
