/**
 * Self-contained test for the CLI: starts a fake CTXAI REST API, runs real
 * `ctxai` processes against it, and checks output, request bodies and
 * downloaded files. No dependencies — mirrors the CLI's own constraint.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const API_KEY = "ctx_test_key";
const ASSET_BYTES = Buffer.from("fake-png-bytes");

let lastJobRequest = null;
let pollCount = 0;

const server = createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  const { pathname } = new URL(req.url, "http://x");
  const json = (body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (pathname === "/api/providers") {
    json({
      providers: [
        {
          id: "mock",
          name: "Demo",
          keyUrl: "",
          configured: true,
          models: [
            {
              id: "mock-image",
              kind: "image",
              description: "demo",
              paramsSchema: { properties: { prompt: {}, size: {} } },
            },
          ],
        },
      ],
    });
  } else if (pathname === "/api/jobs" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    lastJobRequest = JSON.parse(body);
    json({ job: { id: "job-1", status: "running" } }, 201);
  } else if (pathname === "/api/jobs/job-1") {
    // First poll: still running; afterwards: done with one asset.
    pollCount += 1;
    json({
      job:
        pollCount < 2
          ? { id: "job-1", status: "running", progress: 0.4 }
          : {
              id: "job-1",
              status: "succeeded",
              kind: "image",
              modelId: "mock-image",
              createdAt: new Date().toISOString(),
              assets: [{ id: "asset-1", mime: "image/png" }],
            },
    });
  } else if (pathname === "/api/jobs/job-broken") {
    json({ job: { id: "job-broken", status: "failed", error: "provider exploded" } });
  } else if (pathname === "/api/assets/asset-1") {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(ASSET_BYTES);
  } else {
    json({ error: `unhandled ${req.method} ${pathname}` }, 500);
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["index.js", ...args], {
      cwd: packageDir,
      env: {
        ...process.env,
        CTXAI_URL: url,
        CTXAI_API_KEY: API_KEY,
        CTXAI_POLL_MS: "10",
        XDG_CONFIG_HOME: path.join(tmpdir(), "ctxai-cli-test-noconfig"),
        ...env,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const workDir = await mkdtemp(path.join(tmpdir(), "ctxai-cli-test-"));
try {
  // 1) `models` lists the model and how to use it.
  {
    const { code, stdout } = await runCli(["models"]);
    assert.equal(code, 0);
    assert.match(stdout, /mock-image/);
    assert.match(stdout, /params: size/);
  }

  // 2) `generate` sends typed params + base64 files, polls, downloads.
  {
    const imagePath = path.join(workDir, "input.bin");
    await writeFile(imagePath, "raw-input");
    const { code, stdout } = await runCli([
      "generate", "a", "test", "prompt",
      "--model", "mock-image",
      "--param", "size=1024",
      "--param", `image=@${imagePath}`,
      "--output", workDir,
    ]);
    assert.equal(code, 0, stdout);
    assert.deepEqual(lastJobRequest, {
      provider: "mock",
      modelId: "mock-image",
      input: {
        prompt: "a test prompt",
        size: 1024, // JSON-typed, not the string "1024"
        image: Buffer.from("raw-input").toString("base64"),
      },
    });
    const downloaded = await readFile(path.join(workDir, "asset-1.png"));
    assert.deepEqual(downloaded, ASSET_BYTES);
    assert.match(stdout, /asset-1\.png/);
  }

  // 3) Unknown model fails with the list of available ids.
  {
    const { code, stderr } = await runCli(["generate", "x", "--model", "nope"]);
    assert.equal(code, 1);
    assert.match(stderr, /mock-image/);
  }

  // 4) A failed job surfaces the provider error and exits non-zero.
  {
    const { code, stderr } = await runCli(["job", "job-broken", "--wait"]);
    assert.equal(code, 1);
    assert.match(stderr, /provider exploded/);
  }

  // 5) Without any key the CLI points at `ctxai login`.
  {
    const { code, stderr } = await runCli(["models"], { CTXAI_API_KEY: "" });
    assert.equal(code, 1);
    assert.match(stderr, /ctxai login/);
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
  server.close();
}

console.log("cli: all tests passed");
