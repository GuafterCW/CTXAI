"use client";

import { Logo } from "@/components/logo";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  {
    href: "/create",
    label: "Create",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]">
        <path d="M12 3v18M3 12h18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/generations",
    label: "Generations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/montage",
    label: "Montage",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M8 5v14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
      </svg>
    ),
  },
];

export function AppNav({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl max-md:w-16">
      <div className="flex h-16 items-center px-5 max-md:justify-center max-md:px-0">
        <Link href="/create">
          <Logo className="max-md:hidden" />
          <span className="hidden font-display text-lg font-bold md:hidden max-md:block">
            <span className="text-gradient">c</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-3 max-md:px-2">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors max-md:justify-center max-md:px-0",
                active ? "text-ink" : "text-ink-dim hover:text-ink hover:bg-overlay/60",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-lg bg-overlay"
                  transition={{ type: "spring", bounce: 0.18, duration: 0.5 }}
                />
              )}
              <span className={cn("relative z-10", active && "text-accent-bright")}>
                {link.icon}
              </span>
              <span className="relative z-10 max-md:hidden">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="mb-2 px-2 max-md:hidden">
          <p className="truncate text-sm text-ink">{userName}</p>
          <p className="truncate text-xs text-ink-faint">{userEmail}</p>
        </div>
        <button
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-overlay/60 hover:text-ink max-md:justify-center max-md:px-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-[18px]">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="max-md:hidden">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
