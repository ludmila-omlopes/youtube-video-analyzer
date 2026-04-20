import assert from "node:assert/strict";

import {
  getRemoteAccountEntitlements,
  getRemoteAccountInitialCredits,
  InMemoryApiKeyStore,
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
  type OAuthConfig,
} from "../auth-billing/index.js";
import {
  createApiKeysCreateHandler,
  createApiKeysListHandler,
  createApiKeysRevokeHandler,
  createMonetizationScanHandler,
  createWebSessionHandler,
} from "../http/web-app.js";
import { getPrincipalKey } from "../lib/auth/principal.js";
import { InMemoryWorkflowRunStore } from "../platform-runtime/index.js";
import type {
  AudioToolInput,
  AudioToolOutput,
  FollowUpToolInput,
  FollowUpToolOutput,
  LongToolInput,
  LongToolOutput,
  MetadataToolInput,
  MetadataToolOutput,
  ShortToolInput,
  ShortToolOutput,
  VideoAnalysisServiceLike,
} from "@ludylops/video-analysis-core";

const principal: AuthPrincipal = {
  subject: "user-1",
  issuer: "local://web-tests",
  audience: "youtube-video-analyzer-web",
  scope: ["web:local"],
  tokenId: null,
  rawClaims: {},
};

const localConfig: OAuthConfig = {
  enabled: false,
  issuer: null,
  audience: null,
  jwksUrl: null,
  requiredScope: null,
  resourceName: "youtube-video-analyzer",
  clockToleranceSeconds: 5,
};

const BROWSER_OAUTH_ENV_KEYS = [
  "OAUTH_WEB_CLIENT_ID",
  "OAUTH_WEB_AUTHORIZATION_URL",
  "OAUTH_WEB_TOKEN_URL",
  "OAUTH_WEB_REDIRECT_PATH",
  "OAUTH_WEB_SCOPES",
  "OAUTH_WEB_AUDIENCE",
  "OAUTH_WEB_RESOURCE",
] as const;

async function withEnvCleared(
  keys: readonly string[],
  runWithEnv: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      delete process.env[key];
    }
    await runWithEnv();
  } finally {
    for (const key of keys) {
      const next = previous[key];
      if (next === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = next;
      }
    }
  }
}

class FakeWebWorkflowService implements VideoAnalysisServiceLike {
  async analyzeShort(input: ShortToolInput): Promise<ShortToolOutput> {
    return {
      model: "gemini-test",
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      clip: {
        startOffsetSeconds: input.startOffsetSeconds ?? null,
        endOffsetSeconds: input.endOffsetSeconds ?? null,
      },
      usedCustomSchema: true,
      analysis: {
        detectedLanguage: "en",
        executiveSummary: "Clear room for affiliate and sponsor revenue.",
        monetizationReadiness: "high",
        revenueAngles: [{ angle: "Template pack", whyItFits: "Strong intent", audienceSignal: "People want to act." }],
        affiliateOpportunities: [],
        sponsorSegments: [],
        ctaMoments: [],
        repurposingHooks: [],
        risks: ["Needs a clearer mid-roll CTA."],
        nextActions: ["Test one affiliate CTA."],
      },
    };
  }

  async analyzeAudio(_input: AudioToolInput): Promise<AudioToolOutput> {
    throw new Error("Not implemented in this test.");
  }

  async analyzeLong(_input: LongToolInput): Promise<LongToolOutput> {
    throw new Error("Not implemented in this test.");
  }

  async continueLong(_input: FollowUpToolInput): Promise<FollowUpToolOutput> {
    throw new Error("Not implemented in this test.");
  }

  async getYouTubeMetadata(input: MetadataToolInput): Promise<MetadataToolOutput> {
    return {
      youtubeUrl: input.youtubeUrl,
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=test",
      videoId: "test",
      title: "Revenue test video",
      description: null,
      channelId: "channel-1",
      channelTitle: "Test channel",
      publishedAt: null,
      durationIso8601: "PT10M",
      durationSeconds: 600,
      definition: null,
      caption: null,
      licensedContent: null,
      projection: null,
      dimension: null,
      privacyStatus: null,
      embeddable: null,
      liveBroadcastContent: null,
      liveStreamingDetails: null,
      thumbnails: {},
      tags: [],
      categoryId: null,
      defaultLanguage: null,
      defaultAudioLanguage: null,
      statistics: {
        viewCount: null,
        likeCount: null,
        favoriteCount: null,
        commentCount: null,
      },
    };
  }
}

