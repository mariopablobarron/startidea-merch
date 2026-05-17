import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  voice_session_id: z.string().min(1),
  elevenlabs_conversation_id: z.string().optional().nullable(),
  duration_sec: z.number().int().min(0).max(3600),
  tools_called: z
    .array(z.object({ tool: z.string(), args: z.unknown().optional(), ok: z.boolean(), at: z.string().optional() }))
    .max(50)
    .optional(),
  product_slugs_discussed: z.array(z.string()).max(50).optional(),
});

/**
 * Cliente notifica cierre de sesión (timeout/usuario cierra widget).
 * Persistimos duración para tracking de coste + tools llamadas.
 *
 * Sin auth fuerte: el voice_session_id ya es opaco (cuid). El peor abuso
 * sería falsificar métricas, no exfiltrar datos.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const d = parsed.data;

  // Coste estimado ElevenLabs Conversational AI: ~$0.08/min ≈ 0,074€ ≈ 7,4 cents/min
  const costCents = Math.round((d.duration_sec / 60) * 7.4);

  await prisma.voiceSession.update({
    where: { id: d.voice_session_id },
    data: {
      endedAt: new Date(),
      durationSec: d.duration_sec,
      estimatedCostCents: costCents,
      elevenLabsConversationId: d.elevenlabs_conversation_id || null,
      toolsCalled: d.tools_called as never,
      productSlugsDiscussed: d.product_slugs_discussed || [],
    },
  }).catch(() => {}); // si la sesión no existe, simplemente ignoramos

  return NextResponse.json({ ok: true });
}
