import { NextResponse } from "next/server";
import { z } from "zod";
import { validateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  code: z.string().min(1).max(40),
  totalCents: z.number().int().positive().max(100_000_000),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "JSON inválido" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "Datos inválidos" }, { status: 400 });

  const result = await validateCoupon(parsed.data.code, parsed.data.totalCents);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });
  return NextResponse.json({
    ok: true,
    code: result.coupon.code,
    label: result.coupon.label,
    kind: result.coupon.kind,
    discountCents: result.discountCents,
  });
}
