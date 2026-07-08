"use client";

import { Input } from "@/components/ui/input";
import type { JsonSchemaProperty, ModelDto } from "@/lib/client-types";
import { cn } from "@/lib/utils";

/** Fields rendered elsewhere (prompt bar / dedicated uploader). */
const HIDDEN_KEYS = new Set(["prompt", "text", "image"]);

export function defaultParams(model: ModelDto): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(model.paramsSchema.properties ?? {})) {
    if (prop.default !== undefined) params[key] = prop.default;
  }
  return params;
}

function FieldControl({
  name,
  prop,
  value,
  onChange,
}: {
  name: string;
  prop: JsonSchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (prop.enum) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {prop.enum.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
              value === option
                ? "border-accent/70 bg-accent/15 text-accent-bright"
                : "border-line text-ink-dim hover:border-line-bright hover:text-ink",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (prop.type === "boolean") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(value)}
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 cursor-pointer rounded-full transition-colors",
          value ? "bg-accent" : "bg-line-bright",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
            value ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    );
  }

  if (prop.type === "number" && prop.minimum != null && prop.maximum != null) {
    const current = typeof value === "number" ? value : (prop.default as number) ?? prop.minimum;
    return (
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={prop.minimum}
          max={prop.maximum}
          step={(prop.maximum - prop.minimum) / 20}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-line-bright accent-[var(--color-accent)]"
        />
        <span className="w-10 text-right text-xs tabular-nums text-ink-dim">
          {Number(current).toFixed(2)}
        </span>
      </div>
    );
  }

  if (prop.type === "number" || prop.type === "integer") {
    return (
      <Input
        type="number"
        value={value == null ? "" : String(value)}
        min={prop.minimum}
        max={prop.maximum}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
        className="h-9"
        placeholder="auto"
      />
    );
  }

  return (
    <Input
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9"
      placeholder={name}
    />
  );
}

export function ParamsPanel({
  model,
  params,
  onChange,
}: {
  model: ModelDto;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(model.paramsSchema.properties ?? {}).filter(
    ([key]) => !HIDDEN_KEYS.has(key),
  );
  if (entries.length === 0) {
    return <p className="text-sm text-ink-faint">This model has no extra parameters.</p>;
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, prop]) => (
        <div key={key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-xs font-medium text-ink">
              {key.replaceAll("_", " ")}
            </label>
            {prop.description && (
              <span className="truncate text-[11px] text-ink-faint" title={prop.description}>
                {prop.description}
              </span>
            )}
          </div>
          <FieldControl
            name={key}
            prop={prop}
            value={params[key]}
            onChange={(value) => onChange({ ...params, [key]: value })}
          />
        </div>
      ))}
    </div>
  );
}
