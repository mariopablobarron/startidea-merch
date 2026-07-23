import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RoiCalculation } from "@prisma/client";

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", backgroundColor: "#F4EFE6", color: "#2A2A2A" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 36 },
  eyebrow: { fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#6b6b6b" },
  title: { marginTop: 6, fontSize: 24, fontWeight: 700, color: "#2A2A2A", lineHeight: 1.2 },
  titleAccent: { color: "#E63E73" },
  intro: { marginTop: 16, fontSize: 11, lineHeight: 1.6, color: "#444" },
  sectionLabel: { marginTop: 22, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#6b6b6b" },
  paramRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#2A2A2A" },
  paramLabel: { color: "#6b6b6b" },
  resultsGrid: { marginTop: 16 },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    marginTop: 8,
    borderRadius: 10,
  },
  resultLabel: { fontSize: 10, color: "#6b6b6b", textTransform: "uppercase", letterSpacing: 1 },
  resultValue: { fontSize: 18, fontWeight: 700 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#E8E2D5", marginTop: 24 },
  footnote: { marginTop: 16, fontSize: 9, color: "#6b6b6b", lineHeight: 1.5 },
  brandFooter: { marginTop: 28, padding: 16, backgroundColor: "#2A2A2A", borderRadius: 10 },
  brandFooterText: { color: "#F4EFE6", fontSize: 9, lineHeight: 1.5 },
  brandTitle: { color: "#FFFFFF", fontSize: 13, marginBottom: 4 },
  signLine: { marginTop: 24, fontSize: 10, color: "#6b6b6b" },
});

export function RoiCertificatePDF({ calc }: { calc: RoiCalculation }) {
  const dateStr = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(calc.createdAt);
  const num = (n: number) => new Intl.NumberFormat("es-ES").format(n);
  return (
    <Document
      title={`Certificado ROI RSC · ${calc.company || calc.email}`}
      author="TodoMerchandising · STARTIDEA MALAGA SL"
      subject="Cálculo de impacto RSC del merchandising corporativo"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>— Certificado ROI RSC · estimación</Text>
          <Text style={styles.title}>
            {calc.company || calc.name || "Tu empresa"},{"\n"}
            <Text style={styles.titleAccent}>esto generaría tu merchandising.</Text>
          </Text>
          <Text style={styles.intro}>
            A continuación, el impacto estimado anual de migrar tu merchandising
            corporativo a producción local + Centros Especiales de Empleo, según los
            parámetros que indicaste el {dateStr}.
          </Text>

          <Text style={styles.sectionLabel}>Parámetros</Text>
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Empleados</Text>
            <Text>{num(calc.employees)}</Text>
          </View>
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>Presupuesto merchandising anual</Text>
            <Text>{num(calc.annualBudgetEur)} €</Text>
          </View>
          <View style={styles.paramRow}>
            <Text style={styles.paramLabel}>% a sustituir por producción ética</Text>
            <Text>{calc.substitutionPct}%</Text>
          </View>

          <Text style={styles.sectionLabel}>Impacto anual estimado</Text>
          <View style={styles.resultsGrid}>
            <View style={[styles.resultRow, { backgroundColor: "#FBDFE9" }]}>
              <Text style={styles.resultLabel}>CO₂ ahorrado</Text>
              <Text style={[styles.resultValue, { color: "#E63E73" }]}>{num(calc.co2SavedKg)} kg</Text>
            </View>
            <View style={[styles.resultRow, { backgroundColor: "#F4EFE6" }]}>
              <Text style={styles.resultLabel}>Árboles equivalentes</Text>
              <Text style={styles.resultValue}>{num(calc.treesEquivalent)}</Text>
            </View>
            <View style={[styles.resultRow, { backgroundColor: "#F4EFE6" }]}>
              <Text style={styles.resultLabel}>Horas trabajo digno</Text>
              <Text style={styles.resultValue}>{num(calc.workHoursDignified)} h</Text>
            </View>
            <View style={[styles.resultRow, { backgroundColor: "#F4EFE6" }]}>
              <Text style={styles.resultLabel}>% producción en CEE</Text>
              <Text style={styles.resultValue}>{calc.ceeProductionPct}%</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.footnote}>
            Estimación basada en: 5 kg CO₂ ahorrados por cada 100 € reasignados
            (~1,5-2 kg por kg de producto, principalmente flete asiático evitado);
            18 €/h coste laboral CEE Andalucía 2026 (ACEEM); 21 kg CO₂/año por
            árbol joven en clima mediterráneo (CSIC). Cifras orientativas — si
            lanzas pedido, te emitimos certificado auditado con datos reales de
            producción.
          </Text>

          <Text style={styles.signLine}>
            Firmado: STARTIDEA MALAGA SL · CIF B19583632 · Granada, {dateStr}
          </Text>

          <View style={styles.brandFooter}>
            <Text style={styles.brandTitle}>todomerchandising</Text>
            <Text style={styles.brandFooterText}>
              Una iniciativa de Startidea. Merchandising corporativo personalizable
              producido en Centros Especiales de Empleo y talleres locales.
              {"\n"}pedidos@startidea.es · merchandising.startidea.es
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
