import { createHash } from "node:crypto";
import type { Prisma, CartQuoteItem, CartQuoteItemMarking } from "@prisma/client";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

/** Purchase-order assignment is the only mutable operational field excluded.
 * Quantities, variants, artwork and marking choices all belong to the quote.
 */
export async function readPaymentItemsFingerprint(db: Pick<Prisma.TransactionClient, "cartQuoteItem">, cartId: string): Promise<string> {
  const items = await db.cartQuoteItem.findMany({ where: { cartId }, include: { markings: true }, orderBy: { id: "asc" } });
  return paymentItemsFingerprint(items);
}

export function paymentItemsFingerprint(items: Array<CartQuoteItem & { markings: CartQuoteItemMarking[] }>): string {
  const composition = [...items].sort((a, b) => a.id.localeCompare(b.id)).map(({ purchaseOrderId: _assignment, markings, ...item }) => ({
    ...item, markings: [...markings].sort((a, b) => a.id.localeCompare(b.id)),
  }));
  return createHash("sha256").update(JSON.stringify(canonical(composition))).digest("hex");
}
