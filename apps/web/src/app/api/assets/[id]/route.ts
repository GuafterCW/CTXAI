import { NextResponse, type NextRequest } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { handling, requireApiUser } from "@/lib/api";
import { assetAbsolutePath } from "@/lib/assets";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handling(async () => {
    const user = await requireApiUser();
    const { id } = await params;

    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, id),
    });
    if (!asset || asset.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const absPath = assetAbsolutePath(asset.filePath);
    if (!existsSync(absPath)) {
      return NextResponse.json({ error: "File missing" }, { status: 410 });
    }

    const size = statSync(absPath).size;
    const download = new URL(req.url).searchParams.has("download");
    const filename = asset.filePath.split("/").pop() ?? "asset";

    return new NextResponse(
      Readable.toWeb(createReadStream(absPath)) as ReadableStream,
      {
        headers: {
          "Content-Type": asset.mime,
          "Content-Length": String(size),
          "Cache-Control": "private, max-age=31536000, immutable",
          ...(download
            ? { "Content-Disposition": `attachment; filename="${filename}"` }
            : {}),
        },
      },
    );
  });
}
