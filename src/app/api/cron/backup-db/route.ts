import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { requireCronSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Backup nocturno de Postgres → Telegram.
 *
 * Patrón heredado de mentor-web: dumpea con pg_dump, comprime gzip y sube a
 * un chat de Telegram. Límite Telegram: 50 MB por archivo. Para esta DB
 * (cotizaciones + notas) tardará años en acercarse a ese límite.
 *
 * Disparado externamente por cron-job.org cada noche con
 * POST https://merchandising.startidea.es/api/cron/backup-db
 *   Header X-Cron-Secret: <CRON_SECRET>
 */
export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return NextResponse.json({ error: "Telegram no configurado" }, { status: 503 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "DATABASE_URL ausente" }, { status: 503 });

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const filename = `merch-${stamp}.sql.gz`;

  // Spawn pg_dump y capturar stdout en buffer
  let dumpBytes: Buffer;
  try {
    dumpBytes = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn("pg_dump", ["--no-owner", "--no-privileges", "--clean", "--if-exists", dbUrl], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      child.stdout.on("data", (c) => chunks.push(c));
      child.stderr.on("data", (c) => errChunks.push(c));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump exit ${code}: ${Buffer.concat(errChunks).toString().slice(0, 500)}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    });
  } catch (err) {
    return NextResponse.json(
      { error: "pg_dump falló", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const gz = gzipSync(dumpBytes);
  const sizeKb = (gz.length / 1024).toFixed(1);

  if (gz.length > 49 * 1024 * 1024) {
    // Telegram límite ~50 MB. Avisamos antes de fallar al subir.
    return NextResponse.json(
      { error: "Backup supera 49 MB, requiere split o S3" },
      { status: 413 },
    );
  }

  // Multipart hacia Telegram sendDocument
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("caption", `🗃 startidea-merch backup\n${stamp}\n${sizeKb} KB`);
  form.append("document", new Blob([new Uint8Array(gz)], { type: "application/gzip" }), filename);

  const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!tgRes.ok) {
    const body = await tgRes.text().catch(() => "");
    return NextResponse.json(
      { error: "Telegram rechazó el upload", status: tgRes.status, body: body.slice(0, 300) },
      { status: 502 },
    );
  }

  const finishedAt = new Date();
  return NextResponse.json({
    ok: true,
    filename,
    sizeBytes: gz.length,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  });
}
