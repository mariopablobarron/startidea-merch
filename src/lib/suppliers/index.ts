import { midoceanAdapter, syncMidocean } from "./midocean";
import { makitoAdapter, syncMakito } from "./makito";
import type { SupplierAdapter, SupplierCode, SyncResult } from "./types";

export const suppliers: Record<SupplierCode, SupplierAdapter> = {
  midocean: midoceanAdapter,
  makito: makitoAdapter,
};

export async function syncAll(): Promise<SyncResult[]> {
  return Promise.all([syncMidocean(), syncMakito()]);
}

export type { SupplierCode, SupplierAdapter, SyncResult } from "./types";
