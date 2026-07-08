import { requireSession } from "@/lib/session";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex min-h-dvh">
      <AppNav userName={session.user.name} userEmail={session.user.email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
