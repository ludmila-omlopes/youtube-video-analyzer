import assert from "node:assert/strict";

import {
  createWorkflowRunStoreFromEnv,
  InMemoryWorkflowRunStore,
} from "../platform-runtime/index.js";

export async function run(): Promise<void> {
  const store = new InMemoryWorkflowRunStore();

  const first = await store.appendRun({
    accountId: "account-1",
    workflowId: "monetization-scan",
    workflowLabel: "Monetization Scan",
    status: "completed",
    youtubeUrl: "https://www.youtube.com/watch?v=one",
    normalizedYoutubeUrl: "https://www.youtube.com/watch?v=one",
    videoTitle: "Video one",
    summary: "First summary",
    input: { youtubeUrl: "https://www.youtube.com/watch?v=one" },
    output: { ok: true },
    error: null,
  });

  const second = await store.appendRun({
    accountId: "account-1",
    workflowId: "monetization-scan",
    workflowLabel: "Monetization Scan",
    status: "failed",
    youtubeUrl: "https://www.youtube.com/watch?v=two",
    normalizedYoutubeUrl: null,
    videoTitle: null,
    summary: null,
    input: { youtubeUrl: "https://www.youtube.com/watch?v=two" },
    output: null,
    error: { message: "Workflow failed.", code: "FAILED" },
  });

  assert.ok(first.runId.length > 0);
  assert.ok(second.runId.length > 0);

  const runs = await store.listRunsForAccount("account-1", 10);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].youtubeUrl, "https://www.youtube.com/watch?v=two");
  assert.equal(runs[1].youtubeUrl, "https://www.youtube.com/watch?v=one");

  assert.throws(
    () => createWorkflowRunStoreFromEnv({ CLOUD_DURABILITY_MODE: "require_redis" }),
    /requires Redis configuration for workflow_run_store/
  );
}
