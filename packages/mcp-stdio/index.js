#!/usr/bin/env node
/**
 * ctxai-mcp — stdio ⇄ Streamable-HTTP proxy for a CTXAI instance.
 *
 * The CTXAI server (/api/mcp) is a complete stateless MCP server, so this
 * proxy simply forwards newline-delimited JSON-RPC messages from stdin to
 * HTTP and writes responses back to stdout.
 *
 * Env:
 *   CTXAI_URL      Base URL of your instance (default http://localhost:3000)
 *   CTXAI_API_KEY  Platform API key (ctx_…), created in Settings → API keys
 */

const baseUrl = (process.env.CTXAI_URL ?? "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.CTXAI_API_KEY;

if (!apiKey) {
  console.error(
    "ctxai-mcp: CTXAI_API_KEY is not set.\n" +
      "Create a key in your CTXAI instance under Settings → API keys, then:\n" +
      '  CTXAI_URL=https://your-instance CTXAI_API_KEY=ctx_… npx @ctxai/mcp',
  );
  process.exit(1);
}

const endpoint = `${baseUrl}/api/mcp`;

/** Forward one JSON-RPC message; resolve with the response body or null. */
async function forward(message) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (res.status === 202) return null; // notification accepted
  if (res.status === 401) {
    throw new Error("CTXAI rejected the API key (401). Check CTXAI_API_KEY.");
  }
  return res.json();
}

const pending = new Set();
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue; // ignore malformed lines
    }

    const inflight = forward(message)
      .then((response) => {
        if (response) process.stdout.write(JSON.stringify(response) + "\n");
      })
      .catch((err) => {
        if (message.id !== undefined) {
          process.stdout.write(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32000, message: String(err.message ?? err) },
            }) + "\n",
          );
        } else {
          console.error(`ctxai-mcp: ${err.message ?? err}`);
        }
      })
      .finally(() => pending.delete(inflight));
    pending.add(inflight);
  }
});

// Drain in-flight requests before exiting when the client closes stdin.
process.stdin.on("end", async () => {
  await Promise.allSettled([...pending]);
  process.exit(0);
});
