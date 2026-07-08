"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeysSection({ initialKeys }: { initialKeys: KeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const body = await res.json();
        setFreshKey(body.key);
        setName("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-card p-5">
      <h3 className="font-display font-medium">API keys</h3>
      <p className="mt-1 text-sm text-ink-dim">
        Authenticate MCP clients (Claude Code, Claude Desktop) and the REST
        API. Keys are hashed — the full key is shown only once.
      </p>

      <AnimatePresence>
        {freshKey && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-lg border border-success/40 bg-success/5 p-4"
          >
            <p className="text-xs font-medium text-success">
              Key created — copy it now, it will not be shown again:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-void px-3 py-2 font-mono text-xs text-ink">
                {freshKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(freshKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-dim">
              Connect Claude Code:
            </p>
            <code className="mt-1 block overflow-x-auto rounded-md bg-void px-3 py-2 font-mono text-[11px] text-ink-dim">
              claude mcp add --transport http ctxai{" "}
              {typeof window !== "undefined" ? window.location.origin : ""}/api/mcp
              --header &quot;Authorization: Bearer {freshKey}&quot;
            </code>
          </motion.div>
        )}
      </AnimatePresence>

      {initialKeys.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {initialKeys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{key.name}</p>
                <p className="font-mono text-xs text-ink-faint">
                  {key.keyPrefix}…{" "}
                  {key.lastUsedAt
                    ? `· last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                    : "· never used"}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await fetch(`/api/keys/${key.id}`, { method: "DELETE" });
                  router.refresh();
                }}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={createKey} className="mt-4 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. claude-code"
          className="h-9 flex-1"
        />
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create key"}
        </Button>
      </form>
    </div>
  );
}
