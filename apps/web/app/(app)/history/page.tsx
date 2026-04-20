import { serverFetch } from "@/lib/api-client";
import type { RunRecord } from "@/lib/types";

type RunsResponse = { runs: RunRecord[] };

export default async function HistoryPage() {
  const data = await serverFetch<RunsResponse>("/api/web/runs").catch(() => ({ runs: [] }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">History</h1>
        <p className="mt-1 text-[var(--muted)]">Recent analysis runs on your account.</p>
      </header>

      {data.runs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          {data.runs.map((r) => (
            <li key={r.runId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{r.kind}</div>
                <div className="text-xs text-[var(--muted)]">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.inputUrl && ` · ${r.inputUrl}`}
                </div>
                {r.summary && (
                  <div className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{r.summary}</div>
                )}
              </div>
              <span className="text-xs text-[var(--muted)]">{r.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
