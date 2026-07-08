import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/** Prefer system ffmpeg/ffprobe, fall back to the bundled static binaries. */
function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const envPath = process.env[name.toUpperCase() + "_PATH"];
  if (envPath && existsSync(envPath)) return envPath;

  try {
    if (name === "ffmpeg") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const staticPath = require("ffmpeg-static") as string | null;
      if (staticPath && existsSync(staticPath)) return staticPath;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { path: probePath } = require("ffprobe-static") as { path: string };
      if (probePath && existsSync(probePath)) return probePath;
    }
  } catch {
    // static package unavailable; hope for a system binary
  }
  return name;
}

export const ffmpegPath = () => resolveBinary("ffmpeg");
export const ffprobePath = () => resolveBinary("ffprobe");

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run ffmpeg/ffprobe with the given args.
 * `onStderrLine` receives raw stderr lines (ffmpeg reports progress there).
 */
export function run(
  bin: string,
  args: string[],
  onStderrLine?: (line: string) => void,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      if (onStderrLine) {
        for (const line of text.split(/\r|\n/)) {
          if (line.trim()) onStderrLine(line);
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(`${bin} exited with code ${code}: ${stderr.slice(-800)}`),
        );
    });
  });
}
