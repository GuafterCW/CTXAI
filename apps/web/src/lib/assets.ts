import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import type { ProviderAsset } from "@/lib/providers/types";

export function assetsDir() {
  return process.env.ASSETS_DIR ?? "./data/assets";
}

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/json": "json",
};

/**
 * Persist a provider asset locally (provider URLs expire) and record it.
 * Returns the created asset row.
 */
export async function saveAsset(
  userId: string,
  jobId: string,
  asset: ProviderAsset,
) {
  let data: Buffer;
  let mime = asset.mime;

  if (asset.data) {
    data = asset.data;
  } else if (asset.url) {
    const res = await fetch(asset.url);
    if (!res.ok) {
      throw new Error(`Asset download failed (${res.status}) from provider`);
    }
    const contentType = res.headers.get("content-type");
    if (contentType && contentType !== "application/octet-stream") {
      mime = contentType.split(";")[0];
    }
    data = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error("Provider asset has neither url nor data");
  }

  const id = nanoid();
  const ext = EXT[mime] ?? "bin";
  const relPath = path.join(userId, `${id}.${ext}`);
  const absPath = path.join(assetsDir(), relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, data);

  const [row] = await db
    .insert(assets)
    .values({
      id,
      jobId,
      userId,
      filePath: relPath,
      mime,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      sizeBytes: data.byteLength,
    })
    .returning();
  return row;
}

export function assetAbsolutePath(relPath: string) {
  return path.join(assetsDir(), relPath);
}
