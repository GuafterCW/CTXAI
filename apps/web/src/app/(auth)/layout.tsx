import { Logo } from "@/components/logo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[44rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-accent), var(--color-accent-blue) 60%, transparent)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Logo className="text-xl" />
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}
