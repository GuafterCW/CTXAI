/**
 * Self-contained test for the stdio proxy: starts a fake CTXAI /api/mcp
 * endpoint, pipes JSON-RPC lines through index.js, and checks the output.
 * No dependencies — mirrors the proxy's own constraint.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));

const API_KEY = "ctx_test_key";

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.headers.authorization !== `Bearer ${API_KEY}`) {
      res.writeHead(401).end();
      return;
    }
    const message = JSON.parse(body);
    if (message.id === undefined) {
      res.writeHead(202).end(); // notification
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { echo: message.method } }),
    );
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;

function runProxy(env, lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["index.js"], {
      cwd: packageDir,
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.write(lines.map((l) => JSON.stringify(l) + "\n").join(""));
    child.stdin.end();
  });
}

// 1) Requests are forwarded and responses written to stdout.
{
  const { code, stdout } = await runProxy({ CTXAI_URL: url, CTXAI_API_KEY: API_KEY }, [
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
  ]);
  assert.equal(code, 0);
  const response = JSON.parse(stdout.trim());
  assert.deepEqual(response, { jsonrpc: "2.0", id: 1, result: { echo: "tools/list" } });
}

// 2) Notifications (202) produce no output.
{
  const { code, stdout } = await runProxy({ CTXAI_URL: url, CTXAI_API_KEY: API_KEY }, [
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ]);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
}

// 3) A rejected key surfaces as a JSON-RPC error on the request id.
{
  const { stdout } = await runProxy({ CTXAI_URL: url, CTXAI_API_KEY: "ctx_wrong" }, [
    { jsonrpc: "2.0", id: 7, method: "tools/list" },
  ]);
  const response = JSON.parse(stdout.trim());
  assert.equal(response.id, 7);
  assert.equal(response.error.code, -32000);
  assert.match(response.error.message, /401/);
}

// 4) Missing CTXAI_API_KEY exits non-zero with a hint.
{
  const env = { CTXAI_URL: url };
  delete process.env.CTXAI_API_KEY;
  const { code, stderr } = await runProxy(env, []);
  assert.equal(code, 1);
  assert.match(stderr, /CTXAI_API_KEY/);
}

server.close();
console.log("mcp-stdio: all tests passed");
