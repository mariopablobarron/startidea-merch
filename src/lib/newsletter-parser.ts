/**
 * Parser de XLSX/CSV para importar subscribers de newsletter.
 *
 * Detecta automáticamente columnas comunes (email, name, organization, phone)
 * por nombre de header — case-insensitive y con sinónimos en ES/EN.
 *
 * Devuelve filas ya normalizadas + lista de columnas extras (para guardar
 * en `meta` del subscriber).
 *
 * Diseño:
 *  - Síncrono (las hojas grandes <50k rows tardan <2s)
 *  - Stream-friendly: las APIs aceptan Buffer y devuelven array procesable
 *  - Sin side effects (no toca BD): el caller decide qué hacer con las rows
 */
import * as ExcelJS from "exceljs";
import { parse as csvParseSync } from "csv-parse/sync";

export type ParsedRow = {
  rowNumber: number; // empieza en 2 (1 es header)
  email: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  meta: Record<string, string>; // columnas que no son campos canónicos
  rawError?: string; // si la fila tenía problemas (sin email, etc)
};

export type ParseResult = {
  headers: string[]; // cabeceras detectadas tal cual vienen en el archivo
  mapping: {
    email: string | null;
    name: string | null;
    company: string | null;
    phone: string | null;
    extras: string[]; // headers no mapeados → van a meta
  };
  rows: ParsedRow[];
  totalRows: number;
};

// ──────────────────────────────────────────────────────────────────────────
// Detección de columnas — sinónimos comunes ES/EN
// ──────────────────────────────────────────────────────────────────────────

const SYNONYMS: Record<keyof Omit<ParseResult["mapping"], "extras">, string[]> = {
  email: ["email", "correo", "e-mail", "mail", "correo electrónico", "correo electronico"],
  name: ["name", "nombre", "first name", "nombre y apellidos", "contacto", "persona"],
  company: [
    "company",
    "organization",
    "organisation",
    "organización",
    "organizacion",
    "empresa",
    "compañía",
    "compania",
    "entidad",
    "ong",
    "razón social",
    "razon social",
  ],
  phone: ["phone", "teléfono", "telefono", "tel", "móvil", "movil", "whatsapp"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita acentos
}

function detectMapping(headers: string[]): ParseResult["mapping"] {
  const normalized = headers.map(normalizeHeader);
  const mapping: ParseResult["mapping"] = {
    email: null,
    name: null,
    company: null,
    phone: null,
    extras: [],
  };
  for (const field of ["email", "name", "company", "phone"] as const) {
    const idx = normalized.findIndex((h) => SYNONYMS[field].includes(h));
    if (idx >= 0) mapping[field] = headers[idx]!;
  }
  // El resto = extras (irán a meta)
  const mapped = new Set([mapping.email, mapping.name, mapping.company, mapping.phone].filter(Boolean));
  mapping.extras = headers.filter((h) => !mapped.has(h));
  return mapping;
}

// ──────────────────────────────────────────────────────────────────────────
// Validación email
// ──────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  if (!e || !EMAIL_RE.test(e)) return null;
  return e;
}

function cleanString(raw: unknown, max = 240): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, max);
  return s.length > 0 ? s : null;
}

// ──────────────────────────────────────────────────────────────────────────
// Parsers — XLSX y CSV
// ──────────────────────────────────────────────────────────────────────────

/**
 * Una hoja parseada con su nombre + resultado individual.
 * Para XLSX multi-pestaña: cada hoja se parsea independiente (puede tener
 * cabeceras y columnas distintas).
 */
export type ParsedSheet = ParseResult & {
  sheetName: string;
  sheetIndex: number;
};

/**
 * Parsea TODAS las hojas (pestañas) del XLSX. Cada hoja con su mapping
 * detectado independiente. Devuelve array vacío si el workbook no tiene hojas
 * o todas están vacías.
 */
