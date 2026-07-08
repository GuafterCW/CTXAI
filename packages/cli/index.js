#!/usr/bin/env node
/**
 * ctxai — command-line client for a CTXAI instance.
 *
 * Talks to the same REST API the web UI uses, authenticated with a platform
 * API key (ctx_…) created under Settings → API keys.
 *
 * Configuration, first match wins:
 *   1. --url / --key flags
 *   2. CTXAI_URL / CTXAI_API_KEY environment variables
 *   3. `ctxai login` (~/.config/ctxai/config.json)
 */

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

const POLL_MS = Number(process.env.CTXAI_POLL_MS) || 2000;

/* ----------------------------------------------------------------- output */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const yellow = paint(33);

/** Rewrite the current line on a TTY; stay quiet otherwise. */
function statusLine(text) {
  if (process.stderr.isTTY) process.stderr.write(`\r\x1b[2K${text}`);
}
function statusDone() {
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[2K");
}

class CliError extends Error {}

/* ------------------------------------------------------------------ config */

const configFile = path.join(
  process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
  "ctxai",
  "config.json",
);

async function readConfigFile() {
  try {
    return JSON.parse(await readFile(configFile, "utf8"));
  } catch {
    return {};
  }
}

async function resolveConfig(flags) {
  const stored = await readConfigFile();
  const url = (flags.url ?? process.env.CTXAI_URL ?? stored.url ?? "http://localhost:3000")
    .replace(/\/$/, "");
  const key = flags.key ?? process.env.CTXAI_API_KEY ?? stored.key;
  if (!key) {
    throw new CliError(
      "No API key. Create one in your CTXAI instance under Settings → API keys, then run:\n" +
        "  ctxai login\n" +
        "or set CTXAI_API_KEY (and CTXAI_URL for remote instances).",
    );
  }
  return { url, key };
}

/* -------------------------------------------------------------------- http */

async function api(cfg, pathname, init = {}) {
  let res;
  try {
    res = await fetch(cfg.url + pathname, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (err) {
    throw new CliError(`Could not reach ${cfg.url} — is your CTXAI instance running? (${err.cause?.code ?? err.message})`);
  }
  if (res.status === 401) {
    throw new CliError("CTXAI rejected the API key (401). Run `ctxai login` with a fresh key.");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new CliError(message);
  }
  return res;
}

/* ------------------------------------------------------------------ assets */

const EXT_BY_MIME = {
  "video/mp4": "mp4",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

async function downloadAssets(cfg, job, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const saved = [];
  for (const asset of job.assets ?? []) {
    const ext = EXT_BY_MIME[asset.mime] ?? asset.mime.split("/").pop();
    const file = path.join(outputDir, `${asset.id}.${ext}`);
    const res = await api(cfg, `/api/assets/${asset.id}?download`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
    saved.push(file);
  }
  return saved;
}

/* -------------------------------------------------------------------- jobs */

async function waitForJob(cfg, jobId, label) {
  for (;;) {
    const { job } = await (await api(cfg, `/api/jobs/${jobId}`)).json();
    if (job.status === "succeeded") {
      statusDone();
      return job;
    }
    if (job.status === "failed") {
      statusDone();
      throw new CliError(job.error || `${label} failed`);
    }
    const pct = job.progress != null ? ` ${Math.round(job.progress * 100)}%` : "";
    statusLine(`${yellow("●")} ${label}…${pct}`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function printJobLine(job) {
  const mark =
    job.status === "succeeded" ? green("✔") :
    job.status === "failed" ? red("✘") :
    yellow("●");
  const when = new Date(job.createdAt).toLocaleString();
  console.log(
    `${mark} ${job.id}  ${job.status.padEnd(9)} ${job.kind.padEnd(7)} ${job.modelId.padEnd(22)} ${dim(when)}` +
      (job.error ? `\n    ${red(job.error)}` : ""),
  );
}

/* -------------------------------------------------------- param parsing --- */

/**
 * `--param key=value` → typed value: JSON where it parses (numbers, booleans,
 * objects), `@file` reads the file as base64 (what image inputs expect).
 */
async function parseParams(pairs) {
  const input = {};
  for (const pair of pairs ?? []) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new CliError(`--param expects key=value, got "${pair}"`);
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    if (raw.startsWith("@")) {
      input[key] = (await readFile(raw.slice(1))).toString("base64");
    } else {
      try {
        input[key] = JSON.parse(raw);
      } catch {
        input[key] = raw;
      }
    }
  }
  return input;
}

/* --------------------------------------------------------------- commands */

const COMMON = {
  url: { type: "string" },
  key: { type: "string" },
};

async function cmdLogin(args) {
  const { values } = parseArgs({ args, options: { ...COMMON } });
  let { url, key } = values;

  if ((!url || !key) && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    url ||= (await rl.question(`Instance URL ${dim("(http://localhost:3000)")}: `)) || "http://localhost:3000";
    key ||= await rl.question("API key (ctx_…): ");
    rl.close();
  }
  if (!url || !key) throw new CliError("Usage: ctxai login --url <instance-url> --key <ctx_…>");

  const cfg = { url: url.replace(/\/$/, ""), key };
  await api(cfg, "/api/providers"); // verify before persisting

  await mkdir(path.dirname(configFile), { recursive: true });
  await writeFile(configFile, JSON.stringify(cfg, null, 2) + "\n");
  await chmod(configFile, 0o600);
  console.log(`${green("✔")} Connected to ${bold(cfg.url)} — saved to ${dim(configFile)}`);
}

async function cmdModels(args) {
  const { values } = parseArgs({ args, options: { ...COMMON } });
  const cfg = await resolveConfig(values);
  const { providers } = await (await api(cfg, "/api/providers")).json();

  for (const provider of providers) {
    const state = provider.configured ? green("configured") : dim(`needs key — ${provider.keyUrl}`);
    console.log(`\n${bold(provider.name)} ${dim(`(${provider.id})`)}  ${state}`);
    for (const model of provider.models) {
      const params = Object.keys(model.paramsSchema?.properties ?? {})
        .filter((p) => p !== "prompt")
        .join(", ");
      console.log(`  ${bold(model.id.padEnd(24))} ${model.kind.padEnd(6)} ${model.description}`);
      if (params) console.log(`  ${" ".repeat(24)} ${dim(`params: ${params}`)}`);
    }
  }
  console.log(`\n${dim('Generate with: ctxai generate "<prompt>" --model <id>')}`);
}

async function cmdGenerate(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      ...COMMON,
      model: { type: "string", short: "m" },
      param: { type: "string", short: "p", multiple: true },
      output: { type: "string", short: "o", default: "." },
      "no-wait": { type: "boolean" },
    },
    allowPositionals: true,
  });
  const prompt = positionals.join(" ").trim();
  if (!values.model) throw new CliError("Missing --model <id>. See `ctxai models`.");

  const cfg = await resolveConfig(values);
  const { providers } = await (await api(cfg, "/api/providers")).json();
  const provider = providers.find((p) => p.models.some((m) => m.id === values.model));
  if (!provider) {
    const known = providers.flatMap((p) => p.models.map((m) => m.id)).join(", ");
    throw new CliError(`Unknown model "${values.model}". Available: ${known}`);
  }

  const input = await parseParams(values.param);
  if (prompt) input.prompt = prompt;

  const { job } = await (
    await api(cfg, "/api/jobs", {
      method: "POST",
      body: JSON.stringify({ provider: provider.id, modelId: values.model, input }),
    })
  ).json();

  if (values["no-wait"]) {
    console.log(job.id);
    return;
  }

  console.error(`${dim("job")} ${job.id}`);
  const finished = await waitForJob(cfg, job.id, `generating with ${values.model}`);
  const files = await downloadAssets(cfg, finished, values.output);
  for (const file of files) console.log(`${green("✔")} ${file}`);
}

async function cmdJobs(args) {
  const { values } = parseArgs({
    args,
    options: {
      ...COMMON,
      limit: { type: "string", default: "20" },
      status: { type: "string" },
      json: { type: "boolean" },
    },
  });
  const cfg = await resolveConfig(values);
  const query = new URLSearchParams({ limit: values.limit });
  if (values.status) query.set("status", values.status);
  const { jobs } = await (await api(cfg, `/api/jobs?${query}`)).json();

  if (values.json) console.log(JSON.stringify(jobs, null, 2));
  else if (jobs.length === 0) console.log(dim("No jobs yet."));
  else jobs.forEach(printJobLine);
}

async function cmdJob(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...COMMON, wait: { type: "boolean" }, json: { type: "boolean" } },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) throw new CliError("Usage: ctxai job <job-id> [--wait]");

  const cfg = await resolveConfig(values);
  const job = values.wait
    ? await waitForJob(cfg, id, "waiting")
    : (await (await api(cfg, `/api/jobs/${id}`)).json()).job;

  if (values.json) console.log(JSON.stringify(job, null, 2));
  else {
    printJobLine(job);
    for (const asset of job.assets ?? []) {
      console.log(`    ${dim(asset.mime)} ${cfg.url}/api/assets/${asset.id}`);
    }
  }
}

async function cmdDownload(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...COMMON, output: { type: "string", short: "o", default: "." } },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) throw new CliError("Usage: ctxai download <job-id> [--output <dir>]");

  const cfg = await resolveConfig(values);
  const { job } = await (await api(cfg, `/api/jobs/${id}`)).json();
  if (!job.assets?.length) throw new CliError("This job has no assets (yet).");
  const files = await downloadAssets(cfg, job, values.output);
  for (const file of files) console.log(`${green("✔")} ${file}`);
}

