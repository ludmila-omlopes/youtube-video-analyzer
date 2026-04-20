"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  browserFetch,
  browserReadJsonLines,
  BrowserApiError,
} from "@/lib/api-client.browser";
import type {
  AnalyzeResponse,
  ApiErrorBody,
  LongJobResponse,
  ShortAnalysisProgressEvent,
  ShortAnalysisStreamEvent,
} from "@/lib/types";
import { LongJobPoller } from "@/components/long-job-poller";

type AnalysisKind = "metadata" | "short" | "audio" | "long";

type SubmitOutcome = {
  kind: AnalysisKind;
  data: AnalyzeResponse | LongJobResponse;
};

type ShortAnalysisStatus =
  | {
      state: "running" | "completed" | "failed";
      requestId: string | null;
      message: string;
      progress: number | null;
      total: number | null;
      errorMessage?: string;
    }
  | null;

const KIND_ENDPOINTS: Record<AnalysisKind, string> = {
  metadata: "/api/v1/metadata",
  short: "/api/v1/analyze/short",
  audio: "/api/v1/analyze/audio",
  long: "/api/v1/long-jobs",
};

const KIND_COPY: Record<AnalysisKind, { title: string; hint: string }> = {
  metadata: { title: "Metadata", hint: "Basic video info - cheapest." },
  short: { title: "Short analysis", hint: "For clips under about 10 minutes." },
  audio: { title: "Audio analysis", hint: "Transcript and audio-focused insights." },
  long: { title: "Long-form job", hint: "Queued - may take minutes." },
};

const RUNNING_NOTES = [
  "Still working on this step.",
  "This can pause here for a bit while the backend waits on YouTube or Gemini.",
  "The request is still active - this step just takes longer sometimes.",
];

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function getAnimatedProgressPercent(status: ShortAnalysisStatus, elapsedSeconds: number): number {
  if (!status) {
    return 0;
  }

  const total = status.total ?? 5;
  if (total <= 0) {
    return 0;
  }

  if (status.state === "completed") {
    return 100;
  }

  const rawStep = status.progress ?? 0;
  const currentStep = Math.max(1, rawStep);
  const completedSteps = Math.max(0, currentStep - 1);
  const stepSize = 100 / total;
  const stepStart = completedSteps * stepSize;

  if (status.state === "failed") {
    return Math.max(8, Math.min(96, stepStart + stepSize * 0.68));
  }

  const minimumVisibleAdvance = stepSize * 0.28;
  const maxInStepAdvance = stepSize * 0.74;
  const creepProgress = 1 - Math.exp(-elapsedSeconds / 6);
  return Math.max(
    8,
    Math.min(96, stepStart + minimumVisibleAdvance + maxInStepAdvance * creepProgress)
  );
}

async function runShortAnalysisWithProgress(
  body: Record<string, unknown>,
  setShortStatus: (status: ShortAnalysisStatus) => void
): Promise<AnalyzeResponse> {
  let finalPayload: AnalyzeResponse | null = null;
  let streamFailure: BrowserApiError | null = null;

  await browserReadJsonLines<ShortAnalysisStreamEvent>(
    KIND_ENDPOINTS.short,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    async (event) => {
      if (!event || typeof event !== "object" || !("type" in event)) {
        const rawEvent = event as AnalyzeResponse | ApiErrorBody;

        if ("result" in rawEvent && "requestId" in rawEvent) {
          finalPayload = rawEvent;
          return;
        }

        if ("error" in rawEvent) {
          setShortStatus({
            state: "failed",
            requestId: rawEvent.requestId ?? null,
            message: "Short analysis failed.",
            progress: null,
            total: null,
            errorMessage: rawEvent.error.message,
          });
          streamFailure = new BrowserApiError(500, rawEvent, rawEvent.error.message);
          return;
        }
      }

      if (event.type === "progress") {
        const progressEvent = event as ShortAnalysisProgressEvent;
        setShortStatus({
          state: "running",
          requestId: progressEvent.requestId,
          message: progressEvent.message,
          progress: progressEvent.progress,
          total: progressEvent.total,
        });
        return;
      }

      if (event.type === "result") {
        finalPayload = event.payload;
        return;
      }

      setShortStatus({
        state: "failed",
        requestId: event.payload.requestId ?? event.lastProgress?.requestId ?? null,
        message: event.lastProgress?.message ?? "Short analysis failed.",
        progress: event.lastProgress?.progress ?? null,
        total: event.lastProgress?.total ?? null,
        errorMessage: event.payload.error.message,
      });
      streamFailure = new BrowserApiError(event.status, event.payload, event.payload.error.message);
    }
  );

  if (streamFailure) {
    throw streamFailure;
  }

  if (!finalPayload) {
    throw new BrowserApiError(502, null, "Streaming analysis ended without a result.");
  }

  return finalPayload;
}

