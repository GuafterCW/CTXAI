import { isDemoMode } from "@/lib/demo";

/** Slim notice shown on public demo instances (server component). */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="border-b border-line bg-surface px-4 py-1.5 text-center text-xs text-ink-dim">
      Public demo — generations use the built-in demo provider, accounts and
      data are wiped daily.{" "}
      <a
        href="https://github.com/GuafterCW/CTXAI"
        className="text-accent-bright underline underline-offset-2"
      >
        Self-host for the real thing
      </a>
    </div>
  );
}
