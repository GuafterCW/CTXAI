import { ProviderError } from "./types";

/** JSON fetch that maps HTTP failures to user-safe ProviderErrors. */
export async function fetchJson<T>(
  url: string,
  init: RequestInit & { providerName: string },
): Promise<T> {
  const { providerName, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, rest);
  } catch {
    throw new ProviderError(`${providerName}: network error reaching API`, true);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body; fall through with raw text
  }

  if (!res.ok) {
    const detail =
      (body as { message?: string; error?: { message?: string } } | null)
        ?.message ??
      (body as { error?: { message?: string } } | null)?.error?.message ??
      text.slice(0, 200);
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(
        `${providerName}: authentication failed — check your API key (${detail})`,
      );
    }
    if (res.status === 429) {
      throw new ProviderError(`${providerName}: rate limited (${detail})`, true);
    }
    throw new ProviderError(
      `${providerName}: API error ${res.status} (${detail})`,
      res.status >= 500,
    );
  }

  return body as T;
}
