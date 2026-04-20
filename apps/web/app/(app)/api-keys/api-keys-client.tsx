"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { browserFetch } from "@/lib/api-client.browser";
import type { ApiKeyRecord } from "@/lib/types";

type ListResponse = { apiKeys: ApiKeyRecord[] };
type CreateResponse = { keyId: string; plaintext: string; label: string | null; createdAt: string };

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKeyRecord[] }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [revealed, setRevealed] = useState<CreateResponse | null>(null);

  const list = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => browserFetch<ListResponse>("/api/web/api-keys"),
    initialData: { apiKeys: initialKeys },
  });

  const createKey = useMutation({
    mutationFn: (payload: { label: string }) =>
      browserFetch<CreateResponse>("/api/web/api-keys", {
        method: "POST",
        body: JSON.stringify({ label: payload.label || undefined }),
      }),
    onSuccess: (data) => {
      setRevealed(data);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) =>
      browserFetch<{ revoked: boolean }>("/api/web/api-keys", {
        method: "DELETE",
        query: { keyId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const keys = list.data?.apiKeys ?? [];
  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="font-semibold">Create a new key</h2>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="Label (e.g. production, local-dev)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => createKey.mutate({ label })}
            disabled={createKey.isPending}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {createKey.isPending ? "Creating…" : "Create key"}
          </button>
        </div>
        {createKey.isError && (
          <p className="mt-2 text-sm text-red-400">{(createKey.error as Error).message}</p>
        )}
      </section>

      {revealed && (
        <div className="rounded-lg border border-yellow-600/50 bg-yellow-950/30 p-5">
          <h3 className="font-semibold text-yellow-300">Copy this key now</h3>
          <p className="mt-1 text-sm text-yellow-200/80">
            This is the only time the full key will be shown. Store it somewhere safe.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-black/50 p-3 text-xs">
            {revealed.plaintext}
          </pre>
          <button
            onClick={() => {
              navigator.clipboard.writeText(revealed.plaintext);
            }}
            className="mt-3 rounded-md border border-yellow-600/50 px-3 py-1 text-xs hover:bg-yellow-950/50"
          >
            Copy
          </button>
          <button
            onClick={() => setRevealed(null)}
            className="ml-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--bg)]"
          >
            Dismiss
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-semibold">
          Active keys <span className="text-[var(--muted)]">({activeKeys.length})</span>
        </h2>
        {activeKeys.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No active keys yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {activeKeys.map((k) => (
              <li key={k.keyId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{k.label || "(unlabeled)"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    <code>{k.keyId}</code> · created {new Date(k.createdAt).toLocaleString()}
                    {k.lastUsedAt && ` · last used ${new Date(k.lastUsedAt).toLocaleString()}`}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Revoke key "${k.label || k.keyId}"? This cannot be undone.`)) {
                      revokeKey.mutate(k.keyId);
                    }
                  }}
                  disabled={revokeKey.isPending}
                  className="rounded-md border border-red-900/60 px-3 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-60"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
