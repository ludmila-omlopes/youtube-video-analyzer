import assert from "node:assert/strict";
import { once } from "node:events";

import express from "express";

import { registerAdminAccountRoutes } from "../app/admin-account-routes.js";
import {
  getRemoteAccountEntitlements,
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";

const principal: AuthPrincipal = {
  subject: "google-oauth2|admin-routes-user",
  issuer: "https://issuer.example.com/",
  audience: "youtube-video-analyzer-web",
  scope: [],
  tokenId: null,
  rawClaims: {},
};

export async function run(): Promise<void> {
  const remoteAccessStore = new InMemoryRemoteAccessStore();
  const usageEventStore = new InMemoryUsageEventStore();
  const account = await remoteAccessStore.upsertAccount(principal);

  const app = express();
  registerAdminAccountRoutes(app, {
    remoteAccessStore,
    usageEventStore,
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve admin test server address.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const lookupResponse = await fetch(
      `${baseUrl}/admin/api/account?issuer=${encodeURIComponent(principal.issuer)}&subject=${encodeURIComponent(principal.subject)}`
    );
    assert.equal(lookupResponse.status, 200);
    const lookupPayload = (await lookupResponse.json()) as {
      account: { plan: string; entitlements: unknown };
    };
    assert.equal(lookupPayload.account.plan, "trial");
    assert.deepEqual(lookupPayload.account.entitlements, getRemoteAccountEntitlements("trial"));

    const updatePlanResponse = await fetch(`${baseUrl}/admin/api/account/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: account.accountId,
        plan: "pro",
      }),
    });
    assert.equal(updatePlanResponse.status, 200);
    const updatePlanPayload = (await updatePlanResponse.json()) as {
      account: { plan: string; entitlements: unknown };
    };
    assert.equal(updatePlanPayload.account.plan, "pro");
    assert.deepEqual(updatePlanPayload.account.entitlements, getRemoteAccountEntitlements("pro"));

    const grantCreditsResponse = await fetch(`${baseUrl}/admin/api/account/grant-credits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: account.accountId,
        credits: 5,
      }),
    });
    assert.equal(grantCreditsResponse.status, 200);
    const grantCreditsPayload = (await grantCreditsResponse.json()) as {
      grantedCredits: number;
      account: { creditBalance: number };
    };
    assert.equal(grantCreditsPayload.grantedCredits, 5);
    assert.equal(grantCreditsPayload.account.creditBalance, account.creditBalance + 5);

    const usageEvents = await usageEventStore.listForAccount(account.accountId);
    assert.equal(usageEvents.length, 2);
    assert.equal(usageEvents[0].kind, "credits.granted");
    assert.equal(usageEvents[1].kind, "account.plan_changed");
    assert.equal(usageEvents[0].creditsDelta, 5);

    const invalidPlanResponse = await fetch(`${baseUrl}/admin/api/account/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountId: account.accountId,
        plan: "enterprise",
      }),
    });
    assert.equal(invalidPlanResponse.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
