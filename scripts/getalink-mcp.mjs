#!/usr/bin/env node
/**
 * Cliente mínimo del MCP de Getalink (https://mcp.getalink.com/mcp).
 *
 * Existe porque el alta del proyecto de linkbuilding hay que hacerla con
 * credencial, y las sesiones no interactivas de Claude Code no pueden abrir
 * el OAuth. Con la API key en el entorno esto hace el handshake MCP completo
 * (initialize → notifications/initialized → petición) sin depender del cliente.
 *
 * El servidor responde JSON o text/event-stream según la petición: se
 * contemplan los dos.
 *
 * Uso:
 *   GETALINK_API_KEY=glk_... node scripts/getalink-mcp.mjs tools
 *   GETALINK_API_KEY=glk_... node scripts/getalink-mcp.mjs call <tool> '<json-args>'
 *
 * Ficha del proyecto a dar de alta: docs/getalink-proyecto-startidea.md
 */

const ENDPOINT = process.env.GETALINK_MCP_URL || "https://mcp.getalink.com/mcp";
const API_KEY = process.env.GETALINK_API_KEY || "";

let sessionId = null;
let nextId = 1;

/** Extrae el payload JSON-RPC tanto de una respuesta JSON como de un stream SSE. */
function parseBody(contentType, text) {
  if (contentType.includes("text/event-stream")) {
    const payloads = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    if (!payloads.length) throw new Error(`stream SSE sin data:\n${text}`);
    // El último evento es la respuesta; los previos son progreso.
    return JSON.parse(payloads[payloads.length - 1]);
  }
  return JSON.parse(text);
}

async function rpc(method, params, { notification = false } = {}) {
  const body = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: nextId++, method, params };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (API_KEY) headers["X-Api-Key"] = API_KEY;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });

  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  if (res.status === 401) {
    const hint = API_KEY
      ? "la API key no es válida o ha caducado"
      : "falta GETALINK_API_KEY en el entorno";
    throw new Error(`401 de Getalink: ${hint}`);
  }
  if (notification) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);

  const out = parseBody(res.headers.get("content-type") || "", await res.text());
  if (out.error) throw new Error(`${method} → ${out.error.code}: ${out.error.message}`);
  return out.result;
}

async function handshake() {
  const info = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "todomerch-cli", version: "1.0.0" },
  });
  await rpc("notifications/initialized", {}, { notification: true });
  return info;
}

async function main() {
  const [cmd, tool, rawArgs] = process.argv.slice(2);

  if (!cmd || !["tools", "call"].includes(cmd)) {
    console.error("uso: getalink-mcp.mjs tools | call <tool> '<json-args>'");
    process.exit(2);
  }

  const info = await handshake();
  console.error(`conectado a ${info?.serverInfo?.name ?? "getalink"} ${info?.serverInfo?.version ?? ""}`);

  if (cmd === "tools") {
    const { tools = [] } = await rpc("tools/list", {});
    for (const t of tools) {
      console.log(`\n· ${t.name}`);
      if (t.description) console.log(`  ${t.description.split("\n")[0]}`);
      const props = t.inputSchema?.properties ?? {};
      const required = new Set(t.inputSchema?.required ?? []);
      for (const [k, v] of Object.entries(props)) {
        console.log(`    ${required.has(k) ? "*" : " "} ${k}: ${v.type ?? "?"}`);
      }
    }
    console.log(`\n${tools.length} herramientas`);
    return;
  }

  if (!tool) {
    console.error("falta el nombre de la herramienta");
    process.exit(2);
  }
  const args = rawArgs ? JSON.parse(rawArgs) : {};
  const result = await rpc("tools/call", { name: tool, arguments: args });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
