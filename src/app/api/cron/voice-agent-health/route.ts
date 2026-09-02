import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyTelegram, escapeTgHtml } from "@/lib/telegram";
import { wrapCronHandler } from "@/lib/cron-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Vigía de salud de David (agente de voz ElevenLabs).
 *
 * Motivo: el 2026-07-20 David dejó de responder EN SILENCIO porque la cuenta
 * de ElevenLabs pasó a `past_due` (impago) — conectaba y saludaba, pero cada
 * turno real fallaba con "payment issue". Nadie se enteró hasta probarlo a
 * mano. Este cron detecta el problema y avisa por Telegram.
 *
 * Chequea:
 *   1. Estado de la suscripción (past_due / cancelado → alerta).
 *   2. Cuota de caracteres casi agotada (>90% → aviso).
 *   3. Últimas conversaciones con fallo de pago/procesamiento.
 *
 * Dedup: solo avisa cuando el estado CAMBIA (AdminSetting
 * voice_agent_health_last), para no repetir la misma alerta cada 6h.
 *
 *   POST /api/cron/voice-agent-health  (Header X-Cron-Secret)
 */
const KEY = "voice_agent_health_last";

export const POST = wrapCronHandler("voice-agent-health", async (req: Request) => {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return NextResponse.json({ ok: true, skipped: "ElevenLabs no configurado" });
  }

  const problems: string[] = [];
  const get = async (path: string) => {
    const r = await fetch(`https://api.elevenlabs.io${path}`, {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return { ok: r.ok, status: r.status, json: r.ok ? await r.json() : null };
  };

  // 1) Suscripción
  try {
    const sub = await get("/v1/user/subscription");
    if (sub.ok && sub.json) {
      const status = String(sub.json.status || "");
      const used = Number(sub.json.character_count ?? 0);
      const limit = Number(sub.json.character_limit ?? 0);
      if (status && status !== "active" && status !== "trialing") {
        problems.push(`suscripción en estado "${status}" (revisar pago en elevenlabs.io → Billing)`);
      }
      if (limit > 0 && used / limit >= 0.9) {
        problems.push(`cuota de caracteres al ${Math.round((used / limit) * 100)}% (${used}/${limit})`);
      }
    } else if (sub.status === 401) {
      problems.push("API key de ElevenLabs inválida (401)");
    }
  } catch (e) {
    // fallo de red puntual: no alertamos por eso (evita falsos positivos)
    console.error("[voice-agent-health] subscription:", e instanceof Error ? e.message : e);
  }

  // 2) Últimas conversaciones con fallo de pago/procesamiento
  try {
    const convs = await get(`/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=5`);
    if (convs.ok && convs.json) {
      const list: Array<{ conversation_id?: string; status?: string }> = convs.json.conversations || [];
      const failed = list.filter((c) => c.status === "failed");
      if (failed.length >= 3) {
        // mirar el motivo de la primera fallida
        let reason = "";
        try {
          const d = await get(`/v1/convai/conversations/${failed[0].conversation_id}`);
          reason = String(d.json?.metadata?.termination_reason || "").slice(0, 140);
        } catch {}
        problems.push(
          `${failed.length}/5 últimas conversaciones FALLARON${reason ? ` — "${reason}"` : ""}`,
        );
      }
    }
  } catch (e) {
    console.error("[voice-agent-health] conversations:", e instanceof Error ? e.message : e);
  }

  // Dedup: firma del estado actual; solo avisa si cambió respecto a la última.
  const signature = problems.slice().sort().join(" | ");
  let last = "";
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key: KEY }, select: { value: true } });
    last = typeof row?.value === "string" ? row.value : "";
  } catch {}

  if (problems.length > 0 && signature !== last) {
    await notifyTelegram(
      // problems[] incluye el `status` y el `termination_reason` que devuelve
      // ElevenLabs: texto libre de un tercero. Se escapa al pintar, no al construir el
      // array, para no alterar la firma de dedup guardada en AdminSetting.
      `🚨 <b>David (voz) con problemas</b>\n${problems.map((p) => `• ${escapeTgHtml(p)}`).join("\n")}\n\nEl asistente puede estar caído para los clientes. Revisa elevenlabs.io.`,
    ).catch((e) => console.error("[voice-agent-health] telegram:", e instanceof Error ? e.message : e));
  } else if (problems.length === 0 && last) {
    // Se recuperó → avisar una vez que ya está OK.
    await notifyTelegram(`✅ <b>David (voz)</b> recuperado — la cuenta de ElevenLabs vuelve a estar sana.`).catch(
      () => {},
    );
  }

  try {
    await prisma.adminSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: signature as unknown as object },
      update: { value: signature as unknown as object },
    });
  } catch {}

  return NextResponse.json({ ok: true, problems });
});
