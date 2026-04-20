import assert from "node:assert/strict";

import {
  InMemoryRemoteAccessStore,
  InMemoryUsageEventStore,
  type AuthPrincipal,
} from "../auth-billing/index.js";
import {
  createAdminAccountGrantCreditsHandler,
  createAdminAccountsListHandler,
} from "../http/admin-http.js";

const principal: AuthPrincipal = {
  subject: "admin-http-user",
  issuer: "https://issuer.example.com/",
  audience: "https://example.com/api",
  scope: [],
  tokenId: "t1",
  rawClaims: {},
};

export async function run(): Promise<void> {
  const remoteAccessStore = new InMemoryRemoteAccessStore();
  await remoteAccessStore.upsertAccount(principal);
  const usageEventStore = new InMemoryUsageEventStore();

  const prevToken = process.env.ADMIN_CONSOLE_TOKEN;
  process.env.ADMIN_CONSOLE_TOKEN = "test-admin-token";

  try {
    const listHandler = createAdminAccountsListHandler({ remoteAccessStore, usageEventStore });

    const unauthorized = await listHandler(new Request("http://localhost/admin/api/accounts"));
    assert.equal(unauthorized.status, 401);

    const ok = await listHandler(
      new Request("http://localhost/admin/api/accounts", {
        headers: { Authorization: "Bearer test-admin-token" },
      })
    );
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { accounts: Array<{ accountId: string }> };
    assert.equal(body.accounts.length, 1);

    const grantHandler = createAdminAccountGrantCreditsHandler({ remoteAccessStore, usageEventStore });
    const granted = await grantHandler(
      new Request("http://localhost/admin/api/account/grant-credits", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          issuer: principal.issuer,
          subject: principal.subject,
          credits: 3,
        }),
      })
    );
    assert.equal(granted.status, 200);
  } finally {
    if (prevToken === undefined) {
      delete process.env.ADMIN_CONSOLE_TOKEN;
    } else {
      process.env.ADMIN_CONSOLE_TOKEN = prevToken;
    }
  }
}