export async function parseXlsxAllSheets(buffer: Buffer): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets: ParsedSheet[] = [];

  workbook.worksheets.forEach((sheet, idx) => {
    // Detectar header row (1ª fila con datos; si la 1 está vacía, prueba la 2)
    let headerRowNum = 1;
    let headerRow = sheet.getRow(headerRowNum);
    if (!headerRow.values || (headerRow.values as unknown[]).filter(Boolean).length === 0) {
      headerRowNum = 2;
      headerRow = sheet.getRow(headerRowNum);
    }

    const headers: string[] = [];
    const headerValues = headerRow.values as unknown[];
    for (let c = 1; c < headerValues.length; c++) {
      const v = headerValues[c];
      headers.push(v != null ? String(v).trim() : `col_${c}`);
    }

    // Hoja completamente vacía → la incluimos con 0 rows para que UI sepa
    if (headers.length === 0) {
      sheets.push({
        sheetName: sheet.name,
        sheetIndex: idx,
        headers: [],
        mapping: emptyMapping(),
        rows: [],
        totalRows: 0,
      });
      return;
    }

    const mapping = detectMapping(headers);
    const rows: ParsedRow[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      const rowVals = row.values as unknown[];
      const obj: Record<string, unknown> = {};
      for (let c = 1; c < rowVals.length; c++) {
        const header = headers[c - 1];
        if (header) obj[header] = extractCellValue(rowVals[c]);
      }
      rows.push(rowToParsed(obj, mapping, rowNumber));
    });

    sheets.push({
      sheetName: sheet.name,
      sheetIndex: idx,
      headers,
      mapping,
      rows,
      totalRows: rows.length,
    });
  });

  return sheets;
}

/**
 * Parsea XLSX devolviendo solo la PRIMERA hoja (compat con código existente).
 * Para multi-hoja usar parseXlsxAllSheets().
 */
export async function parseXlsx(buffer: Buffer): Promise<ParseResult> {
  const all = await parseXlsxAllSheets(buffer);
  return all[0] || { headers: [], mapping: emptyMapping(), rows: [], totalRows: 0 };
}

/**
 * Parsea CSV. Detecta delimitador (`,`, `;`, `\t`) automáticamente.
 */
export function parseCsv(buffer: Buffer): ParseResult {
  // ExcelJS no maneja CSV bien con BOM/UTF-8 → usamos csv-parse
  const text = buffer.toString("utf-8").replace(/^﻿/, ""); // quitar BOM
  const delim = detectDelimiter(text.slice(0, 5000));

  const records = csvParseSync(text, {
    delimiter: delim,
    columns: true, // primera fila como header → objetos
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) {
    return { headers: [], mapping: emptyMapping(), rows: [], totalRows: 0 };
  }
  const headers = Object.keys(records[0]!);
  const mapping = detectMapping(headers);
  const rows = records.map((r, i) => rowToParsed(r, mapping, i + 2));
  return { headers, mapping, rows, totalRows: rows.length };
}

function detectDelimiter(sample: string): string {
  // Cuenta cada candidato en las 3 primeras líneas, gana el más frecuente.
  const lines = sample.split(/\r?\n/).slice(0, 3).join("\n");
  const counts: Record<string, number> = {
    ",": (lines.match(/,/g) || []).length,
    ";": (lines.match(/;/g) || []).length,
    "\t": (lines.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ",";
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────────────────

function emptyMapping(): ParseResult["mapping"] {
  return { email: null, name: null, company: null, phone: null, extras: [] };
}

function extractCellValue(v: unknown): unknown {
  // ExcelJS cells pueden ser objetos { result, formula, hyperlink, richText, ... }
  if (v == null) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Hyperlink (típico para emails) → {text, hyperlink}
    if ("text" in o) return o.text;
    if ("result" in o) return o.result;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((p) => p.text || "").join("");
    }
    return String(v);
  }
  return v;
}

function rowToParsed(
  obj: Record<string, unknown>,
  mapping: ParseResult["mapping"],
  rowNumber: number,
): ParsedRow {
  const emailRaw = mapping.email ? obj[mapping.email] : null;
  const email = cleanEmail(emailRaw as string | null);
  const name = mapping.name ? cleanString(obj[mapping.name]) : null;
  const company = mapping.company ? cleanString(obj[mapping.company]) : null;
  const phone = mapping.phone ? cleanString(obj[mapping.phone], 60) : null;

  // Extras → meta (solo strings, limita longitud)
  const meta: Record<string, string> = {};
  for (const key of mapping.extras) {
    const v = obj[key];
    const s = cleanString(v, 500);
    if (s) meta[key] = s;
  }

  const row: ParsedRow = { rowNumber, email, name, company, phone, meta };
  if (!email) {
    row.rawError = emailRaw ? `Email inválido: ${String(emailRaw).slice(0, 80)}` : "Sin email";
  }
  return row;
}

/**
 * Detecta tipo de archivo por extensión / mime y llama al parser correspondiente.
 */
export async function parseAny(buffer: Buffer, filename: string): Promise<ParseResult> {
  const ext = filename.toLowerCase().split(".").pop() || "";
  if (ext === "csv" || ext === "tsv" || ext === "txt") return parseCsv(buffer);
  return parseXlsx(buffer);
}
