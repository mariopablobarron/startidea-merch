import { describe, it, expect } from "vitest";
import {
  LeadMagnetDownloadSchema,
  MAX_EMAIL_CHARS,
  buildLeadMagnetEmailHtml,
  buildLeadMagnetEmailText,
} from "./lead-magnet-download";

const base = {
  magnetTitle: "Guía de merchandising",
  fileUrl: "https://merchandising.startidea.es/files/guia.pdf",
  siteUrl: "https://merchandising.startidea.es",
};

describe("LeadMagnetDownloadSchema", () => {
  it("acepta lo que manda el formulario público (LeadMagnetForm)", () => {
    const r = LeadMagnetDownloadSchema.safeParse({
      email: "Ana@Empresa.es",
      name: "Ana López",
      company: "Empresa SL",
      consent: true,
      utm: { source: "google", medium: "cpc", campaign: "verano" },
    });
    expect(r.success).toBe(true);
    // normaliza a minúsculas: el upsert de NewsletterSubscriber es por email
    if (r.success) expect(r.data.email).toBe("ana@empresa.es");
  });

  it("acepta el caso mínimo: solo email y consent", () => {
    expect(LeadMagnetDownloadSchema.safeParse({ email: "a@b.es", consent: true }).success).toBe(
      true,
    );
  });

  it("rechaza sin consent — el opt-in de la newsletter cuelga de él", () => {
    expect(LeadMagnetDownloadSchema.safeParse({ email: "a@b.es" }).success).toBe(false);
    expect(
      LeadMagnetDownloadSchema.safeParse({ email: "a@b.es", consent: false }).success,
    ).toBe(false);
  });

  it("rechaza un email por encima del tope, aunque sea sintácticamente válido", () => {
    const largo = `${"a".repeat(MAX_EMAIL_CHARS)}@b.es`;
    expect(largo.length).toBeGreaterThan(MAX_EMAIL_CHARS);
    expect(LeadMagnetDownloadSchema.safeParse({ email: largo, consent: true }).success).toBe(false);
  });

  it("rechaza un nombre o una empresa desmedidos (se persisten en LeadDownload)", () => {
    expect(
      LeadMagnetDownloadSchema.safeParse({
        email: "a@b.es",
        consent: true,
        name: "x".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      LeadMagnetDownloadSchema.safeParse({
        email: "a@b.es",
        consent: true,
        company: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("rechaza una campaña UTM desmedida", () => {
    expect(
      LeadMagnetDownloadSchema.safeParse({
        email: "a@b.es",
        consent: true,
        utm: { campaign: "x".repeat(121) },
      }).success,
    ).toBe(false);
  });
});

describe("buildLeadMagnetEmailHtml", () => {
  it("no deja markup del visitante vivo en el HTML del correo", () => {
    const html = buildLeadMagnetEmailHtml({
      ...base,
      name: '<img src=x onerror="alert(1)"> Ana',
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("&lt;img");
  });

  it("saluda por el nombre de pila cuando es un nombre normal", () => {
    const html = buildLeadMagnetEmailHtml({ ...base, name: "Ana López" });
    expect(html).toContain("Hola Ana,");
  });

  it("saluda sin nombre cuando el visitante no lo dio", () => {
    const html = buildLeadMagnetEmailHtml(base);
    expect(html).toContain("Hola,");
  });

  it("escapa las comillas del nombre para que no rompan un atributo vecino", () => {
    const html = buildLeadMagnetEmailHtml({ ...base, name: 'A"B' });
    expect(html).not.toContain('A"B');
    expect(html).toContain("A&quot;B");
  });

  it("sigue enlazando el PDF y las dos llamadas a la acción", () => {
    const html = buildLeadMagnetEmailHtml({ ...base, name: "Ana" });
    expect(html).toContain(`href="${base.fileUrl}"`);
    expect(html).toContain(`${base.siteUrl}/catalogo`);
    expect(html).toContain(`${base.siteUrl}/#cotizar`);
    expect(html).toContain("Guía de merchandising");
  });
});

describe("buildLeadMagnetEmailText", () => {
  it("lleva el enlace de descarga y el nombre de pila", () => {
    const text = buildLeadMagnetEmailText({ ...base, name: "Ana López" });
    expect(text).toContain("Hola Ana,");
    expect(text).toContain(base.fileUrl);
  });
});