export async function run(): Promise<void> {
  await withEnvCleared(BROWSER_OAUTH_ENV_KEYS, async () => {
    const remoteAccessStore = new InMemoryRemoteAccessStore();
    const usageEventStore = new InMemoryUsageEventStore();
    const workflowRunStore = new InMemoryWorkflowRunStore();
    const apiKeyStore = new InMemoryApiKeyStore();
    const auth = async () => ({
      ok: true as const,
      principal,
      authMode: "local" as const,
      config: localConfig,
    });

    const accountId = getPrincipalKey(principal);
    const trialEntitlements = getRemoteAccountEntitlements("trial");
    const expiredRunCreatedAt = new Date(
      Date.now() - (((trialEntitlements.historyRetentionDays ?? 0) + 2) * 24 * 60 * 60 * 1000)
    ).toISOString();

    await workflowRunStore.appendRun({
      accountId,
      workflowId: "monetization-scan",
      workflowLabel: "Monetization Scan",
      status: "completed",
      createdAt: expiredRunCreatedAt,
      youtubeUrl: "https://www.youtube.com/watch?v=expired",
      normalizedYoutubeUrl: "https://www.youtube.com/watch?v=expired",
      videoTitle: "Expired history",
      summary: "Should be hidden by retention.",
      input: { youtubeUrl: "https://www.youtube.com/watch?v=expired" },
      output: { summary: "expired" },
      error: null,
    });

    const sessionHandler = createWebSessionHandler({
      remoteAccessStore,
      usageEventStore,
      workflowRunStore,
      apiKeyStore,
      authenticateRequest: auth,
    });
    const sessionResponse = await sessionHandler(new Request("https://example.com/api/web/session"));
    const sessionPayload = (await sessionResponse.json()) as {
      auth: { mode: string; browserSignin: { enabled: boolean } };
      account: {
        accountId: string;
        plan: string;
        creditBalance: number;
        entitlements: {
          apiKeysEnabled: boolean;
          historyRetentionDays: number | null;
          monthlyIncludedCredits: number | null;
        };
      };
      onboarding: { state: string };
      recentRuns: Array<unknown>;
      apiKeys: Array<unknown>;
      endpoints: { apiKeys: string };
    };

    assert.equal(sessionResponse.status, 200);
    assert.equal(sessionPayload.auth.mode, "local");
    assert.equal(sessionPayload.auth.browserSignin.enabled, false);
    assert.equal(sessionPayload.account.accountId, accountId);
    assert.equal(sessionPayload.account.plan, "trial");
    assert.equal(sessionPayload.account.creditBalance, getRemoteAccountInitialCredits(process.env, "trial"));
    assert.equal(sessionPayload.account.entitlements.apiKeysEnabled, true);
    assert.equal(sessionPayload.account.entitlements.historyRetentionDays, trialEntitlements.historyRetentionDays);
    assert.equal(sessionPayload.account.entitlements.monthlyIncludedCredits, trialEntitlements.monthlyIncludedCredits);
    assert.equal(sessionPayload.onboarding.state, "first-run");
    assert.equal(sessionPayload.recentRuns.length, 0);
    assert.equal(sessionPayload.apiKeys.length, 0);
    assert.equal(sessionPayload.endpoints.apiKeys, "enabled");

    const createApiKeyHandler = createApiKeysCreateHandler({
      remoteAccessStore,
      apiKeyStore,
      authenticateRequest: auth,
    });
    const listApiKeysHandler = createApiKeysListHandler({
      remoteAccessStore,
      apiKeyStore,
      authenticateRequest: auth,
    });
    const revokeApiKeyHandler = createApiKeysRevokeHandler({
      remoteAccessStore,
      apiKeyStore,
      authenticateRequest: auth,
    });

    const createdApiKeyResponse = await createApiKeyHandler(
      new Request("https://example.com/api/web/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "Studio workflow" }),
      })
    );
    const createdApiKeyPayload = (await createdApiKeyResponse.json()) as {
      plaintextKey: string;
      record: { keyId: string; label: string };
    };
    assert.equal(createdApiKeyResponse.status, 201);
    assert.match(createdApiKeyPayload.plaintextKey, /^ya_live_/);
    assert.equal(createdApiKeyPayload.record.label, "Studio workflow");

    const listedApiKeysResponse = await listApiKeysHandler(new Request("https://example.com/api/web/api-keys"));
    const listedApiKeysPayload = (await listedApiKeysResponse.json()) as {
      apiKeys: Array<{ keyId: string; label: string }>;
    };
    assert.equal(listedApiKeysPayload.apiKeys.length, 1);
    assert.equal(listedApiKeysPayload.apiKeys[0].keyId, createdApiKeyPayload.record.keyId);

    const revokedApiKeyResponse = await revokeApiKeyHandler(
      new Request(`https://example.com/api/web/api-keys?keyId=${createdApiKeyPayload.record.keyId}`, {
        method: "DELETE",
      })
    );
    const revokedApiKeyPayload = (await revokedApiKeyResponse.json()) as { revoked: boolean };
    assert.equal(revokedApiKeyPayload.revoked, true);

    const scanHandler = createMonetizationScanHandler({
      remoteAccessStore,
      usageEventStore,
      workflowRunStore,
      apiKeyStore,
      service: new FakeWebWorkflowService(),
      authenticateRequest: auth,
    });
    const scanResponse = await scanHandler(
      new Request("https://example.com/api/web/monetization-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: "https://www.youtube.com/watch?v=test",
          focus: "affiliate tools",
        }),
      })
    );
    const scanPayload = (await scanResponse.json()) as {
      run: { workflowId: string; summary: string | null; videoTitle: string | null };
    };

    assert.equal(scanResponse.status, 200);
    assert.equal(scanPayload.run.workflowId, "monetization-scan");
    assert.equal(scanPayload.run.videoTitle, "Revenue test video");
    assert.match(scanPayload.run.summary || "", /affiliate and sponsor revenue/);

    const refreshedSessionResponse = await sessionHandler(new Request("https://example.com/api/web/session"));
    const refreshedSessionPayload = (await refreshedSessionResponse.json()) as {
      onboarding: { state: string };
      recentRuns: Array<{ workflowId: string }>;
      apiKeys: Array<{ revokedAt: string | null }>;
    };

    assert.equal(refreshedSessionPayload.onboarding.state, "ready");
    assert.equal(refreshedSessionPayload.recentRuns.length, 1);
    assert.equal(refreshedSessionPayload.recentRuns[0].workflowId, "monetization-scan");
    assert.equal(refreshedSessionPayload.apiKeys.length, 1);
    assert.ok(refreshedSessionPayload.apiKeys[0].revokedAt);

    const invalidScanResponse = await scanHandler(
      new Request("https://example.com/api/web/monetization-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ youtubeUrl: "" }),
      })
    );
    assert.equal(invalidScanResponse.status, 400);
  });
}
