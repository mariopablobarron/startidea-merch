import { describe, expect, it } from "vitest";
import { abandonedCartDripEmail } from "./email-templates";

const base = {
  firstName: "Marta",
  fallbackName: "Marta García",
  items: [
    { quantity: 50, name: 'CAMISETA ADULTO "RUNNER"', amountFormatted: "84,00 €" },
    { quantity: 2, name: "Taza cerámica", amountFormatted: null },
  ],
  totalFormatted: "188,80 €",
  discountedTotalFormatted: null,
  recoverUrl: "https://merchandising.startidea.es/cotizar?recover=abc123",
};

describe("abandonedCartDripEmail", () => {
  it("step 1: asunto y CTA estándar", () => {
    const e = abandonedCartDripEmail({ ...base, step: 1 });
    expect(e.subject).toBe("Marta, tu cotización en TodoMerchandising te espera");
    expect(e.html).toContain("Retomar mi cotización →");
    expect(e.html).toContain("50× CAMISETA ADULTO &quot;RUNNER&quot;");
    expect(e.html).toContain("Total estimado: 188,80 €");
    expect(e.text).toContain("Retomar: https://merchandising.startidea.es/cotizar?recover=abc123");
  });

  it("step 1 sin nombre: asunto capitalizado", () => {
    const e = abandonedCartDripEmail({ ...base, step: 1, firstName: null, fallbackName: "cliente" });
    expect(e.subject).toBe("Tu cotización en TodoMerchandising te espera");
  });

  it("step 3: caja de ayuda", () => {
    const e = abandonedCartDripEmail({ ...base, step: 3 });
    expect(e.html).toContain("¿Necesitas ayuda?");
  });

  it("step 7: descuento y CTA -10%", () => {
    const e = abandonedCartDripEmail({ ...base, step: 7, discountedTotalFormatted: "169,92 €" });
    expect(e.subject).toContain("última oportunidad");
    expect(e.html).toContain("-10%");
    expect(e.html).toContain("169,92 €");
    expect(e.html).toContain("Quiero el -10% →");
  });

  it("escapa nombre y productos controlados por el usuario (el inline viejo no)", () => {
    const e = abandonedCartDripEmail({
      ...base,
      step: 1,
      firstName: null,
      fallbackName: '<img src=x onerror=alert(1)>',
      items: [{ quantity: 1, name: "<script>evil()</script>", amountFormatted: null }],
    });
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).not.toContain("<script>evil");
    expect(e.html).toContain("&lt;script&gt;");
  });

  it("shell de marca + footer legal + aviso de baja", () => {
    const e = abandonedCartDripEmail({ ...base, step: 1 });
    expect(e.html).toContain("<!doctype html>");
    expect(e.html).toContain("STARTIDEA MALAGA SL · CIF B19583632");
    expect(e.html).toContain("BAJA");
    expect(e.html).toContain("drip 1");
  });

  it("sin rastro de proveedor", () => {
    const e = abandonedCartDripEmail({ ...base, step: 7 });
    const lower = (e.html + e.text).toLowerCase();
    for (const banned of ["midocean", "makito", "cifra", "adivin", "supplier"]) {
      expect(lower).not.toContain(banned);
    }
  });
});

import { emailShell } from "./email-templates";

describe("emailShell con baja (broadcasts)", () => {
  it("añade el enlace de baja al footer central", () => {
    const html = emailShell("<tr><td>hola</td></tr>", "pre", {
      unsubscribeUrl: "https://merchandising.startidea.es/api/newsletter/unsubscribe?token=t1",
    });
    expect(html).toContain("Darme de baja");
    expect(html).toContain("unsubscribe?token=t1");
    expect(html).toContain("STARTIDEA MALAGA SL");
  });

  it("sin unsubscribeUrl no hay enlace de baja (transaccionales)", () => {
    const html = emailShell("<tr><td>hola</td></tr>");
    expect(html).not.toContain("Darme de baja");
  });
});
