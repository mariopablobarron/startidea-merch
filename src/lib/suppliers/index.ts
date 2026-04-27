import { midoceanClient } from "./midocean";
import { makitoAdapter } from "./makito";

export type SupplierPing =
  | { code: "midocean" | "makito"; name: string; ok: true }
  | { code: "midocean" | "makito"; name: string; ok: false; reason: string };

export async function pingAll(): Promise<SupplierPing[]> {
  const [m, mk] = await Promise.all([
    midoceanClient.ping(),
    makitoAdapter.ping(),
  ]);
  return [
    { code: "midocean", name: "MidOcean", ...m },
    { code: "makito", name: "Makito", ...mk },
  ];
}
