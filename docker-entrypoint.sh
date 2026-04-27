#!/bin/sh
set -e

echo "[entrypoint] DATABASE_URL host check: ${DATABASE_URL%%\?*}" | sed 's|://[^@]*@|://***@|'
echo "[entrypoint] Esperando a Postgres en host merch-db..."
i=0
until node -e "const net=require('net');const s=new net.Socket();s.setTimeout(2000);s.on('connect',()=>{s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));s.on('timeout',()=>{s.destroy();process.exit(1)});s.connect(5432,'merch-db');" 2>/dev/null; do
  i=$((i+1))
  if [ $i -gt 60 ]; then
    echo "[entrypoint] Postgres no respondió en 120s. Abortando."
    exit 1
  fi
  echo "[entrypoint] Postgres no listo aún (intento $i/60), esperando 2s..."
  sleep 2
done

echo "[entrypoint] Postgres responde. Ejecutando prisma db push..."
node node_modules/prisma/build/index.js db push --skip-generate --accept-data-loss

echo "[entrypoint] Schema OK. Arrancando Next.js..."
exec node server.js
