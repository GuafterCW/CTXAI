import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ffmpegPath, run } from "@/lib/ffmpeg";
import type { PollResult, Provider } from "../types";

/**
 * Keyless demo provider. Simulates realistic generation timing so the UI
 * (and tests) can exercise the full job lifecycle without spending credits.
 */

const RUN_SECONDS = { image: 4, video: 10 };

interface MockJob {
  kind: "image" | "video";
  prompt: string;
  startedAt: number;
}

// Stashed on globalThis: Next.js dev compiles separate module instances
// per route bundle, and the poller must see jobs created by API routes.
const KEY = Symbol.for("ctxai.mockJobs");
const jobs = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map<
  string,
  MockJob
>()) as Map<string, MockJob>;

const inputSchema = z.object({
  prompt: z.string().min(1).max(2000).describe("Anything — this is a demo"),
});

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `0x${f(0)}${f(8)}${f(4)}`;
}

// drawtext only accepts a small escaped charset; keep it simple.
const textSafe = (s: string) => s.replace(/[^\w .,!?-]/g, " ").slice(0, 48);

/**
 * Placeholder PNG rendered with ffmpeg (must be a raster format — ffmpeg
 * cannot decode SVG, which would break montage renders using mock images).
 */
async function mockImage(prompt: string): Promise<Buffer> {
  const hue = [...prompt].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const gradient = `gradients=size=1024x1024:c0=${hslToHex(hue, 70, 18)}:c1=${hslToHex(
    (hue + 80) % 360,
    80,
    45,
  )}:x0=0:y0=0:x1=1024:y1=1024`;
  const label = `drawtext=text='${textSafe(prompt)}':font=sans:fontcolor=white@0.85:fontsize=34:x=64:y=920,drawtext=text='ctxai mock generation':font=sans:fontcolor=white@0.4:fontsize=22:x=64:y=968`;

  const dir = await mkdtemp(path.join(tmpdir(), "ctxai-mock-"));
  const out = path.join(dir, "mock.png");
  try {
    try {
      await run(ffmpegPath(), ["-y", "-f", "lavfi", "-i", `${gradient},${label}`, "-frames:v", "1", out]);
    } catch {
      // No usable font on this system — plain gradient is fine for a demo.
      await run(ffmpegPath(), ["-y", "-f", "lavfi", "-i", gradient, "-frames:v", "1", out]);
    }
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function mockVideo(): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "ctxai-mock-"));
  const out = path.join(dir, "mock.mp4");
  try {
    await run(ffmpegPath(), [
      "-y",
      "-f", "lavfi",
      "-i", "testsrc2=size=640x360:rate=24:duration=2",
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const mockProvider: Provider = {
  id: "mock",
  name: "Demo (no key)",
  description:
    "Built-in demo provider — try the full flow without any API key. Produces placeholder media.",
  keyUrl: "",
  credentialFields: [],
  models: [
    {
      id: "mock-image",
      name: "Demo · Image",
      kind: "image",
      description: "Placeholder image after a simulated ~4s generation.",
      inputSchema,
      costHint: "free",
    },
    {
      id: "mock-video",
      name: "Demo · Video",
      kind: "video",
      description: "Placeholder clip after a simulated ~10s generation.",
      inputSchema,
      costHint: "free",
    },
  ],

  async validateCredentials() {
    // Always valid: there is nothing to check.
  },

  async createJob(_ctx, modelId, input) {
    const id = randomUUID();
    jobs.set(id, {
      kind: modelId === "mock-video" ? "video" : "image",
      prompt: String(input.prompt ?? ""),
      startedAt: Date.now(),
    });
    return { providerJobId: id };
  },

  async pollJob(_ctx, providerJobId): Promise<PollResult> {
    const job = jobs.get(providerJobId);
    if (!job) return { status: "failed", error: "Mock job lost (server restarted)" };

    const elapsed = (Date.now() - job.startedAt) / 1000;
    const total = RUN_SECONDS[job.kind];
    if (elapsed < total) {
      return { status: "running", progress: Math.min(elapsed / total, 0.97) };
    }

    jobs.delete(providerJobId);
    if (job.kind === "image") {
      return {
        status: "succeeded",
        assets: [
          { data: await mockImage(job.prompt), mime: "image/png", width: 1024, height: 1024 },
        ],
      };
    }
    return {
      status: "succeeded",
      assets: [
        { data: await mockVideo(), mime: "video/mp4", width: 640, height: 360, duration: 2 },
      ],
    };
  },
};
