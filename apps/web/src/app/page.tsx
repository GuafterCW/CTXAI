import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";

export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/create");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* Ambient gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-64 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-accent), var(--color-accent-blue) 60%, transparent)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-gradient-to-r from-accent to-accent-blue px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/25 transition-all hover:shadow-accent/40 hover:brightness-110"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="mb-5 rounded-full border border-line-bright/60 bg-raised/60 px-4 py-1.5 text-xs text-ink-dim backdrop-blur">
          Open source · Self-hosted · Your own API keys
        </p>
        <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          Your keys.
          <br />
          <span className="text-gradient">Your studio.</span>
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-ink-dim">
          Generate cinematic video with Kling, images with Seedream and
          publish-ready Shorts — powered by your own API keys, connected to
          Claude via MCP. No subscription markup.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-accent to-accent-blue px-7 py-3.5 font-medium text-white shadow-xl shadow-accent/30 transition-all hover:shadow-accent/50 hover:brightness-110"
          >
            Start creating
          </Link>
          <a
            href="https://github.com/GuafterCW/CTXAI"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-line-bright px-7 py-3.5 font-medium text-ink transition-colors hover:border-accent/60 hover:bg-overlay"
          >
            View on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
