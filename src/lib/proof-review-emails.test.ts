import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  safeArtworkHref,
  reviewInternalEmailHtml,
  reviewInternalEmailSubject,
  proofApprovedEmailHtml,
  proofRejectedEmailHtml,
  proofRevisionEmailHtml,
  proofRevisionEmailSubject,
} from "./proof-review-emails";

const cliente = { name: "Ana López", email: "ana@empresa.es", company: "Empresa SL" };

/** Lo que escribiría quien quiere colar un enlace falso en el buzón del equipo. */
const PHISHING = '<a href="https://falso.test/pagar">Pincha aquí para cobrar</a>';

describe("review: el aviso interno no deja inyectar markup", () => {
  const base = {
    npsScore: 9,
    authorName: "Ana",
    authorCompany: null,
    comment: null,
    isPublic: false,
    cartId: "cart123",
  };

  it("escapa el nombre del autor", () => {
    const html = reviewInternalEmailHtml({ ...base, authorName: PHISHING });
    expect(html).not.toContain("<a href=");
    expect(html).toContain("&lt;a href=&quot;https://falso.test/pagar&quot;&gt;");
  });

  it("escapa la empresa", () => {
    const html = reviewInternalEmailHtml({ ...base, authorCompany: "<script>x</script>" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapa el comentario ANTES de convertir los saltos de línea en <br>", () => {
    const html = reviewInternalEmailHtml({ ...base, comment: `linea1\n${PHISHING}` });
    expect(html).not.toContain("<a href=");
    // el <br> legítimo sí sobrevive: el orden es escapar y luego romper líneas
    expect(html).toContain("linea1<br>");
  });

  it("escapa el cartId, que se pinta dentro de un <code>", () => {
    const html = reviewInternalEmailHtml({ ...base, cartId: '"><b>x' });
    expect(html).not.toContain("<b>x");
  });

  it("el asunto lleva la nota NPS y el nombre (es texto, no HTML)", () => {
    expect(reviewInternalEmailSubject({ ...base, npsScore: 7, authorName: "Ana" })).toBe(
      "[Review NPS 7/10] Ana",
    );
  });
});

describe("proof: los tres avisos escapan los datos del cliente", () => {
  it("aprobado: escapa nombre y email", () => {
    const html = proofApprovedEmailHtml({ ...cliente, name: PHISHING }, "p1");
    expect(html).not.toContain("<a href=");
    expect(html).toContain("&lt;a href=");
  });

  it("rechazado: escapa el motivo, que lo escribe el cliente entero", () => {
    const html = proofRejectedEmailHtml(cliente, "p1", `no me gusta\n${PHISHING}`);
    expect(html).not.toContain("<a href=");
    expect(html).toContain("no me gusta<br>");
  });

  it("revisión: enlaza el artwork cuando es https", () => {
    const html = proofRevisionEmailHtml(cliente, "p1", "https://cdn.example.com/arte.png");
    expect(html).toContain('<a href="https://cdn.example.com/arte.png">');
  });

  it("revisión: NO enlaza javascript: — el schema lo acepta, el email no", () => {
    const html = proofRevisionEmailHtml(cliente, "p1", "javascript:alert(1)");
    expect(html).not.toContain("<a href=");
    expect(html).toContain("enlace no seguro");
  });

  it("revisión: una comilla en la URL no puede romper el atributo href", () => {
    const html = proofRevisionEmailHtml(cliente, "p1", 'https://x.test/"><b>ups</b>');
    expect(html).not.toContain("<b>ups</b>");
  });
});

describe("safeArtworkHref — a dónde se deja apuntar el enlace del artwork", () => {
  it("convierte la ruta interna en absoluta", () => {
    expect(safeArtworkHref("/files/proofs/a.pdf")).toMatch(/^https?:\/\/.+\/files\/proofs\/a\.pdf$/);
  });
  it("admite https", () => {
    expect(safeArtworkHref("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
  it("rechaza javascript:, data: y http en claro", () => {
    expect(safeArtworkHref("javascript:alert(1)")).toBeNull();
    expect(safeArtworkHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeArtworkHref("http://evil.test/a.png")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("cubre los cuatro caracteres que rompen HTML y atributos", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });
  it("escapa el & primero, para no doblar las entidades", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("review sin nombre: Review.authorName puede venir vacío en BD", () => {
  const base = { npsScore: 8, authorCompany: null, comment: null, isPublic: false, cartId: "c1" };

  it("el asunto no dice «null»", () => {
    expect(reviewInternalEmailSubject({ ...base, authorName: null })).toBe(
      "[Review NPS 8/10] Sin nombre",
    );
  });

  it("el cuerpo tampoco", () => {
    const html = reviewInternalEmailHtml({ ...base, authorName: null });
    expect(html).not.toContain("null");
    expect(html).toContain("Sin nombre");
  });

  it("un nombre en blanco cuenta como sin nombre", () => {
    expect(reviewInternalEmailSubject({ ...base, authorName: "   " })).toContain("Sin nombre");
  });
});
