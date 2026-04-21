"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { browserFetch, BrowserApiError } from "@/lib/api-client.browser";
import { StructuredResultView } from "@/components/structured-result-view";
import type { AnalyzeResponse, LongJobResponse } from "@/lib/types";
import { LongJobPoller } from "@/components/long-job-poller";

type AnalysisKind = "metadata" | "short" | "audio" | "long";

const KIND_ENDPOINTS: Record<AnalysisKind, string> = {
  metadata: "/api/v1/metadata",
  short: "/api/v1/analyze/short",
  audio: "/api/v1/analyze/audio",
  long: "/api/v1/long-jobs",
};

const KIND_COPY: Record<AnalysisKind, { title: string; hint: string }> = {
  metadata: { title: "Metadata", hint: "Basic video info - cheapest." },
  short: { title: "Short analysis", hint: "For clips under ~10 minutes." },
  audio: { title: "Audio analysis", hint: "Transcript + audio-focused insights." },
  long: { title: "Long-form job", hint: "Queued - may take minutes." },
};

export function AnalyzeForm() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AnalysisKind>("metadata");
  const [focus, setFocus] = useState("");
  const [syncResult, setSyncResult] = useState<AnalyzeResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const youtubeUrl = url.trim();
      const analysisPrompt = focus.trim();
      const body: Record<string, unknown> = { youtubeUrl };
      if (kind !== "metadata" && analysisPrompt) {
        body.analysisPrompt = analysisPrompt;
      }
      return browserFetch<AnalyzeResponse | LongJobResponse>(KIND_ENDPOINTS[kind], {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["session"] });
      if (kind === "long") {
        const jobResult = (data as LongJobResponse).result;
        setJobId(jobResult.jobId);
        setSyncResult(null);
      } else {
        setSyncResult(data as AnalyzeResponse);
        setJobId(null);
      }
    },
  });

  const err = submit.error as BrowserApiError | undefined;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="text-sm text-[var(--muted)]">YouTube URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-[var(--accent)]"
        />

        <label className="mt-4 block text-sm text-[var(--muted)]">Analysis type</label>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {(Object.keys(KIND_ENDPOINTS) as AnalysisKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                kind === k
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:bg-[var(--bg)]"
              }`}
            >
              <div className="font-medium">{KIND_COPY[k].title}</div>
              <div className="text-xs text-[var(--muted)]">{KIND_COPY[k].hint}</div>
            </button>
          ))}
        </div>

        {kind !== "metadata" && (
          <>
            <label className="mt-4 block text-sm text-[var(--muted)]">Focus (optional)</label>
            <input
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. 'monetization risks' or 'key quotes'"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </>
        )}

        <button
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !url}
          className="mt-5 rounded-md bg-[var(--accent)] px-5 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {submit.isPending ? "Submitting..." : `Run ${KIND_COPY[kind].title.toLowerCase()}`}
        </button>

        {err && (
          <div className="mt-4 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
            <div className="font-medium">
              {err.status === 402 ? "Not enough credits" : `Error ${err.status}`}
            </div>
            <div className="text-xs opacity-80">{err.message}</div>
            {err.body?.error?.code && (
              <div className="mt-1 text-xs opacity-60">code: {err.body.error.code}</div>
            )}
          </div>
        )}
      </section>

      {syncResult && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">Result</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            request <code>{syncResult.requestId}</code> - balance now{" "}
            {syncResult.account.creditBalance.toLocaleString()} credits
          </p>
          <div className="mt-4">
            <StructuredResultView value={syncResult.result} />
          </div>
        </section>
      )}

      {jobId && <LongJobPoller jobId={jobId} />}
    </div>
  );
}
