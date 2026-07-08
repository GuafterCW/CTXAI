import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for job updates, feeding the SSE endpoint.
 * Survives dev-mode HMR via a globalThis stash.
 */

export interface JobEvent {
  jobId: string;
  status: string;
  progress: number | null;
  error: string | null;
  kind: string;
}

const KEY = Symbol.for("ctxai.jobEvents");

type Store = { emitter: EventEmitter };
const store = ((globalThis as Record<symbol, unknown>)[KEY] ??= {
  emitter: new EventEmitter().setMaxListeners(0),
} satisfies Store) as Store;

export function emitJobEvent(userId: string, event: JobEvent) {
  store.emitter.emit(`user:${userId}`, event);
}

export function subscribeJobEvents(
  userId: string,
  listener: (event: JobEvent) => void,
): () => void {
  const channel = `user:${userId}`;
  store.emitter.on(channel, listener);
  return () => store.emitter.off(channel, listener);
}
