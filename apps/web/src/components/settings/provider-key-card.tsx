"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Field {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  keyUrl: string;
  credentialFields: Field[];
  configFields: Field[];
  configured: boolean;
  config: Record<string, string>;
}

type Feedback = { kind: "success" | "error"; text: string } | null;

export function ProviderKeyCard({ provider }: { provider: ProviderInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function call(
    action: "save" | "test" | "delete",
    init: RequestInit,
    successText: string,
  ) {
    setBusy(action);
    setFeedback(null);
    try {
      const res = await fetch(`/api/credentials/${provider.id}`, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ kind: "error", text: body.error ?? "Request failed" });
        return false;
      }
      setFeedback({ kind: "success", text: successText });
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const secrets: Record<string, string> = {};
    const config: Record<string, string> = {};
    for (const f of provider.credentialFields) {
      secrets[f.key] = String(form.get(`secret:${f.key}`) ?? "");
    }
    for (const f of provider.configFields) {
      const v = String(form.get(`config:${f.key}`) ?? "").trim();
      if (v) config[f.key] = v;
    }
    const ok = await call(
      "save",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secrets, config }),
      },
      "Key verified and saved",
    );
    if (ok) setOpen(false);
  }

  return (
    <div className="glass rounded-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="font-display font-medium">{provider.name}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                provider.configured
                  ? "bg-success/10 text-success"
                  : "bg-overlay text-ink-faint",
              )}
            >
              {provider.configured ? "Connected" : "Not configured"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-dim">{provider.description}</p>
          {provider.keyUrl && (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-accent-bright hover:underline"
            >
              Get an API key ↗
            </a>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {provider.configured && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                call("test", { method: "POST" }, "Connection OK")
              }
            >
              {busy === "test" ? "Testing…" : "Test"}
            </Button>
          )}
          <Button
            variant={provider.configured ? "ghost" : "primary"}
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            {provider.configured ? "Edit" : "Add key"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            key="form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.21, 0.7, 0.25, 1] }}
            className="overflow-hidden"
            onSubmit={onSave}
          >
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              {provider.credentialFields.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`${provider.id}-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`${provider.id}-${f.key}`}
                    name={`secret:${f.key}`}
                    type="password"
                    autoComplete="off"
                    placeholder={
                      provider.configured
                        ? "•••••••• (leave empty to keep current)"
                        : f.placeholder
                    }
                  />
                  {f.hint && (
                    <p className="mt-1 text-xs text-ink-faint">{f.hint}</p>
                  )}
                </div>
              ))}
              {provider.configFields.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`${provider.id}-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`${provider.id}-${f.key}`}
                    name={`config:${f.key}`}
                    defaultValue={provider.config[f.key] ?? ""}
                    placeholder={f.placeholder}
                  />
                  {f.hint && (
                    <p className="mt-1 text-xs text-ink-faint">{f.hint}</p>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" size="sm" disabled={busy !== null}>
                  {busy === "save" ? "Verifying…" : "Verify & save"}
                </Button>
                {provider.configured && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={busy !== null}
                    onClick={async () => {
                      const ok = await call(
                        "delete",
                        { method: "DELETE" },
                        "Key removed",
                      );
                      if (ok) setOpen(false);
                    }}
                  >
                    {busy === "delete" ? "Removing…" : "Remove key"}
                  </Button>
                )}
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {feedback && (
          <motion.p
            key={feedback.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "mt-3 text-sm",
              feedback.kind === "success" ? "text-success" : "text-danger",
            )}
          >
            {feedback.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
