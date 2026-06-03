import { midoceanClient } from "./midocean";
import { makitoAdapter } from "./makito";
import { ping as cifraPing } from "./cifra";

export type SupplierCode = "midocean" | "makito" | "cifra";

export type SupplierPing =
  | { code: SupplierCode; name: string; ok: true }
  | { code: SupplierCode; name: string; ok: false; reason: string };

export async function pingAll(): Promise<SupplierPing[]> {
  const [m, mk, c] = await Promise.all([
    midoceanClient.ping(),
    makitoAdapter.ping(),
    cifraPing(),
  ]);
  return [
    { code: "midocean", name: "MidOcean", ...stripExtras(m) },
    { code: "makito", name: "Makito", ...stripExtras(mk) },
    { code: "cifra", name: "Cifra", ...stripExtras(c) },
  ];
}

// pingCifra puede devolver { ok: true, itemsSampled: number } — nos
// quedamos sólo con { ok, [reason] } para que el shape unificado calze.
function stripExtras(
  p: { ok: true } | { ok: true; itemsSampled?: number } | { ok: false; reason: string },
): { ok: true } | { ok: false; reason: string } {
  if (p.ok) return { ok: true };
  return { ok: false, reason: p.reason };
}
