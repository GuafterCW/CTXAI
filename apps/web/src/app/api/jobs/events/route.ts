import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { subscribeJobEvents } from "@/lib/jobs/events";
import { ensurePollerRunning } from "@/lib/jobs/poller";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of the user's job updates. */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  ensurePollerRunning();

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: "connected" });
      const unsubscribe = subscribeJobEvents(session.user.id, send);

      // Keep intermediaries from closing an idle connection.
      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": ping\n\n")),
        15_000,
      );

      cleanup = () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
