"use client";

import { useQuery } from "@tanstack/react-query";
import { browserFetch } from "@/lib/api-client.browser";
import type { LongJobResponse } from "@/lib/types";

export function LongJobPoller({ jobId }: { jobId: string }) {
  const { data, error } = useQuery({
    queryKey: ["long-job", jobId],
    queryFn: () => browserFetch<LongJobResponse>(`/api/v1/long-jobs/${jobId}`),
    refetchInterval: (q) => {
      const status = q.state.data?.result.status;
      if (status === "completed" || status === "failed" || status === "cancelled") return false;
      return 2_500;
    },
  });

  if (error) {
    return (
      <section className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
        Failed to poll job: {(error as Error).message}
      </section>
    );
  }

  const job = data?.result;
  const status = job?.status ?? "queued";

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Long job</h2>
        <span className={`text-xs font-medium ${statusColor(status)}`}>{status.toUpperCase()}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        job <code>{jobId}</code>
        {typeof job?.progress === "number" && ` · progress ${Math.round(job.progress * 100)}%`}
      </p>

      {status === "completed" && job?.output != null && (
        <pre className="mt-3 max-h-[60vh] overflow-auto rounded-md bg-black/50 p-3 text-xs">
          {JSON.stringify(job.output, null, 2)}
        </pre>
      )}

      {status === "failed" && job?.error && (
        <div className="mt-3 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          <div className="font-medium">{job.error.code}</div>
          <div className="text-xs opacity-80">{job.error.message}</div>
        </div>
      )}

      {(status === "queued" || status === "running") && (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--bg)]">
          <div
            className="h-full bg-[var(--accent)] transition-all"
            style={{ width: `${Math.max(5, Math.round((job?.progress ?? 0) * 100))}%` }}
          />
        </div>
      )}
    </section>
  );
}

function statusColor(s: string) {
  switch (s) {
    case "completed":
      return "text-emerald-400";
    case "failed":
    case "cancelled":
      return "text-red-400";
    case "running":
      return "text-sky-400";
    default:
      return "text-[var(--muted)]";
  }
}