export function AnalyzeForm() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AnalysisKind>("metadata");
  const [focus, setFocus] = useState("");
  const [syncResult, setSyncResult] = useState<AnalyzeResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [shortStatus, setShortStatus] = useState<ShortAnalysisStatus>(null);
  const [runningSeconds, setRunningSeconds] = useState(0);
  const [stepSeconds, setStepSeconds] = useState(0);

  useEffect(() => {
    if (shortStatus?.state !== "running") {
      setRunningSeconds(0);
      setStepSeconds(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setRunningSeconds((current) => current + 1);
      setStepSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [shortStatus?.state, shortStatus?.requestId]);

  useEffect(() => {
    if (shortStatus?.state !== "running") {
      return;
    }

    setStepSeconds(0);
  }, [shortStatus?.state, shortStatus?.progress, shortStatus?.message]);

  const animatedProgressPercent = useMemo(
    () => getAnimatedProgressPercent(shortStatus, stepSeconds),
    [shortStatus, stepSeconds]
  );

  const runningNote = useMemo(() => {
    if (shortStatus?.state !== "running") {
      return null;
    }

    const noteIndex = Math.min(
      RUNNING_NOTES.length - 1,
      Math.floor(runningSeconds / 6)
    );
    return RUNNING_NOTES[noteIndex];
  }, [shortStatus?.state, runningSeconds]);

  const submit = useMutation({
    mutationFn: async (): Promise<SubmitOutcome> => {
      const selectedKind = kind;
      const youtubeUrl = url.trim();
      const analysisPrompt = focus.trim();
      const body: Record<string, unknown> = { youtubeUrl };

      if (selectedKind !== "metadata" && analysisPrompt) {
        body.analysisPrompt = analysisPrompt;
      }

      setSyncResult(null);
      setJobId(null);

      if (selectedKind === "short") {
        setShortStatus({
          state: "running",
          requestId: null,
          message: "Starting analysis...",
          progress: 0,
          total: 5,
        });

        return {
          kind: selectedKind,
          data: await runShortAnalysisWithProgress(body, setShortStatus),
        };
      }

      setShortStatus(null);

      return {
        kind: selectedKind,
        data: await browserFetch<AnalyzeResponse | LongJobResponse>(KIND_ENDPOINTS[selectedKind], {
          method: "POST",
          body: JSON.stringify(body),
        }),
      };
    },
    onSuccess: async ({ kind: submittedKind, data }) => {
      await qc.invalidateQueries({ queryKey: ["session"] });

      if (submittedKind === "long") {
        const jobResult = (data as LongJobResponse).result;
        setJobId(jobResult.jobId);
        setSyncResult(null);
        return;
      }

      setSyncResult(data as AnalyzeResponse);
      setJobId(null);

      if (submittedKind === "short") {
        setShortStatus((current) => ({
          state: "completed",
          requestId: (data as AnalyzeResponse).requestId ?? current?.requestId ?? null,
          message: "Analysis complete.",
          progress: current?.total ?? 5,
          total: current?.total ?? 5,
        }));
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
          {(Object.keys(KIND_ENDPOINTS) as AnalysisKind[]).map((nextKind) => (
            <button
              key={nextKind}
              type="button"
              onClick={() => setKind(nextKind)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                kind === nextKind
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--border)] hover:bg-[var(--bg)]"
              }`}
            >
              <div className="font-medium">{KIND_COPY[nextKind].title}</div>
              <div className="text-xs text-[var(--muted)]">{KIND_COPY[nextKind].hint}</div>
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

      {shortStatus && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    shortStatus.state === "running"
                      ? "animate-pulse bg-[var(--accent)]"
                      : shortStatus.state === "completed"
                        ? "bg-emerald-300"
                        : "bg-red-300"
                  }`}
                />
                <h2 className="font-semibold">Short analysis status</h2>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">{shortStatus.message}</p>
              {shortStatus.state === "running" && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {runningNote} Elapsed {formatElapsed(runningSeconds)}.
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                shortStatus.state === "failed"
                  ? "bg-red-950/40 text-red-300"
                  : shortStatus.state === "completed"
                    ? "bg-emerald-950/40 text-emerald-300"
                    : "bg-[var(--accent)]/15 text-[var(--accent)]"
              }`}
            >
              {shortStatus.state === "running"
                ? "Running"
                : shortStatus.state === "completed"
                  ? "Completed"
                  : "Failed"}
            </span>
          </div>

          {(shortStatus.progress != null || shortStatus.total != null) && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
              <p>
              Step {shortStatus.progress ?? 0}
              {shortStatus.total != null ? ` of ${shortStatus.total}` : ""}
              </p>
              {shortStatus.state === "running" && (
                <p className="short-status-dots whitespace-nowrap">Working</p>
              )}
            </div>
          )}

          {shortStatus.total != null && shortStatus.total > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
              <div
                className={`short-status-progress relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out ${
                  shortStatus.state === "failed" ? "bg-red-400" : "bg-[var(--accent)]"
                }`}
                style={{
                  width: `${animatedProgressPercent}%`,
                }}
              >
                <span className="short-status-progress-glow absolute inset-0 opacity-70" />
              </div>
            </div>
          )}

          {shortStatus.errorMessage && (
            <p className="mt-3 text-sm text-red-300">{shortStatus.errorMessage}</p>
          )}
        </section>
      )}

      {syncResult && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">Result</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            request <code>{syncResult.requestId}</code> - balance now{" "}
            {syncResult.account.creditBalance.toLocaleString()} credits
          </p>
          <pre className="mt-3 max-h-[60vh] overflow-auto rounded-md bg-black/50 p-3 text-xs">
            {JSON.stringify(syncResult.result, null, 2)}
          </pre>
        </section>
      )}

      {jobId && <LongJobPoller jobId={jobId} />}
    </div>
  );
}
