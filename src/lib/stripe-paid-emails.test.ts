import { describe, it, expect } from "vitest";
import {
  internalPaymentEmailHtml,
  clientPaidEmailHtml,
  safeLogoHref,
} from "./stripe-paid-emails";

/**
 * Todo lo que estos dos emails interpolan sale de `CartQuote`/`CartQuoteItem`,
 * y esas tablas las rellena la ruta PÚBLICA `/api/cart-quote`. El email interno
 * llega al buzón del equipo: markup inyectado ahí sirve para suplantar un
 * enlace ante quien atiende los pedidos.
 *
 * Los casos comprueban COMPORTAMIENTO (qué sale en el HTML), no dónde vive el
 * código: un guard atado a la ubicación vigila la ubicación, no la promesa.
 */

const ITEM = {
  productName: "Camiseta",
  productRef: "STM-001",
  quantity: 10,
  customerLogoUrl: "/files/customer-logos/abc-logo.pdf",
  customerLogoFilename: "logo.pdf",
  markingTechniqueName: "Serigrafía",
  markingPositionId: "PECHO",
  markingColours: 2,
};

const BASE = {
  customer: { name: "Ana", email: "ana@example.com", company: "Acme" },
  amountFmt: "354.06",
  cartId: "cq_abc12345",
  viaLabel: "",
  items: [ITEM],
};

describe("internalPaymentEmailHtml — datos de origen público escapados", () => {
  it("escapa el nombre, la empresa y el email del cliente", () => {
    const html = internalPaymentEmailHtml({
      ...BASE,
      customer: {
        name: '<img src=x onerror=alert(1)>',
        email: '"><b>x</b>',
        company: "<script>alert(1)</script>",
      },
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapa los campos del ítem que escribe quien monta el carrito", () => {
    const html = internalPaymentEmailHtml({
      ...BASE,
      items: [
        {
          ...ITEM,
          productName: "<b>promo</b>",
          productRef: "<i>ref</i>",
          customerLogoFilename: '"><a href="https://evil.test">pincha</a>',
          markingTechniqueName: "<u>tec</u>",
          markingPositionId: "<em>pos</em>",
        },
      ],
    });
    for (const tag of ["<b>promo", "<i>ref", "<u>tec", "<em>pos", 'href="https://evil.test"']) {
      expect(html).not.toContain(tag);
    }
    expect(html).toContain("&lt;b&gt;promo");
  });

  it("conserva legible un nombre real con comillas (hay uno así en producción)", () => {
    const html = internalPaymentEmailHtml({
      ...BASE,
      items: [{ ...ITEM, productName: 'CAMISETA ADULTO "RUNNER"' }],
    });
    expect(html).toContain("CAMISETA ADULTO &quot;RUNNER&quot;");
  });

  it("no rompe el atributo href con una URL de logo con comillas", () => {
    const html = internalPaymentEmailHtml({
      ...BASE,
      items: [{ ...ITEM, customerLogoUrl: '/f.pdf" onmouseover="alert(1)' }],
    });
    expect(html).not.toContain('onmouseover="alert(1)"');
    expect(html).toContain("&quot;");
  });
});

describe("safeLogoHref — a dónde se deja apuntar el enlace del logo", () => {
  it("acepta la ruta interna del fichero subido y la vuelve absoluta", () => {
    expect(safeLogoHref("/files/customer-logos/abc.pdf")).toMatch(
      /^https?:\/\/.+\/files\/customer-logos\/abc\.pdf$/,
    );
  });

  it("acepta https", () => {
    expect(safeLogoHref("https://cdn.example.com/l.png")).toBe("https://cdn.example.com/l.png");
  });

  it("rechaza javascript:, data: y http en claro", () => {
    expect(safeLogoHref("javascript:alert(1)")).toBeNull();
    expect(safeLogoHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeLogoHref("http://evil.test/l.png")).toBeNull();
  });

  it("un href rechazado no se pinta como enlace, pero el nombre sigue estando", () => {
    const html = internalPaymentEmailHtml({
      ...BASE,
      items: [{ ...ITEM, customerLogoUrl: "javascript:alert(1)", customerLogoFilename: "logo.pdf" }],
    });
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("logo.pdf");
    expect(html).toContain("ruta no reconocida");
  });
});

describe("clientPaidEmailHtml — el email que recibe el cliente", () => {
  it("escapa el nombre de pila, que sale del carrito", () => {
    const html = clientPaidEmailHtml({
      firstName: "<script>alert(1)</script>",
      amountFmt: "10.00",
      cartId: "cq_abc12345",
      portalLink: "https://merchandising.startidea.es/clientes/x",
      receiptUrl: "https://stripe.test/r",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sigue pintando el enlace al portal y el recibo cuando existen", () => {
    const html = clientPaidEmailHtml({
      firstName: "Ana",
      amountFmt: "10.00",
      cartId: "cq_abc12345",
      portalLink: "https://merchandising.startidea.es/clientes/x",
      receiptUrl: "https://stripe.test/r",
    });
    expect(html).toContain('href="https://merchandising.startidea.es/clientes/x"');
    expect(html).toContain('href="https://stripe.test/r"');
  });

  it("sin portalLink ni recibo no deja restos rotos", () => {
    const html = clientPaidEmailHtml({
      firstName: "Ana",
      amountFmt: "10.00",
      cartId: "cq_abc12345",
      portalLink: null,
    });
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });
});