async function cmdCompose(args) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      ...COMMON,
      title: { type: "string" },
      output: { type: "string", short: "o", default: "." },
      "no-wait": { type: "boolean" },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (!file) throw new CliError("Usage: ctxai compose <timeline.json> [--title <t>]");

  const timeline = JSON.parse(await readFile(file, "utf8"));
  const cfg = await resolveConfig(values);
  const { job } = await (
    await api(cfg, "/api/compositions", {
      method: "POST",
      body: JSON.stringify({ title: values.title, timeline }),
    })
  ).json();

  if (values["no-wait"]) {
    console.log(job.id);
    return;
  }

  console.error(`${dim("job")} ${job.id}`);
  const finished = await waitForJob(cfg, job.id, "rendering montage");
  const files = await downloadAssets(cfg, finished, values.output);
  for (const out of files) console.log(`${green("✔")} ${out}`);
}

/* -------------------------------------------------------------------- main */

const HELP = `${bold("ctxai")} — generate media on your CTXAI instance from the terminal

${bold("Usage")}
  ctxai login                              connect to an instance (saves URL + key)
  ctxai models                             list providers and models
  ctxai generate "<prompt>" -m <model>     generate and download the result
  ctxai jobs [--limit n] [--status s]      list recent jobs
  ctxai job <id> [--wait] [--json]         inspect one job
  ctxai download <job-id> [-o dir]         download a job's assets
  ctxai compose <timeline.json>            render a montage from a timeline

${bold("Generate options")}
  -m, --model <id>      model id (see \`ctxai models\`)
  -p, --param k=v       model parameter, repeatable; @file reads a file as
                        base64 (e.g. -p image=@photo.jpg for image-to-video)
  -o, --output <dir>    where to save results (default: current directory)
      --no-wait         print the job id and exit instead of waiting

${bold("Connection")} (flags > env > \`ctxai login\`)
  --url <url>           instance URL          env: CTXAI_URL
  --key <ctx_…>         platform API key      env: CTXAI_API_KEY

${bold("Examples")}
  ctxai generate "a fox in the snow, cinematic" -m seedream-image
  ctxai generate "neon city flythrough" -m kling-text-to-video -p duration=10
  ctxai generate "animate this" -m kling-image-to-video -p image=@still.png
  ctxai compose short.json --title "My Short" -o renders/
`;

const COMMANDS = {
  login: cmdLogin,
  models: cmdModels,
  generate: cmdGenerate,
  jobs: cmdJobs,
  job: cmdJob,
  download: cmdDownload,
  compose: cmdCompose,
};

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  console.log(HELP);
  process.exit(command ? 0 : 1);
}
if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
  process.exit(0);
}

const handler = COMMANDS[command];
if (!handler) {
  console.error(`${red("✘")} Unknown command "${command}". Run \`ctxai help\`.`);
  process.exit(1);
}

try {
  await handler(rest);
} catch (err) {
  statusDone();
  const message = err instanceof CliError ? err.message : (err.stack ?? String(err));
  console.error(`${red("✘")} ${message}`);
  process.exit(1);
}
