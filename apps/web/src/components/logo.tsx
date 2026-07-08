import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-lg font-bold tracking-tight text-ink",
        className,
      )}
    >
      ctx<span className="text-gradient">ai</span>
    </span>
  );
}
