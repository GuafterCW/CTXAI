import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/** Get the current session in a server component / route, or null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Get the current session or redirect to /login. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
