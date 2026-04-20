import type { ReactNode } from "react";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value: string | number | boolean | null): string {
  if (value === null) {
    return "None";
  }

  return String(value);
}

function getItemLabel(item: Record<string, unknown>, index: number): string {
  const timestamp = typeof item.timestamp === "string" && item.timestamp.trim() ? item.timestamp.trim() : null;
  const label =
    ["title", "angle", "cta", "productOrOffer", "sponsorType", "transcript", "summary"]
      .map((key) => item[key])
      .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

  if (timestamp && label) {
    return `${timestamp} - ${label}`;
  }

  if (label) {
    return label;
  }

  if (timestamp) {
    return timestamp;
  }

  return `Item ${index + 1}`;
}

function renderValue(value: unknown, depth = 0): ReactNode {
  if (value === null || value === undefined) {
    return <p className="text-sm text-[var(--muted)]">None.</p>;
  }

  if (typeof value === "string") {
    return <p className="analysis-copy whitespace-pre-wrap text-sm leading-7 text-[var(--fg)]">{value}</p>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <p className="text-sm text-[var(--fg)]">{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-[var(--muted)]">None.</p>;
    }

    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return (
        <ul className="analysis-list space-y-2 text-sm leading-7 text-[var(--fg)]">
          {value.map((item, index) => (
            <li key={`${index}-${String(item)}`}>{formatScalar(item as string | number | boolean | null)}</li>
          ))}
        </ul>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/55 p-4"
          >
            <h4 className="text-sm font-semibold text-[var(--fg)]">
              {isRecord(item) ? getItemLabel(item, index) : `Item ${index + 1}`}
            </h4>
            <div className="mt-3">{renderValue(item, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return <p className="text-sm text-[var(--muted)]">None.</p>;
    }

    return (
      <div className={depth === 0 ? "space-y-5" : "space-y-4"}>
        {entries.map(([key, nestedValue]) => {
          const label = humanizeKey(key);
          const isScalarEntry =
            nestedValue === null ||
            ["string", "number", "boolean"].includes(typeof nestedValue);

          if (isScalarEntry) {
            return (
              <div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/35 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                  {label}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--fg)]">
                  {formatScalar(nestedValue as string | number | boolean | null)}
                </p>
              </div>
            );
          }

          return (
            <section
              key={key}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/35 p-4"
            >
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                {label}
              </h3>
              <div className="mt-3">{renderValue(nestedValue, depth + 1)}</div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <pre className="overflow-auto rounded-md bg-black/50 p-3 text-xs text-[var(--fg)]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function StructuredResultView({
  value,
  emptyLabel = "Nothing to show yet.",
}: {
  value: unknown;
  emptyLabel?: string;
}) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  return <div className="space-y-4">{renderValue(value)}</div>;
}
